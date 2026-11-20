import "server-only"

import { z } from "zod"

import { getModelProvider } from "@/lib/ai/provider"
import type {
  ConversationMessage,
  ConversationThread,
  InboxAutoReplyMode,
  InboxChannel,
  MessagingSettings,
} from "@/lib/domain/messaging"
import {
  conversationMessageSchema,
  conversationThreadSchema,
  defaultMessagingSettings,
} from "@/lib/domain/messaging"
import { loadAccessToken } from "@/lib/integrations/credentials"
import { IntegrationError } from "@/lib/integrations/gateway"
import {
  resolveWhatsappAccountIds,
  sendWhatsappTextMessage,
} from "@/lib/integrations/whatsapp"
import type { SupabaseClient } from "@supabase/supabase-js"

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
  const { data } = await admin
    .from("messaging_settings")
    .select(
      "quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, opt_out_keywords, default_language, inbox_ai_enabled, auto_reply_mode, auto_reply_connected_account_id, updated_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle()
  if (!data) return defaultMessagingSettings()
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
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
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
}): Promise<InboundUnderstanding | null> {
  const provider = getModelProvider()
  if (!provider) return null

  const transcript = input.recentMessages
    .slice(-12)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.body}`)
    .join("\n")

  const result = await provider.generateStructured({
    tier: "fast",
    system: [
      "You are Tangent Inbox AI for an Indian SMB marketing workspace.",
      "Classify the latest customer message and draft a short, helpful reply.",
      "Never invent prices, policies, or commitments. If unsure, ask one clarifying question.",
      "shouldAutoReply=true only for clear FAQ intents (pricing/hours/product) with a safe factual reply.",
      "Opt-out / STOP messages: intent=opt_out, shouldAutoReply=false, draft a brief acknowledgement only.",
      "Keep draftReply under 600 characters, plain text, no markdown.",
    ].join(" "),
    input: [
      `Business: ${input.businessName}`,
      `About: ${input.businessSummary || "Not provided"}`,
      `Channel: ${input.channel}`,
      `Customer: ${input.participantName}`,
      `## Recent thread\n${transcript || "(none)"}`,
      `## Latest inbound\n${input.latestInbound}`,
    ].join("\n\n"),
    schema: inboundUnderstandingSchema,
    schemaName: "inbox_inbound_understanding",
    maxOutputTokens: 800,
  })

  return result.data
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
  if (input.channel !== "whatsapp") {
    throw new IntegrationError(
      `${input.channel} session replies are not connected yet. WhatsApp works today; Instagram/Facebook DMs come next.`,
      "not_configured"
    )
  }
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
