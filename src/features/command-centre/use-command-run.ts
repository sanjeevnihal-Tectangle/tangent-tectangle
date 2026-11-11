"use client"

import { useCallback, useRef, useState } from "react"

import type { RunErrorCode, RunEvent } from "@/lib/ai/events"
import { applyRunEvent, initialRunModel, type RunViewModel } from "@/features/command-centre/run-model"

export type StartRunResult =
  | { ok: true; conversationId: string; model: RunViewModel }
  | { ok: false; code: RunErrorCode | "network_error" | "session_expired"; message: string }

const FALLBACK_MESSAGES: Record<string, string> = {
  network_error: "Couldn't reach Tangent. Check your connection and try again.",
  session_expired: "Your session has expired. Sign in again to continue.",
}

/** Streams an orchestrator run from /api/ai/command and exposes live state. */
export function useCommandRun() {
  const [live, setLive] = useState<RunViewModel | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    async (input: {
      workspace: string
      conversationId: string | null
      message: string
      onConversation: (id: string) => void
    }): Promise<StartRunResult> => {
      const controller = new AbortController()
      abortRef.current = controller
      let model = initialRunModel()
      setLive(model)

      let response: Response
      try {
        response = await fetch("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace: input.workspace,
            conversationId: input.conversationId,
            message: input.message,
          }),
          signal: controller.signal,
        })
      } catch {
        setLive(null)
        return { ok: false, code: "network_error", message: FALLBACK_MESSAGES.network_error! }
      }

      const contentType = response.headers.get("content-type") ?? ""
      if (!response.ok || !contentType.includes("application/x-ndjson") || !response.body) {
        setLive(null)
        if (contentType.includes("application/json")) {
          const body = (await response.json().catch(() => null)) as { code?: RunErrorCode; message?: string } | null
          return { ok: false, code: body?.code ?? "internal_error", message: body?.message ?? "Request failed." }
        }
        return { ok: false, code: "session_expired", message: FALLBACK_MESSAGES.session_expired! }
      }

      const conversationId = response.headers.get("x-conversation-id") ?? input.conversationId ?? ""
      if (conversationId) input.onConversation(conversationId)

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            model = applyRunEvent(model, JSON.parse(line) as RunEvent)
          }
          setLive(model)
        }
      } catch {
        if (controller.signal.aborted) {
          model = applyRunEvent(model, { type: "run.failed", code: "cancelled", message: "You stopped this run." })
        } else {
          model = applyRunEvent(model, { type: "run.failed", code: "network_error", message: "The connection dropped before the run finished." })
        }
      }
      if (model.status === "running") {
        model = applyRunEvent(model, { type: "run.failed", code: "internal_error", message: "The run ended unexpectedly." })
      }
      setLive(null)
      abortRef.current = null
      return { ok: true, conversationId, model }
    },
    []
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { live, start, stop, running: live !== null }
}
