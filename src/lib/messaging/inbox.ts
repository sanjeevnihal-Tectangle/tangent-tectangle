import "server-only"

import { z } from "zod"

import { getModelProvider } from "@/lib/ai/provider"
import type {
  ConversationMessage,
  ConversationThread,
  InboxAutoReplyMode,
  InboxChannel,
  IntakeThreadState,
  MessagingSettings,
} from "@/lib/domain/messaging"
import {
  conversationMessageSchema,
  conversationThreadSchema,
  defaultIntakeQuestions,
  defaultMessagingSettings,
  emptyIntakeState,
  intakeThreadStateSchema,
  type IntakeBranchAction,
  type IntakeQuestion,
} from "@/lib/domain/messaging"
import { loadAccessToken } from "@/lib/integrations/credentials"
import { IntegrationError } from "@/lib/integrations/gateway"
import {
  resolveWhatsappAccountIds,
  sendWhatsappTextMessage,
} from "@/lib/integrations/whatsapp"
import { resolvePageForInstagram } from "@/lib/messaging/instagram-sync"
import type { SupabaseClient } from "@supabase/supabase-js"

const META_GRAPH_VERSION = "v21.0"

const inboundUnderstandingSchema = z.object({
  intent: z
    .enum([
      "greeting",
      "faq_pricing",
      "faq_hours",
      "faq_product",
      "support",
      "sales_lead",
      "opt_out",
      "other",
    ])
    .describe("Primary intent of the inbound message"),
  sentiment: z.enum(["positive", "neutral", "negative", "urgent"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(280),
  draftReply: z.string().max(1000),
  shouldAutoReply: z
    .boolean()
    .describe("True only for clear FAQ intents with a safe, factual reply"),
})

export type InboundUnderstanding = z.infer<typeof inboundUnderstandingSchema>

type AdminClient = SupabaseClient

function mapThread(row: Record<string, unknown>): ConversationThread | null {
  const parsed = conversationThreadSchema.safeParse({
    id: row.id,
    channel: row.channel,
    connectedAccountId: row.connected_account_id,
    contactId: row.contact_id,
    externalThreadKey: row.external_thread_key,
    participantHandle: row.participant_handle ?? "",
    participantName: row.participant_name ?? "",
    status: row.status,
    unreadCount: row.unread_count ?? 0,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview ?? "",
    lastInboundAt: row.last_inbound_at,
    aiSummary: row.ai_summary,
    updatedAt: row.updated_at,
  })
  return parsed.success ? parsed.data : null
}

function mapMessage(row: Record<string, unknown>): ConversationMessage | null {
  const parsed = conversationMessageSchema.safeParse({
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    senderKind: row.sender_kind,
    body: row.body ?? "",
    contentType: row.content_type ?? "text",
    providerMessageId: row.provider_message_id,
    status: row.status ?? "received",
    aiIntent: row.ai_intent,
    aiSentiment: row.ai_sentiment,
    aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence),
    aiDraftReply: row.ai_draft_reply,
    aiShouldAutoReply: Boolean(row.ai_should_auto_reply),
    occurredAt: row.occurred_at,
  })
  return parsed.success ? parsed.data : null
}

export async function loadOrgMessagingSettings(
  admin: AdminClient,
  organizationId: string
): Promise<MessagingSettings> {
  const defaults = defaultMessagingSettings()
  const { data, error } = await admin
    .from("messaging_settings")
    .select(
      "quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, opt_out_keywords, default_language, inbox_ai_enabled, auto_reply_mode, auto_reply_connected_account_id, intake_flow_enabled, intake_auto_send, intake_welcome_message, intake_questions, updated_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (error || !data) {
    if (error && /intake_/i.test(error.message || "")) {
      const fallback = await admin
        .from("messaging_settings")
        .select(
          "quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, opt_out_keywords, default_language, inbox_ai_enabled, auto_reply_mode, auto_reply_connected_account_id, updated_at"
        )
        .eq("organization_id", organizationId)
        .maybeSingle()
      if (!fallback.data) return defaults
      const row = fallback.data as Record<string, unknown>
      return {
        ...defaults,
        quietHoursEnabled: Boolean(row.quiet_hours_enabled),
        quietHoursStart: String(row.quiet_hours_start ?? "21:00"),
        quietHoursEnd: String(row.quiet_hours_end ?? "08:00"),
        timezone: String(row.timezone ?? "Asia/Kolkata"),
        optOutKeywords: (row.opt_out_keywords as string[] | null) ?? ["STOP"],
        defaultLanguage: String(row.default_language ?? "en"),
        inboxAiEnabled: row.inbox_ai_enabled !== false,
        autoReplyMode: (row.auto_reply_mode as InboxAutoReplyMode) || "draft_only",
        autoReplyConnectedAccountId: (row.auto_reply_connected_account_id as string | null) ?? null,
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      }
    }
    return defaults
  }
  const row = data as Record<string, unknown>
  return {
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start ?? "21:00"),
    quietHoursEnd: String(row.quiet_hours_end ?? "08:00"),
    timezone: String(row.timezone ?? "Asia/Kolkata"),
    optOutKeywords: (row.opt_out_keywords as string[] | null) ?? ["STOP"],
    defaultLanguage: String(row.default_language ?? "en"),
    inboxAiEnabled: row.inbox_ai_enabled !== false,
    autoReplyMode: (row.auto_reply_mode as InboxAutoReplyMode) || "draft_only",
    autoReplyConnectedAccountId: (row.auto_reply_connected_account_id as string | null) ?? null,
    intakeFlowEnabled: row.intake_flow_enabled !== false,
    intakeAutoSend: Boolean(row.intake_auto_send),
    intakeWelcomeMessage:
      typeof row.intake_welcome_message === "string" && row.intake_welcome_message.trim()
        ? String(row.intake_welcome_message)
        : defaults.intakeWelcomeMessage,
    intakeQuestions: Array.isArray(row.intake_questions)
      ? (row.intake_questions as MessagingSettings["intakeQuestions"])
      : defaultIntakeQuestions(),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export function readIntakeState(metadata: Record<string, unknown> | null | undefined): IntakeThreadState {
  const raw = metadata && typeof metadata === "object" ? metadata.intake : null
  const parsed = intakeThreadStateSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : emptyIntakeState()
}

export type IntakeReplyResult = {
  draftReply: string
  intent: string
  confidence: number
  shouldAutoReply: boolean
  summary: string
  nextState: IntakeThreadState
  /** When true, intake finished and normal FAQ AI should run instead (or after). */
  handoffToAi: boolean
}

function answerMatchesKeywords(answer: string, keywords: string[]): boolean {
  const normalized = answer.trim().toLowerCase()
  if (!normalized) return false
  return keywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase()
    return needle.length > 0 && normalized.includes(needle)
  })
}

