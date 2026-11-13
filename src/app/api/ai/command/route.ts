import { NextResponse } from "next/server"
import { z } from "zod"

import type { RunErrorCode, RunEvent } from "@/lib/ai/events"
import { getImageProvider } from "@/lib/ai/image-provider"
import { quotaError } from "@/lib/ai/metering"
import { runOrchestrator, type OrchestratorResult } from "@/lib/ai/orchestrator"
import { getModelProvider } from "@/lib/ai/provider"
import {
  checkEntitlement,
  creditsForTokens,
  DEFAULT_PLANS,
  ESTIMATED_CREDITS_PER_RUN,
} from "@/lib/billing/plans"
import type { StoredMessage } from "@/lib/domain/conversations"
import { serverEnv } from "@/lib/env/server"
import { resolveWorkspace } from "@/lib/workspace/server"

export const maxDuration = 300

const requestSchema = z.object({
  workspace: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(64).nullable(),
  message: z.string().trim().min(2, "Write an instruction").max(4000),
})

function errorResponse(code: RunErrorCode, message: string, status: number) {
  return NextResponse.json({ code, message }, { status })
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return errorResponse("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request", 400)
  }
  const { workspace, conversationId, message } = parsed.data

  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("ai.run")) {
    return errorResponse("forbidden", "Your role does not allow running AI agents in this workspace.", 403)
  }

  const provider = getModelProvider()
  if (!provider) {
    return errorResponse("ai_not_configured", "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server environment.", 503)
  }

  const used = context.usage.find((u) => u.key === "ai_credits_monthly")?.used ?? 0
  const quota = checkEntitlement(
    DEFAULT_PLANS[context.workspace.planId].entitlements,
    "ai_credits_monthly",
    used,
    ESTIMATED_CREDITS_PER_RUN
  )
  if (!quota.allowed) {
    return errorResponse("quota_exceeded", "This workspace has used its AI credits for the month.", 402)
  }

  let history: StoredMessage[] = []
  let conversation: { id: string } | null
  if (conversationId) {
    const existing = await repository.getConversation(conversationId)
    conversation = existing
    history = existing?.messages ?? []
  } else {
    conversation = await repository.createConversation(
      message.length > 60 ? `${message.slice(0, 57)}…` : message
    )
  }
  if (!conversation) {
    return errorResponse("invalid_request", "Conversation not found.", 404)
  }
  const activeConversationId = conversation.id

  const userMessage: StoredMessage = {
    id: crypto.randomUUID(),
    role: "user",
    text: message,
    createdAt: new Date().toISOString(),
    run: null,
  }
  await repository.appendMessage(activeConversationId, userMessage)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      const generator = runOrchestrator({
        provider,
        repository,
        conversationId: activeConversationId,
        history,
        message,
        maxSteps: serverEnv().AI_MAX_STEPS_PER_RUN,
        images: {
          provider: getImageProvider(),
          quotaError: quotaError(context, "image_generations_monthly", 1),
        },
        signal: request.signal,
      })

      let result: OrchestratorResult | undefined
      try {
        while (true) {
          const next = await generator.next()
          if (next.done) {
            result = next.value
            break
          }
          send(next.value)
        }
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[tangent] command stream failed", error)
          send({ type: "run.failed", code: "internal_error", message: "The run stopped unexpectedly." })
        }
      }

      if (result) {
        try {
          await repository.appendMessage(activeConversationId, {
            id: crypto.randomUUID(),
            role: "assistant",
            text: result.text || (result.run.error?.message ?? ""),
            createdAt: new Date().toISOString(),
            run: result.run,
          })
          await repository.recordAgentRun(result.log)
          const totalTokens = result.usage.inputTokens + result.usage.outputTokens
          if (totalTokens > 0) {
            await repository.recordUsage("ai_credits_monthly", creditsForTokens(totalTokens), {
              runId: result.run.runId,
              tokens: totalTokens,
            })
          }
          await repository.recordAudit({
            action: result.run.status === "completed" ? "ai.run.completed" : "ai.run.failed",
            entityType: "agent_run",
            entityId: result.run.runId,
            summary: result.run.intent ?? message.slice(0, 140),
            actor: { type: "user", id: context.user.id },
            metadata: { steps: result.run.steps.length, actionsRequested: result.run.actions.length },
          })
        } catch (error) {
          console.error("[tangent] failed to persist run", error)
        }
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": activeConversationId,
    },
  })
}
