import "server-only"

import { ACTIVE_AGENT_IDS, AGENTS } from "@/lib/ai/agents/definitions"
import { outputToText, runAgentTask, SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import type { GeneratedAsset, GeneratedCreative, PlannedStep, RequiredAction, RunEvent } from "@/lib/ai/events"
import type { ImageAspect, ImageProvider } from "@/lib/ai/image-provider"
import { executionPlanSchema, type AgentOutput, type CopyOutput, type CreativeOutput, type ExecutionPlan } from "@/lib/ai/outputs"
import { normalizePlan, type NormalizedStep } from "@/lib/ai/plan"
import { ProviderError, type ModelProvider, type TokenUsage } from "@/lib/ai/provider"
import { validateOutputs } from "@/lib/ai/validation"
import type { AgentRunLog, WorkspaceRepository } from "@/lib/data/types"
import type { RunRecord, StoredMessage } from "@/lib/domain/conversations"
import {
  canonicalProvider,
  connectionsContextText,
  summarizeConnections,
  type PlatformConnection,
} from "@/lib/integrations/connections"
import { createAgentDesign, designComposeContext } from "@/lib/creative/agent-design"
import { getFormat } from "@/lib/creative/formats"
import { matchProduct, type Product } from "@/lib/domain/product"
import { prepareExternalActions } from "@/lib/publishing/prepare"

export interface OrchestratorInput {
  provider: ModelProvider
  repository: WorkspaceRepository
  conversationId: string
  history: StoredMessage[]
  message: string
  maxSteps: number
  /** Business name fallback for designs when no business profile exists. */
  workspaceName: string
  /** Image generator available to the Graphic Designer (null when not configured) and the plan quota check. */
  images: { provider: ImageProvider | null; quotaError: string | null }
  signal?: AbortSignal
}

export interface OrchestratorResult {
  run: RunRecord
  text: string
  usage: TokenUsage
  log: AgentRunLog
}

const IMAGE_STEP_ID = "tool-image"
const PUBLISH_STEP_ID = "tool-publish"
const DESIGN_STEP_ID = "tool-design"

const PLANNER_SYSTEM = `${SHARED_RULES}

You are the Tangent Orchestrator. Turn the user's request into an execution plan, split into steps, each assigned to the
right specialist agent. Later steps receive earlier outputs.
Available agents (only these can be assigned):
${ACTIVE_AGENT_IDS.map((id) => `- ${id}: ${AGENTS[id].summary}`).join("\n")}

Tools Tangent runs for the agents (do not plan steps for these; they run automatically):
- Image generation: when produceImage is true, the Graphic Designer's first concept is rendered into a real image and saved to the Asset Library.
- Creative Studio: Tangent then builds an editable Creative Studio design (layout, headline, CTA, feature callouts with
  icons, patterns and graphic accents in the brand's style, logo, and the image if any). That design is what gets
  published, and the user can edit it before approving. Following the brand kit, the image may be a photo, an
  illustration, a 3D render, the product's own image from the catalogue, or none (purely graphic design).
- Publishing: each publish_post in externalActions on a platform listed as connected and ready becomes an approval card.
  When the user approves it in the app, Tangent publishes it with the connected account and shows the post link.

Planning rules:
- productNames: when the request is about a product or service in the catalogue (by name, nickname or clear description),
  list its exact catalogue name. Tangent then uses that product's details and its own brand kit for every agent and design.
- Fill requestBrief with everything specific the user asked for (their words, product, offer, audience, CTA, link, tone,
  format, platforms, must-include/avoid). Every agent receives it, so put the user's exact requirements there.
- Write each step instruction so the agent delivers exactly what was asked (e.g. "Write one Instagram caption announcing
  <product> for <audience> with CTA <cta>"), not a generic task.
- Use the fewest steps that fully answer the request (usually 1–3). Order steps so later steps can build on earlier ones.
- Read "Connected platforms": it is the live connection status for this workspace. Never say an account is not connected
  when it is listed as ready, and never say Tangent can't see the integrations.
- When the user wants a social post, creative, poster or visual made, set produceImage to true and include a graphic_designer
  step that produces ONE strong concept (the first concept is the one rendered).
- When the user wants something posted or published, include a copywriter step that writes one caption variant per target
  platform with the platform field set to exactly "Instagram", "Facebook", etc., and add one publish_post external action per
  platform (platform = the platform name). Use schedule_post only when the user explicitly asks to schedule for later.
- Launching ads, changing budgets/targeting and other spend are external actions that always need approval; plan drafts for them.
- Put anything that needs capabilities Tangent lacks (live analytics, competitor scraping, SEO crawling, video production,
  platforms that are not connected) in limitations, and plan the best help you can.`

const PRESENTER_SYSTEM = `${SHARED_RULES}

You are Tangent presenting the work of the marketing team to the user. Write a concise response (80–180 words):
what was produced, the key recommendation, anything that needs attention (validation issues, limitations) and the next step.
The detailed outputs, generated images and approval cards are shown to the user below your message, so do not repeat them in full.
Describe the status of images and publishing exactly as given under "Tool results": if a post is awaiting approval, tell the
user to review it and press Approve & publish; never say it was published, and never tell the user to design the image
themselves when an image was generated. Use the connected platform status as given; never claim Tangent can't see integrations.
Plain text only: short paragraphs and "- " bullets; **bold** sparingly. No headings, no tables.`

function historyText(history: StoredMessage[]): string {
  return history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Tangent"}: ${m.text.slice(0, 1200)}`)
    .join("\n")
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
  }
}