function pickIntakeBranch(
  question: IntakeQuestion,
  answer: string
): {
  label: string
  replyMessage: string
  action: IntakeBranchAction
  gotoQuestionId: string | null
} {
  for (const branch of question.branches ?? []) {
    if (branch.keywords.length === 0) continue
    if (answerMatchesKeywords(answer, branch.keywords)) {
      return {
        label: branch.label || branch.keywords.join(", "),
        replyMessage: branch.replyMessage?.trim() || "",
        action: branch.action,
        gotoQuestionId: branch.gotoQuestionId,
      }
    }
  }
  return {
    label: "fallback",
    replyMessage: question.fallbackReplyMessage?.trim() || "",
    action: question.fallbackAction || "next_question",
    gotoQuestionId: question.fallbackGotoQuestionId,
  }
}

function applyIntakeBranch(input: {
  question: IntakeQuestion
  answer: string
  state: IntakeThreadState
  questions: IntakeQuestion[]
  auto: boolean
}): IntakeReplyResult {
  const picked = pickIntakeBranch(input.question, input.answer)
  const parts: string[] = []
  if (picked.replyMessage) parts.push(picked.replyMessage)

  let askedKeys = [...input.state.askedKeys]
  let completed = false
  let handoffToAi = false

  const askQuestion = (target: IntakeQuestion | undefined) => {
    if (!target) {
      completed = true
      handoffToAi = true
      return
    }
    if (!askedKeys.includes(target.key)) askedKeys = [...askedKeys, target.key]
    parts.push(target.prompt)
  }

  switch (picked.action) {
    case "complete":
      completed = true
      handoffToAi = false
      break
    case "ai":
      completed = true
      handoffToAi = parts.length === 0
      break
    case "goto_question": {
      const target = input.questions.find((q) => q.id === picked.gotoQuestionId)
      askQuestion(target)
      break
    }
    case "next_question": {
      const next = input.questions.find((q) => !askedKeys.includes(q.key))
      if (next) askQuestion(next)
      else {
        completed = true
        handoffToAi = parts.length === 0
      }
      break
    }
    default: {
      const _exhaustive: never = picked.action
      void _exhaustive
      completed = true
      handoffToAi = true
    }
  }

  const draftReply = parts.join("\n\n").trim()
  // If branch ends intake with a scripted reply, send it; AI handoff with no text runs FAQ next.
  if (picked.action === "ai" && draftReply) {
    handoffToAi = false
  }

  return {
    draftReply,
    intent: "intake_branch",
    confidence: 1,
    shouldAutoReply: input.auto && Boolean(draftReply),
    summary: `Intake: ${input.question.key} → ${picked.label}`,
    nextState: {
      ...input.state,
      askedKeys,
      completed,
    },
    handoffToAi: handoffToAi && !draftReply,
  }
}

function bodyLooksLike(haystack: string, needle: string): boolean {
  const n = needle.trim()
  if (n.length < 8) return haystack.trim() === n
  const snippet = n.slice(0, Math.min(48, n.length)).toLowerCase()
  return haystack.toLowerCase().includes(snippet)
}

/**
 * Recover intake progress when welcome/questions were sent before metadata existed
 * (manual Instagram send, draft send, or older builds).
 */
export function hydrateIntakeStateFromMessages(input: {
  state: IntakeThreadState
  questions: IntakeQuestion[]
  welcomeMessage: string
  messages: { direction: string; body: string }[]
}): IntakeThreadState {
  let state: IntakeThreadState = {
    welcomeSent: input.state.welcomeSent,
    askedKeys: [...input.state.askedKeys],
    answers: { ...input.state.answers },
    completed: input.state.completed,
  }
  if (state.completed) return state

  const questions = input.questions.filter((q) => q.prompt.trim())
  const first = questions[0]
  const welcome = input.welcomeMessage.trim()
  const outbounds = input.messages.filter((m) => m.direction === "outbound")

  const welcomeOrFirstAlreadySent = outbounds.some(
    (m) =>
      (welcome.length >= 8 && bodyLooksLike(m.body, welcome)) ||
      (first ? bodyLooksLike(m.body, first.prompt) : false)
  )

  if (welcomeOrFirstAlreadySent) {
    state = { ...state, welcomeSent: true }
    if (first && !state.askedKeys.includes(first.key)) {
      state = { ...state, askedKeys: [first.key, ...state.askedKeys] }
    }
  }

  // Mark later questions as asked if their prompt already appears outbound.
  for (const question of questions) {
    if (state.askedKeys.includes(question.key)) continue
    if (outbounds.some((m) => bodyLooksLike(m.body, question.prompt))) {
      state = { ...state, askedKeys: [...state.askedKeys, question.key] }
    }
  }

  // Fill answers from transcript: after an outbound that asked Q, next inbound is the answer
  // (unless a later outbound already followed — then answer was already handled).
  for (let i = 0; i < input.messages.length; i++) {
    const msg = input.messages[i]
    if (!msg || msg.direction !== "outbound") continue
    const asked = questions.find(
      (q) =>
        state.askedKeys.includes(q.key) &&
        !state.answers[q.key] &&
        bodyLooksLike(msg.body, q.prompt)
    )
    if (!asked) continue
    const nextInbound = input.messages.slice(i + 1).find((m) => m.direction === "inbound")
    if (!nextInbound?.body.trim()) continue
    // If we already sent a branch reply after that inbound, keep the answer but don't re-fire.
    const afterInbound = input.messages.slice(input.messages.indexOf(nextInbound) + 1)
    const alreadyFollowedUp = afterInbound.some((m) => m.direction === "outbound")
    state = {
      ...state,
      answers: {
        ...state.answers,
        [asked.key]: nextInbound.body.trim().slice(0, 500),
      },
    }
    if (alreadyFollowedUp && questions.every((q) => !state.askedKeys.includes(q.key) || state.answers[q.key])) {
      // All asked questions answered and follow-ups exist — leave completed as-is.
    }
  }

  return state
}

/**
 * Guided welcome → qualification questions with answer-based branches.
 * Returns null when intake is off/complete so the normal FAQ AI can take over.
 */