function connectionSourceDetail(connections: PlatformConnection[]): string {
  if (connections.length === 0) return "No platforms connected"
  return connections.map((c) => `${c.label} (${c.usable ? "ready" : "needs attention"})`).join(", ")
}

/** Instagram needs 4:5–1.91:1, so a planned Instagram post forces a square image. */
function aspectForImage(concept: CreativeOutput["concepts"][number], plan: ExecutionPlan): ImageAspect {
  if (plan.externalActions.some((a) => canonicalProvider(a.platform) === "instagram")) return "square"
  const match = /(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/.exec(concept.aspectRatio)
  if (!match) return "square"
  const ratio = Number(match[1]) / Number(match[2])
  if (ratio > 1.15) return "landscape"
  if (ratio < 0.87) return "portrait"
  return "square"
}

type ImageryMode = "photo" | "illustration" | "3d" | "graphic"

/** What kind of image the brand wants for this concept ("mixed" picks from the concept's wording). */
function imageryMode(context: { brand: { visualStyle: { imageStyle: string } } | null }, concept: CreativeOutput["concepts"][number] | undefined): ImageryMode {
  const style = context.brand?.visualStyle.imageStyle ?? "mixed"
  if (style === "photo" || style === "illustration" || style === "3d" || style === "graphic") return style
  const words = `${concept?.visualDirection ?? ""} ${concept?.imagePrompt ?? ""}`.toLowerCase()
  if (/\b3d\b|render/.test(words)) return "3d"
  if (/illustrat|vector|cartoon|flat design|isometric/.test(words)) return "illustration"
  return "photo"
}

function stylePrompt(mode: ImageryMode, illustrationStyle: string, colors: string[]): string {
  const palette = colors.length ? ` Use the brand colours ${colors.join(", ")}.` : ""
  switch (mode) {
    case "illustration":
      return `Style: clean modern flat vector illustration${illustrationStyle ? ` (${illustrationStyle})` : ""}, simple shapes, plain light background, no gradients noise.${palette}`
    case "3d":
      return `Style: soft 3D render, clay/plastic materials, studio lighting, plain light background.${palette}`
    default:
      return "Style: natural, high-quality photography."
  }
}

/** Orders tool steps after the steps they depend on. */
function withToolSteps(steps: NormalizedStep[], plan: ExecutionPlan): (NormalizedStep & { kind: "agent" | "tool" })[] {
  const ordered: (NormalizedStep & { kind: "agent" | "tool" })[] = []
  const lastDesigner = steps.map((s) => s.agentId).lastIndexOf("graphic_designer")
  steps.forEach((step, index) => {
    ordered.push({ ...step, kind: "agent" })
    if (plan.produceImage && index === lastDesigner) {
      ordered.push({
        id: IMAGE_STEP_ID,
        agentId: "graphic_designer",
        title: "Generate the image and save it to the Asset Library",
        instruction: "",
        kind: "tool",
      })
    }
  })
  if (plan.produceImage && lastDesigner >= 0) {
    // After every agent step, so the design uses the final copy as well as the image.
    ordered.push({
      id: DESIGN_STEP_ID,
      agentId: "graphic_designer",
      title: "Build the editable design in Creative Studio",
      instruction: "",
      kind: "tool",
    })
  }
  if (plan.externalActions.length > 0) {
    ordered.push({
      id: PUBLISH_STEP_ID,
      agentId: "social_media_manager",
      title: "Prepare posts on connected accounts for your approval",
      instruction: "",
      kind: "tool",
    })
  }
  return ordered
}

/**
 * Runs one Command Centre request: understand → retrieve context (business,
 * brand and live connection status) → plan → execute agent and tool steps →
 * validate → prepare approvals → present. External actions become approval
 * requests on connected accounts and are executed only when a human approves
 * them (see lib/publishing/executor.ts). Yields progress events as it goes.
 */
export async function* runOrchestrator(
  input: OrchestratorInput
): AsyncGenerator<RunEvent, OrchestratorResult> {
  const { provider, repository, message, signal } = input
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  const today = startedAt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

  const run: RunRecord = {
    runId,
    status: "completed",
    intent: null,
    taskType: null,
    steps: [],
    contextSources: [],
    outputs: [],
    validation: [],
    actions: [],
    assets: [],
    creatives: [],
    toolSteps: {},
    limitations: [],
    error: null,
    durationMs: null,
  }
  const tasks: AgentRunLog["tasks"] = []
  const modelsUsed = new Set<string>()
  const toolResults: string[] = []

  const finish = (text: string): OrchestratorResult => {
    const completedAt = new Date()
    run.durationMs = completedAt.getTime() - startedAt.getTime()
    return {
      run,
      text,
      usage,
      log: {
        runId,
        conversationId: input.conversationId,
        status: run.status,
        intent: run.intent,
        taskType: run.taskType,
        model: modelsUsed.size ? [...modelsUsed].join(", ") : null,
        usage,
        error: run.error,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        tasks,
      },
    }
  }

  yield { type: "run.started", runId, conversationId: input.conversationId, startedAt: startedAt.toISOString() }

  try {
    yield { type: "stage", stage: "understanding", status: "active" }
    yield { type: "stage", stage: "understanding", status: "done" }

    yield { type: "stage", stage: "context", status: "active" }
    let context = await loadBusinessContext(repository)
    let connections: PlatformConnection[] = []
    try {
      connections = summarizeConnections(await repository.listConnectedAccounts())
    } catch (error) {
      console.error("[tangent] could not load connected accounts", error)
    }
    const connectionText = connectionsContextText(connections)
    let agentContext = `${context.text}\n\n## Connected platforms\n${connectionText}`
    run.contextSources = [...context.sources, { label: "Connected platforms", detail: connectionSourceDetail(connections) }]
    yield { type: "context", sources: run.contextSources }
    yield { type: "stage", stage: "context", status: "done" }

    yield { type: "stage", stage: "planning", status: "active" }
    const planResult = await provider.generateStructured({
      tier: "fast",
      system: PLANNER_SYSTEM,
      input: [
        `Today: ${today}`,
        `## Business context\n${agentContext}`,
        input.history.length ? `## Conversation so far\n${historyText(input.history)}` : null,
        `## New request\n${message}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      schema: executionPlanSchema,
      schemaName: "execution_plan",
      // Reasoning models spend part of this budget thinking before they answer.
      maxOutputTokens: 6000,
      signal,
    })
    usage = addUsage(usage, planResult.usage)
    modelsUsed.add(planResult.model)
    // Instagram can't publish without an image, so a post planned for Instagram
    // always gets one, even when the planner didn't flag produceImage.
    const needsImage = planResult.data.externalActions.some(
      (a) => a.actionType === "publish_post" && canonicalProvider(a.platform) === "instagram"
    )
    const plan = needsImage ? { ...planResult.data, produceImage: true } : planResult.data
    // The product the request is about: its details and its brand kit drive every agent and the design.
    const focus = plan.productNames.map((name) => matchProduct(context.products, name)).find((p): p is Product => p !== null) ?? null
    if (focus) {
      context = await loadBusinessContext(repository, undefined, focus.id)
      agentContext = `${context.text}\n\n## Connected platforms\n${connectionText}`
      run.contextSources = [
        ...context.sources,
        { label: "Connected platforms", detail: connectionSourceDetail(connections) },
      ]
      yield { type: "context", sources: run.contextSources }
    }
    const normalized = normalizePlan(plan, input.maxSteps)
    const agentSteps = [...normalized.steps]
    if (plan.produceImage && !agentSteps.some((s) => s.agentId === "graphic_designer")) {
      if (agentSteps.length < input.maxSteps) {
        agentSteps.push({
          id: `step-${agentSteps.length + 1}`,
          agentId: "graphic_designer",
          title: "Design the post visual",
          instruction: `Create one strong, on-brand concept with a generation-ready image prompt for: ${plan.intent}`,
        })
      } else {
        normalized.dropped.push("Design the post visual")
      }
    }
    const steps = withToolSteps(agentSteps, plan)
    run.intent = plan.intent
    run.taskType = plan.taskType
    run.steps = steps.map(({ id, agentId, title, kind }): PlannedStep => (kind === "tool" ? { id, agentId, title, kind } : { id, agentId, title }))
    run.limitations = [
      ...plan.limitations,
      ...normalized.dropped.map((title) => `Skipped "${title}" to stay within per-run agent limits.`),
    ]
    yield { type: "plan", intent: plan.intent, taskType: plan.taskType, steps: run.steps, limitations: run.limitations }
    yield { type: "stage", stage: "planning", status: "done" }

    yield { type: "stage", stage: "executing", status: "active" }
    const produced: { output: AgentOutput; text: string; title: string }[] = []
    let failedSteps = 0
    let image: (GeneratedAsset & { mimeType: string }) | null = null
    let creative: GeneratedCreative | null = null
    let imageKind: "photo" | "illustration" | "3d render" | "product image" = "photo"
    const requestText = plan.requestBrief.trim() ? `${message}\n\nSpecifics the user asked for:\n${plan.requestBrief.trim()}` : message
    let imageIssue: string | null = plan.produceImage ? null : "No image was requested in the plan."
    const toolDone = (stepId: string) => {
      run.toolSteps![stepId] = { status: "done", error: null }
    }
    const toolFailed = (stepId: string, error: string) => {
      run.toolSteps![stepId] = { status: "failed", error }
    }

    for (const [index, step] of steps.entries()) {
      signal?.throwIfAborted()
      yield { type: "step.started", stepId: step.id }

      if (step.id === IMAGE_STEP_ID) {
        // Tool: render the designer's first concept and save it to the Asset Library.
        const concept = [...produced].reverse().find((p) => p.output.kind === "creative")?.output as
          | { kind: "creative"; data: CreativeOutput }
          | undefined
        const first = concept?.data.concepts[0]
        const mode = imageryMode(context, first)
        const productImageId = context.product?.imageAssetIds[0] ?? null
        if (productImageId && mode !== "illustration" && mode !== "3d") {
          // Use the product's own photo or screenshot rather than inventing one.
          const urls = await repository.resolveAssetUrls([productImageId]).catch(() => ({}) as Record<string, string>)
          const ref: GeneratedAsset = {
            stepId: step.id,
            assetId: productImageId,
            name: `${context.product?.name ?? "Product"} image`,
            url: urls[productImageId] ?? null,
            prompt: "Product image from the catalogue",
            width: null,
            height: null,
          }
          image = { ...ref, mimeType: "image/unknown" }
          imageKind = "product image"
          run.assets!.push(ref)
          toolDone(step.id)
          toolResults.push(`Used the product image of "${context.product?.name}" from the catalogue instead of generating one.`)
          yield { type: "asset.generated", asset: ref }
          yield { type: "tool.completed", stepId: step.id }
          continue
        }
        if (mode === "graphic") {
          // The brand designs with shapes, icons and patterns rather than photos.
          imageIssue = null
          toolDone(step.id)
          toolResults.push("No photo generated: the brand kit uses graphic designs (shapes, icons, patterns).")
          yield { type: "tool.completed", stepId: step.id }
          continue
        }
        const reason = !input.images.provider
          ? "Image generation isn't configured on the server (set IMAGE_PROVIDER=openai and an OpenAI API key with image credits)."
          : input.images.quotaError
            ? input.images.quotaError
            : !first?.imagePrompt
              ? "The Graphic Designer didn't produce an image prompt to render."
              : null
        if (reason || !input.images.provider || !first) {
          imageIssue = reason ?? "Image generation is unavailable."
          toolFailed(step.id, imageIssue)
          toolResults.push(`Image generation failed: ${imageIssue}`)
          yield { type: "step.failed", stepId: step.id, message: imageIssue }
          continue
        }
        const prompt = `${first.imagePrompt}\n\n${stylePrompt(mode, context.brand?.visualStyle.illustrationStyle ?? "", (context.brand?.colors ?? []).map((c) => c.hex))}\nDo not render any text, letters, logos or watermarks in the image.`.slice(0, 2000)
        try {
          const generated = await input.images.provider.generate({ prompt, aspect: aspectForImage(first, plan), format: "jpeg", signal })
          const asset = await repository.uploadAsset({
            name: `${first.name || "AI creative"}`.slice(0, 60),
            mimeType: generated.mimeType,
            bytes: generated.bytes,
            width: generated.width,
            height: generated.height,
            tags: ["ai-generated", "command-centre"],
            source: "ai_generated",
            generation: { provider: generated.provider, model: generated.model, prompt },
          })
          await repository.recordUsage("image_generations_monthly", 1, { model: generated.model, runId })
          await repository.recordAudit({
            action: "asset.generated",
            entityType: "media_asset",
            entityId: asset.id,
            summary: `Graphic Designer generated "${asset.name}" in the Command Centre`,
            actor: { type: "agent", id: "graphic_designer" },
            metadata: { runId },
          })
          const ref: GeneratedAsset = {
            stepId: step.id,
            assetId: asset.id,
            name: asset.name,
            url: asset.url,
            prompt,
            width: asset.width,
            height: asset.height,
          }
          image = { ...ref, mimeType: asset.mimeType }
          imageKind = mode === "illustration" ? "illustration" : mode === "3d" ? "3d render" : "photo"
          run.assets!.push(ref)
          toolDone(step.id)
          toolResults.push(`Generated image "${asset.name}" and saved it to the Asset Library.`)
          yield { type: "asset.generated", asset: ref }
          yield { type: "tool.completed", stepId: step.id }
        } catch (error) {
          if (signal?.aborted) throw error
          imageIssue =
            error instanceof ProviderError
              ? `Image generation failed: ${error.message}`
              : error instanceof Error && /Supabase Storage|Upload file/.test(error.message)
                ? `The image couldn't be saved to the Asset Library: ${error.message}`
                : "Image generation failed."
          if (!(error instanceof ProviderError)) console.error("[tangent] image generation failed", error)
          toolFailed(step.id, imageIssue)
          toolResults.push(imageIssue)
          yield { type: "step.failed", stepId: step.id, message: imageIssue }
        }
        continue
      }

      if (step.id === DESIGN_STEP_ID) {
        // Tool: compose an editable Creative Studio design from the image, concept and copy.
        const targets = plan.externalActions.map((a) => canonicalProvider(a.platform))
        const format = getFormat(targets.includes("instagram") || !targets.includes("facebook") ? "instagram_post" : "facebook_post")
        const concept = (
          [...produced].reverse().find((p) => p.output.kind === "creative")?.output as { kind: "creative"; data: CreativeOutput } | undefined
        )?.data.concepts[0]
        const variant = produced.flatMap((p) => (p.output.kind === "copy" ? (p.output.data as CopyOutput).variants : []))[0]
        try {
          const { ctx, brandProfileId, brandStyleText } = await designComposeContext(
            repository,
            input.workspaceName,
            format,
            image?.assetId ?? null,
            context.brand?.id
          )
          const designed = await createAgentDesign({
            provider,
            repository,
            format,
            objective: "awareness",
            request: requestText,
            businessContext: context.text,
            concept: concept
              ? { name: concept.name, visualDirection: concept.visualDirection, imagePrompt: concept.imagePrompt, copyOverlay: concept.copyOverlay }
              : null,
            copy: variant ? { headline: variant.headline, body: variant.body, callToAction: variant.callToAction } : null,
            compose: ctx,
            brandProfileId,
            brandStyle: brandStyleText,
            imageKind,
            signal,
          })
          usage = addUsage(usage, designed.usage)
          modelsUsed.add(designed.model)
          await repository.recordAudit({
            action: "creative.created",
            entityType: "creative_project",
            entityId: designed.project.id,
            summary: `Graphic Designer built "${designed.project.name}" in Creative Studio`,
            actor: { type: "agent", id: "graphic_designer" },
            metadata: { runId },
          })
          creative = {
            stepId: step.id,
            projectId: designed.project.id,
            name: designed.project.name,
            formatId: format.id,
            width: format.width,
            height: format.height,
          }
          run.creatives!.push(creative)
          toolDone(step.id)
          toolResults.push(
            `Built the editable Creative Studio design "${designed.project.name}" (headline "${designed.spec.headline}"). It is the image that will be published; the user can edit it in Creative Studio before approving.`
          )
          yield { type: "creative.created", creative }
          yield { type: "tool.completed", stepId: step.id }
        } catch (error) {
          if (signal?.aborted) throw error
          const issue =
            error instanceof ProviderError
              ? `The Creative Studio design couldn't be built: ${error.message}.${image ? " The post will use the image instead." : ""}`
              : `The Creative Studio design couldn't be built.${image ? " The post will use the image instead." : ""}`
          if (!(error instanceof ProviderError)) console.error("[tangent] design step failed", error)
          toolFailed(step.id, issue)
          toolResults.push(issue)
          yield { type: "step.failed", stepId: step.id, message: issue }
        }
        continue
      }

      if (step.id === PUBLISH_STEP_ID) {
        // Tool: turn requested external actions into approval requests on connected accounts.
        const checks = validateOutputs(produced, failedSteps, context.brand?.prohibitedMessaging ?? [])
        const prohibited = checks.find((c) => c.label === "Prohibited messaging" && c.status === "fail")
        const prepared = prepareExternalActions({
          externalActions: plan.externalActions,
          connections,
          copies: produced.flatMap((p) => (p.output.kind === "copy" ? [p.output.data as CopyOutput] : [])),
          image,
          creative: creative ? { projectId: creative.projectId } : null,
          imageIssue,
          validationIssue: prohibited ? `Brand check failed — ${prohibited.detail}` : null,
          title: plan.intent,
        })
        for (const { action, payload } of prepared) {
          let required: RequiredAction = action
          if (payload) {
            // Accounts added without a token (e.g. direct connect with only a handle) can't publish.
            let hasToken = false
            try {
              hasToken = Boolean(await repository.getConnectedAccountCredential(payload.connectedAccountId))
            } catch (error) {
              console.error("[tangent] could not check the stored credential", error)
            }
            if (!hasToken) {
              required = {
                ...action,
                state: "blocked",
                reason: `"${payload.accountName}" is listed as connected but no access token is stored for it, so Tangent can't post with it. Reconnect it with "Add / Connect" (OAuth) on the Integrations page.`,
              }
              toolResults.push(`${action.platform}: blocked — ${required.reason}`)
              run.actions.push(required)
              yield { type: "action.required", action: required }
              continue
            }
          }
          if (payload) {
            const request = {
              actionType: action.actionType,
              title: `${action.platform} post for ${payload.accountName}: ${payload.title}`.slice(0, 200),
              payload: { ...payload },
              requestedByAgent: "social_media_manager",
            }
            try {
              let approval
              try {
                approval = await repository.createApprovalRequest({ ...request, connectedAccountId: payload.connectedAccountId })
              } catch {
                // Accounts held only in the local integration store have no database row to reference.
                approval = await repository.createApprovalRequest(request)
              }
              required = { ...action, approvalId: approval.id }
              toolResults.push(`${action.platform} post for ${payload.accountName} is ready and awaiting the user's approval (not published yet).`)
            } catch (error) {
              console.error("[tangent] could not create approval request", error)
              required = { ...action, state: "blocked", reason: "The approval request could not be saved. Try again." }
            }
          }
          if (required.state !== "awaiting_approval") {
            toolResults.push(`${required.platform} — ${required.actionType}: ${required.state.replace("_", " ")}. ${required.reason ?? ""}`)
          }
          run.actions.push(required)
          yield { type: "action.required", action: required }
        }
        toolDone(step.id)
        yield { type: "tool.completed", stepId: step.id }
        continue
      }

      try {
        const result = await runAgentTask(
          provider,
          step.agentId,
          {
            userRequest: requestText,
            instruction: step.instruction,
            businessContext: agentContext,
            priorOutputs: produced.map((p) => `### ${p.title}\n${p.text}`).join("\n\n"),
            today,
          },
          signal
        )
        usage = addUsage(usage, result.usage)
        modelsUsed.add(result.model)
        const text = outputToText(result.output)
        produced.push({ output: result.output, text, title: step.title })
        run.outputs.push({ stepId: step.id, agentId: step.agentId, title: step.title, output: result.output })
        tasks.push({ sequence: index + 1, agentId: step.agentId, title: step.title, instruction: step.instruction, status: "completed", output: result.output, error: null })
        yield { type: "step.completed", stepId: step.id, output: result.output }
      } catch (error) {
        if (signal?.aborted) throw error
        failedSteps += 1
        const reason = error instanceof ProviderError ? error.message : "The agent could not complete this step."
        tasks.push({ sequence: index + 1, agentId: step.agentId, title: step.title, instruction: step.instruction, status: "failed", output: null, error: reason })
        yield { type: "step.failed", stepId: step.id, message: reason }
      }
    }
    yield { type: "stage", stage: "executing", status: "done" }

    yield { type: "stage", stage: "validating", status: "active" }
    run.validation = validateOutputs(produced, failedSteps, context.brand?.prohibitedMessaging ?? [])
    yield { type: "validation", checks: run.validation }
    yield { type: "stage", stage: "validating", status: "done" }

    yield { type: "stage", stage: "presenting", status: "active" }
    let text = ""
    for await (const chunk of provider.streamText({
      tier: "fast",
      system: PRESENTER_SYSTEM,
      input: [
        `## User request\n${message}`,
        `## Plan\n${plan.intent}`,
        `## Connected platforms\n${connectionText}`,
        produced.length
          ? `## Outputs\n${produced.map((p) => `### ${p.title}\n${p.text}`).join("\n\n")}`
          : "## Outputs\nNo outputs were produced.",
        toolResults.length ? `## Tool results\n${toolResults.map((r) => `- ${r}`).join("\n")}` : null,
        `## Validation\n${run.validation.map((c) => `${c.label}: ${c.status} — ${c.detail}`).join("\n")}`,
        run.limitations.length ? `## Limitations\n${run.limitations.join("\n")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxOutputTokens: 800,
      signal,
    })) {
      if (chunk.type === "delta") {
        text += chunk.text
        yield { type: "message.delta", text: chunk.text }
      } else {
        usage = addUsage(usage, chunk.usage)
        modelsUsed.add(chunk.model)
      }
    }
    yield { type: "stage", stage: "presenting", status: "done" }

    if (failedSteps > 0 && produced.length === 0) {
      run.status = "failed"
      run.error = { code: "provider_error", message: "All agent steps failed." }
    }
    const result = finish(text)
    yield { type: "run.completed", durationMs: run.durationMs ?? 0, usage }
    return result
  } catch (error) {
    run.status = "failed"
    run.error = {
      code: error instanceof ProviderError ? "provider_error" : "internal_error",
      message: error instanceof ProviderError ? error.message : "Something went wrong while running the agents.",
    }
    if (!(error instanceof ProviderError)) console.error("[tangent] orchestrator error", error)
    yield { type: "run.failed", code: run.error.code, message: run.error.message }
    return finish("")
  }
}