export function resolveIntakeReply(input: {
  settings: MessagingSettings
  state: IntakeThreadState
  latestInbound: string
  /** Recent thread messages — used to recover intake progress after manual sends. */
  recentMessages?: { direction: string; body: string }[]
}): IntakeReplyResult | null {
  const { settings, latestInbound } = input
  if (!settings.intakeFlowEnabled) return null

  const questions = settings.intakeQuestions.filter((q) => q.prompt.trim())
  const welcome = settings.intakeWelcomeMessage.trim()
  // Auto-send intake whenever the intake toggle is on (independent of FAQ mode).
  const auto = Boolean(settings.intakeAutoSend)

  let state = hydrateIntakeStateFromMessages({
    state: {
      welcomeSent: input.state.welcomeSent,
      askedKeys: [...input.state.askedKeys],
      answers: { ...input.state.answers },
      completed: input.state.completed,
    },
    questions,
    welcomeMessage: welcome,
    messages: input.recentMessages ?? [],
  })
  if (state.completed) return null

  // Capture answer for the last asked question, then branch on it.
  const lastAsked = state.askedKeys[state.askedKeys.length - 1]
  let justAnsweredKey: string | null = null
  if (state.welcomeSent && lastAsked && latestInbound.trim()) {
    const existing = state.answers[lastAsked]
    const inbound = latestInbound.trim().slice(0, 500)
    // Re-run branch when this inbound is the answer and we have not followed up yet
    // (existing answer may have been hydrated from history without a follow-up outbound).
    const followUpAlreadySent = (input.recentMessages ?? []).some((m, idx, all) => {
      if (m.direction !== "inbound" || m.body.trim().slice(0, 500) !== inbound) return false
      return all.slice(idx + 1).some((x) => x.direction === "outbound")
    })
    if (!followUpAlreadySent && (!existing || existing === inbound)) {
      state = {
        ...state,
        answers: { ...state.answers, [lastAsked]: inbound },
      }
      justAnsweredKey = lastAsked
    }
  }

  if (!state.welcomeSent) {
    const first = questions[0]
    const draftReply = first
      ? `${welcome}\n\n${first.prompt}`.trim()
      : welcome
    const nextState: IntakeThreadState = {
      welcomeSent: true,
      askedKeys: first ? [first.key] : [],
      answers: state.answers,
      completed: !first,
    }
    return {
      draftReply,
      intent: "intake_welcome",
      confidence: 1,
      shouldAutoReply: auto,
      summary: first ? "Intake: welcome + first question" : "Intake: welcome sent",
      nextState,
      handoffToAi: false,
    }
  }

  if (justAnsweredKey) {
    const answered = questions.find((q) => q.key === justAnsweredKey)
    if (answered) {
      const branched = applyIntakeBranch({
        question: answered,
        answer: state.answers[justAnsweredKey] || latestInbound,
        state,
        questions,
        auto,
      })
      // Always send scripted branch replies this turn (including action "ai" with a reply).
      if (branched.draftReply) {
        return { ...branched, handoffToAi: false, shouldAutoReply: auto }
      }
      if (branched.handoffToAi) return branched
      return branched
    }
  }

  // Waiting for an answer to the current question — no outbound this turn.
  const pendingKey = state.askedKeys[state.askedKeys.length - 1]
  if (pendingKey && !state.answers[pendingKey]) {
    return null
  }

  // Asked question already answered earlier without a follow-up — force branch once.
  if (pendingKey && state.answers[pendingKey]) {
    const answered = questions.find((q) => q.key === pendingKey)
    const followUpAlreadySent = (input.recentMessages ?? []).some((m, idx, all) => {
      if (m.direction !== "inbound") return false
      if (m.body.trim().slice(0, 500) !== state.answers[pendingKey]) return false
      return all.slice(idx + 1).some((x) => x.direction === "outbound")
    })
    if (answered && !followUpAlreadySent) {
      const branched = applyIntakeBranch({
        question: answered,
        answer: state.answers[pendingKey]!,
        state,
        questions,
        auto,
      })
      if (branched.draftReply) {
        return { ...branched, handoffToAi: false, shouldAutoReply: auto }
      }
      return branched
    }
  }

  // All asked questions answered and no open branch — hand off to AI.
  const answerSummary = Object.entries(state.answers)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
  return {
    draftReply: "",
    intent: "intake_complete",
    confidence: 1,
    shouldAutoReply: false,
    summary: answerSummary ? `Intake complete: ${answerSummary}` : "Intake complete",
    nextState: { ...state, completed: true },
    handoffToAi: true,
  }
}

export async function loadThreadIntakeState(
  admin: AdminClient,
  organizationId: string,
  threadId: string
): Promise<{ metadata: Record<string, unknown>; state: IntakeThreadState }> {
  const { data } = await admin
    .from("conversation_threads")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("id", threadId)
    .maybeSingle()
  const metadata =
    data && typeof (data as { metadata?: unknown }).metadata === "object"
      ? ((data as { metadata: Record<string, unknown> }).metadata ?? {})
      : {}
  return { metadata, state: readIntakeState(metadata) }
}

export async function saveThreadIntakeState(
  admin: AdminClient,
  organizationId: string,
  threadId: string,
  metadata: Record<string, unknown>,
  state: IntakeThreadState
): Promise<void> {
  // Re-read before write so concurrent Instagram sync metadata merges aren't lost.
  const { data: latest } = await admin
    .from("conversation_threads")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("id", threadId)
    .maybeSingle()
  const latestMeta =
    latest && typeof (latest as { metadata?: unknown }).metadata === "object"
      ? ((latest as { metadata: Record<string, unknown> }).metadata ?? {})
      : {}
  const { error } = await admin
    .from("conversation_threads")
    .update({ metadata: { ...latestMeta, ...metadata, intake: state } })
    .eq("organization_id", organizationId)
    .eq("id", threadId)
  if (error) {
    console.error("[tangent] failed to save intake state", threadId, error.message)
  }
}

export async function upsertWhatsappInboundMessage(input: {
  admin: AdminClient
  organizationId: string
  connectedAccountId: string | null
  fromDigits: string
  body: string
  providerMessageId?: string | null
  contactName?: string
}): Promise<{ thread: ConversationThread; message: ConversationMessage } | null> {
  const e164 = input.fromDigits.startsWith("+") ? input.fromDigits : `+${input.fromDigits}`
  const now = new Date().toISOString()
  const preview = input.body.trim().slice(0, 160)

  const { data: contact } = await input.admin
    .from("contacts")
    .select("id, name")
    .eq("organization_id", input.organizationId)
    .eq("phone_e164", e164)
    .maybeSingle()

  const { data: existingThread } = await input.admin
    .from("conversation_threads")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("channel", "whatsapp")
    .eq("external_thread_key", e164)
    .maybeSingle()

  let threadRow: Record<string, unknown>
  if (existingThread) {
    const current = existingThread as Record<string, unknown>
    const { data: updated, error } = await input.admin
      .from("conversation_threads")
      .update({
        connected_account_id: input.connectedAccountId ?? current.connected_account_id,
        contact_id: (contact as { id?: string } | null)?.id ?? current.contact_id,
        participant_handle: e164,
        participant_name:
          input.contactName ||
          (contact as { name?: string } | null)?.name ||
          current.participant_name ||
          e164,
        status: "open",
        unread_count: Number(current.unread_count ?? 0) + 1,
        last_message_at: now,
        last_message_preview: preview,
        last_inbound_at: now,
      })
      .eq("id", current.id)
      .select("*")
      .single()
    if (error || !updated) return null
    threadRow = updated as Record<string, unknown>
  } else {
    const { data: created, error } = await input.admin
      .from("conversation_threads")
      .insert({
        organization_id: input.organizationId,
        channel: "whatsapp",
        connected_account_id: input.connectedAccountId,
        contact_id: (contact as { id?: string } | null)?.id ?? null,
        external_thread_key: e164,
        participant_handle: e164,
        participant_name:
          input.contactName || (contact as { name?: string } | null)?.name || e164,
        status: "open",
        unread_count: 1,
        last_message_at: now,
        last_message_preview: preview,
        last_inbound_at: now,
      })
      .select("*")
      .single()
    if (error || !created) return null
    threadRow = created as Record<string, unknown>
  }

  if (input.providerMessageId) {
    const { data: dup } = await input.admin
      .from("conversation_messages")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("provider_message_id", input.providerMessageId)
      .maybeSingle()
    if (dup) {
      const thread = mapThread(threadRow)
      if (!thread) return null
      const { data: existingMsg } = await input.admin
        .from("conversation_messages")
        .select("*")
        .eq("id", (dup as { id: string }).id)
        .maybeSingle()
      const message = existingMsg ? mapMessage(existingMsg as Record<string, unknown>) : null
      if (!message) return null
      return { thread, message }
    }
  }

  const { data: messageRow, error: messageError } = await input.admin
    .from("conversation_messages")
    .insert({
      organization_id: input.organizationId,
      thread_id: threadRow.id,
      direction: "inbound",
      sender_kind: "contact",
      body: input.body.trim(),
      content_type: "text",
      provider_message_id: input.providerMessageId ?? null,
      status: "received",
      occurred_at: now,
    })
    .select("*")
    .single()

  if (messageError || !messageRow) return null
  const thread = mapThread(threadRow)
  const message = mapMessage(messageRow as Record<string, unknown>)
  if (!thread || !message) return null
  return { thread, message }
}

export async function understandInboundMessage(input: {
  businessName: string
  businessSummary: string
  channel: InboxChannel
  participantName: string
  recentMessages: { direction: string; body: string }[]
  latestInbound: string
  /** Answers collected from the intake / qualification flow. */
  intakeAnswers?: Record<string, string>
}): Promise<InboundUnderstanding | null> {
  const provider = getModelProvider()
  if (!provider) return null

  const transcript = input.recentMessages
    .slice(-12)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.body}`)
    .join("\n")

  const intakeBlock =
    input.intakeAnswers && Object.keys(input.intakeAnswers).length > 0
      ? Object.entries(input.intakeAnswers)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
      : ""

  const result = await provider.generateStructured({
    tier: "fast",
    system: [
      "You are Tangent Inbox AI for an Indian SMB marketing workspace.",
      "Classify the latest customer message and draft a short, helpful reply.",
      "Never invent prices, policies, or commitments. If unsure, ask one clarifying question.",
      "shouldAutoReply=true only for clear FAQ intents (pricing/hours/product) with a safe factual reply.",
      "Opt-out / STOP messages: intent=opt_out, shouldAutoReply=false, draft a brief acknowledgement only.",
      "When intake answers (e.g. business_type) are provided, tailor the reply to that business.",
      "Keep draftReply under 600 characters, plain text, no markdown.",
    ].join(" "),
    input: [
      `Business: ${input.businessName}`,
      `About: ${input.businessSummary || "Not provided"}`,
      `Channel: ${input.channel}`,
      `Customer: ${input.participantName}`,
      intakeBlock ? `## Intake answers\n${intakeBlock}` : "",
      `## Recent thread\n${transcript || "(none)"}`,
      `## Latest inbound\n${input.latestInbound}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: inboundUnderstandingSchema,
    schemaName: "inbox_inbound_understanding",
    maxOutputTokens: 800,
  })

  return result.data
}

export function isIntakeAutoReplyAllowed(
  intake: IntakeReplyResult,
  settings: MessagingSettings
): boolean {
  if (!intake.shouldAutoReply) return false
  // Intake auto-send is controlled only by intakeAutoSend (not FAQ auto_reply_mode).
  return settings.intakeAutoSend
}

/**
 * Shared inbound AI path for WhatsApp / Instagram webhooks: intake flow first, then FAQ AI.
 * Optionally auto-sends when settings allow.
 */
export async function processInboundAiAndMaybeReply(input: {
  admin: AdminClient
  organizationId: string
  threadId: string
  messageId: string
  connectedAccountId: string | null
  channel: InboxChannel
  body: string
  participantName: string
  /** When false, never auto-send (Instagram safety default can still enable intake auto-send). */
  allowAutoSend?: boolean
}): Promise<void> {
  const settings = await loadOrgMessagingSettings(input.admin, input.organizationId)
  // Intake can run even when classify/FAQ AI is off; both off → nothing to do.
  if (!settings.inboxAiEnabled && !settings.intakeFlowEnabled) return

  const { data: org } = await input.admin
    .from("organizations")
    .select("name")
    .eq("id", input.organizationId)
    .maybeSingle()
  const { data: business } = await input.admin
    .from("business_profiles")
    .select("description, products_and_services")
    .eq("organization_id", input.organizationId)
    .maybeSingle()
  // Newest 40 chronologically — ascending fetch of a long thread would miss recent intake turns.
  const { data: recentRowsRaw } = await input.admin
    .from("conversation_messages")
    .select("direction, body")
    .eq("thread_id", input.threadId)
    .order("occurred_at", { ascending: false })
    .limit(40)
  const recentRows = [...(recentRowsRaw ?? [])].reverse()

  const { metadata, state } = await loadThreadIntakeState(
    input.admin,
    input.organizationId,
    input.threadId
  )

  const recentMessages = (recentRows ?? []) as { direction: string; body: string }[]
  const intake = resolveIntakeReply({
    settings,
    state,
    latestInbound: input.body,
    recentMessages,
  })

  // Mid-intake with nothing to send this turn (should be rare) — don't run FAQ yet.
  if (!intake && settings.intakeFlowEnabled && !state.completed) {
    return
  }

  let draftReply = ""
  let shouldAuto = false
  let understanding: InboundUnderstanding | null = null

  if (intake && !intake.handoffToAi) {
    await saveThreadIntakeState(
      input.admin,
      input.organizationId,
      input.threadId,
      metadata,
      intake.nextState
    )
    understanding = {
      intent: "greeting",
      sentiment: "neutral",
      confidence: intake.confidence,
      summary: intake.summary,
      draftReply: intake.draftReply,
      shouldAutoReply: intake.shouldAutoReply,
    }
    draftReply = intake.draftReply
    shouldAuto = isIntakeAutoReplyAllowed(intake, settings)
  } else {
    if (intake?.handoffToAi) {
      await saveThreadIntakeState(
        input.admin,
        input.organizationId,
        input.threadId,
        metadata,
        intake.nextState
      )
    }
    if (!settings.inboxAiEnabled) return

    const intakeAnswers = intake?.nextState.answers ?? state.answers
    understanding = await understandInboundMessage({
      businessName: (org as { name?: string } | null)?.name || "Business",
      businessSummary: [
        (business as { description?: string } | null)?.description,
        Array.isArray((business as { products_and_services?: unknown })?.products_and_services)
          ? ((business as { products_and_services: string[] }).products_and_services || []).join(", ")
          : "",
      ]
        .filter(Boolean)
        .join(" — "),
      channel: input.channel,
      participantName: input.participantName,
      recentMessages,
      latestInbound: input.body,
      intakeAnswers,
    })
    if (!understanding) return
    draftReply = understanding.draftReply
    shouldAuto = isFaqAutoReplyAllowed(understanding, settings.autoReplyMode)
  }

  await applyInboundUnderstanding({
    admin: input.admin,
    organizationId: input.organizationId,
    threadId: input.threadId,
    messageId: input.messageId,
    understanding,
  })

  if (!draftReply.trim()) return
  if (input.allowAutoSend === false) return

  // Don't re-send the same scripted reply if it was already delivered after this inbound.
  const alreadySentSameReply = recentMessages.some((m, idx, all) => {
    if (m.direction !== "inbound") return false
    if (m.body.trim().slice(0, 500) !== input.body.trim().slice(0, 500)) return false
    return all.slice(idx + 1).some(
      (out) => out.direction === "outbound" && bodyLooksLike(out.body, draftReply)
    )
  })
  const lastOutbound = [...recentMessages].reverse().find((m) => m.direction === "outbound")
  const duplicateOfLastOutbound =
    Boolean(lastOutbound) && bodyLooksLike(lastOutbound!.body, draftReply)

  if (alreadySentSameReply || duplicateOfLastOutbound) {
    console.info("[tangent] auto-reply skipped: draft already sent", input.threadId)
    return
  }

  if (!shouldAuto) {
    console.info(
      "[tangent] intake/FAQ drafted but auto-send off",
      JSON.stringify({
        threadId: input.threadId,
        intakeAutoSend: settings.intakeAutoSend,
        autoReplyMode: settings.autoReplyMode,
        intent: understanding?.intent,
      })
    )
    return
  }

  const { data: thread } = await input.admin
    .from("conversation_threads")
    .select("participant_handle, channel, connected_account_id, metadata")
    .eq("id", input.threadId)
    .maybeSingle()
  const threadRow = thread as {
    participant_handle?: string
    channel?: InboxChannel
    connected_account_id?: string | null
    metadata?: Record<string, unknown> | null
  } | null

  let toHandle = threadRow?.participant_handle ?? ""
  const channel = threadRow?.channel || input.channel
  // Instagram needs the numeric IGSID — recover from metadata when handle is still @username.
  if (channel === "instagram") {
    const raw = toHandle.replace(/^@/, "").trim()
    if (!/^\d+$/.test(raw)) {
      const fromMeta = threadRow?.metadata?.participantIgId
      if (typeof fromMeta === "string" && /^\d+$/.test(fromMeta)) {
        toHandle = fromMeta
      }
    } else {
      toHandle = raw
    }
  }
  if (!toHandle) {
    console.warn("[tangent] auto-reply skipped: missing recipient handle", input.threadId)
    return
  }

  const channelProvider =
    channel === "instagram"
      ? "instagram"
      : channel === "whatsapp"
        ? "whatsapp"
        : channel === "facebook" || channel === "messenger"
          ? "facebook"
          : null

  // Prefer the thread's own account, then the inbound account, then a same-provider preferred
  // override from settings (never force a WhatsApp sender onto an Instagram chat).
  let accountId = threadRow?.connected_account_id || input.connectedAccountId

  if (settings.autoReplyConnectedAccountId) {
    const { data: preferred } = await input.admin
      .from("connected_accounts")
      .select("id, provider")
      .eq("id", settings.autoReplyConnectedAccountId)
      .eq("organization_id", input.organizationId)
      .maybeSingle()
    const preferredProvider = (preferred as { provider?: string } | null)?.provider
    if (
      preferred &&
      (!channelProvider || preferredProvider === channelProvider || preferredProvider === channel)
    ) {
      accountId = settings.autoReplyConnectedAccountId
    }
  }

  if (!accountId && channelProvider) {
    const { data: fallback } = await input.admin
      .from("connected_accounts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("provider", channelProvider)
      .neq("status", "revoked")
      .limit(1)
      .maybeSingle()
    accountId = (fallback as { id?: string } | null)?.id ?? null
  }
  if (!accountId) return

  const { data: account } = await input.admin
    .from("connected_accounts")
    .select("id, provider, external_account_id")
    .eq("id", accountId)
    .eq("organization_id", input.organizationId)
    .maybeSingle()
  if (!account) return

  try {
    const sent = await sendInboxSessionReply({
      organizationId: input.organizationId,
      channel,
      connectedAccountId: account.id as string,
      accountExternalId: String(
        (account as { external_account_id?: string }).external_account_id ?? ""
      ),
      accountProvider: String((account as { provider?: string }).provider ?? ""),
      toHandle,
      body: draftReply,
    })

    await persistOutboundInboxMessage({
      admin: input.admin,
      organizationId: input.organizationId,
      threadId: input.threadId,
      body: draftReply,
      providerMessageId: sent.messageId,
      senderKind: "auto",
    })
  } catch (error) {
    console.error("[tangent] auto-reply send failed", {
      threadId: input.threadId,
      channel,
      toHandle,
      error: error instanceof Error ? error.message : error,
    })
    throw error
  }
}

export async function applyInboundUnderstanding(input: {
  admin: AdminClient
  organizationId: string
  threadId: string
  messageId: string
  understanding: InboundUnderstanding
}): Promise<void> {
  await input.admin
    .from("conversation_messages")
    .update({
      ai_intent: input.understanding.intent,
      ai_sentiment: input.understanding.sentiment,
      ai_confidence: input.understanding.confidence,
      ai_draft_reply: input.understanding.draftReply,
      ai_should_auto_reply: input.understanding.shouldAutoReply,
    })
    .eq("id", input.messageId)
    .eq("organization_id", input.organizationId)

  await input.admin
    .from("conversation_threads")
    .update({ ai_summary: input.understanding.summary })
    .eq("id", input.threadId)
    .eq("organization_id", input.organizationId)
}

export async function sendInboxSessionReply(input: {
  organizationId: string
  channel: InboxChannel
  connectedAccountId: string
  accountExternalId: string
  accountProvider: string
  toHandle: string
  body: string
}): Promise<{ messageId: string }> {
  if (input.channel === "whatsapp") {
    if (input.accountProvider !== "whatsapp") {
      throw new IntegrationError("WhatsApp account required for this reply", "not_configured")
    }
    const token = await loadAccessToken({
      organizationId: input.organizationId,
      connectedAccountId: input.connectedAccountId,
    })
    if (!token) {
      throw new IntegrationError("No encrypted WhatsApp access token stored", "not_configured")
    }
    const resolved = await resolveWhatsappAccountIds(token, input.accountExternalId)
    return sendWhatsappTextMessage({
      accessToken: token,
      phoneNumberId: resolved.phoneNumberId,
      toE164: input.toHandle,
      body: input.body,
    })
  }

  if (input.channel === "instagram") {
    if (input.accountProvider !== "instagram") {
      throw new IntegrationError("Instagram account required for this reply", "not_configured")
    }
    const recipientId = input.toHandle.replace(/^@/, "").trim()
    if (!recipientId || recipientId.includes(" ")) {
      throw new IntegrationError(
        "Missing Instagram recipient id. Click Sync Instagram, then open the DM again.",
        "provider_error"
      )
    }
    // Legacy rows stored @username — Meta needs the Instagram-scoped user id.
    if (!/^\d+$/.test(recipientId)) {
      throw new IntegrationError(
        "This chat still has a username instead of an Instagram user id. Click Sync Instagram once, then retry Send.",
        "provider_error"
      )
    }
    const token = await loadAccessToken({
      organizationId: input.organizationId,
      connectedAccountId: input.connectedAccountId,
    })
    if (!token) {
      throw new IntegrationError("No encrypted Instagram access token stored", "not_configured")
    }
    const page = await resolvePageForInstagram({
      accessToken: token,
      igUserId: input.accountExternalId,
    })
    const url = new URL(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${page.pageId}/messages`
    )
    url.searchParams.set("access_token", page.pageToken)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: input.body },
      }),
    })
    const text = await res.text().catch(() => "")
    if (!res.ok) {
      let detail = text.slice(0, 280)
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string; error_user_msg?: string } }
        detail = parsed.error?.error_user_msg || parsed.error?.message || detail
      } catch {
        /* keep raw */
      }
      throw new IntegrationError(
        `Instagram DM send failed (${res.status}): ${detail}`,
        "provider_error"
      )
    }
    let messageId = `ig_${Date.now()}`
    try {
      const parsed = JSON.parse(text) as { message_id?: string; id?: string }
      messageId = parsed.message_id || parsed.id || messageId
    } catch {
      /* generated fallback id */
    }
    return { messageId }
  }

  throw new IntegrationError(
    `${input.channel} session replies are not connected yet.`,
    "not_configured"
  )
}

export async function persistOutboundInboxMessage(input: {
  admin: AdminClient
  organizationId: string
  threadId: string
  body: string
  providerMessageId: string | null
  senderKind: "user" | "agent" | "auto"
}): Promise<ConversationMessage | null> {
  const now = new Date().toISOString()
  const { data: messageRow, error } = await input.admin
    .from("conversation_messages")
    .insert({
      organization_id: input.organizationId,
      thread_id: input.threadId,
      direction: "outbound",
      sender_kind: input.senderKind,
      body: input.body.trim(),
      content_type: "text",
      provider_message_id: input.providerMessageId,
      status: "sent",
      occurred_at: now,
    })
    .select("*")
    .single()
  if (error || !messageRow) return null

  await input.admin
    .from("conversation_threads")
    .update({
      last_message_at: now,
      last_message_preview: input.body.trim().slice(0, 160),
    })
    .eq("id", input.threadId)
    .eq("organization_id", input.organizationId)

  return mapMessage(messageRow as Record<string, unknown>)
}

export function isFaqAutoReplyAllowed(
  understanding: InboundUnderstanding,
  mode: InboxAutoReplyMode
): boolean {
  if (mode !== "auto_faq") return false
  if (!understanding.shouldAutoReply) return false
  if (understanding.confidence < 0.78) return false
  return (
    understanding.intent === "faq_pricing" ||
    understanding.intent === "faq_hours" ||
    understanding.intent === "faq_product" ||
    understanding.intent === "greeting"
  )
}

export { mapThread, mapMessage }
