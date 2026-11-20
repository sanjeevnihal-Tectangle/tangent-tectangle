import { z } from "zod"

export const PRODUCT_STATUSES = ["active", "archived"] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  archived: "Archived",
}

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Enter a product name").max(160),
  description: z.string().trim().max(2000),
  sku: z.string().trim().max(80).nullable(),
  category: z.string().trim().max(120).nullable(),
  status: z.enum(PRODUCT_STATUSES),
  brandProfileId: z.string().nullable(),
  updatedAt: z.string(),
})
export type Product = z.infer<typeof productSchema>

export const CONTACT_SOURCES = ["manual", "csv", "scrape", "api", "crm"] as const
export type ContactSource = (typeof CONTACT_SOURCES)[number]

export const CONTACT_SOURCE_LABELS: Record<ContactSource, string> = {
  manual: "Manual",
  csv: "CSV import",
  scrape: "Scraped / lead gen",
  api: "API",
  crm: "CRM",
}

export const CONSENT_STATES = ["unknown", "opted_in", "opted_out"] as const
export type ConsentState = (typeof CONSENT_STATES)[number]

export const CONSENT_STATE_LABELS: Record<ConsentState, string> = {
  unknown: "Unknown",
  opted_in: "Opted in",
  opted_out: "Opted out",
}

export const contactSchema = z.object({
  id: z.string().min(1),
  phoneE164: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/, "Use E.164, e.g. +919876543210")
    .nullable(),
  email: z.union([z.literal(""), z.email("Enter a valid email")]).nullable(),
  name: z.string().trim().max(160),
  source: z.enum(CONTACT_SOURCES),
  consentWhatsapp: z.enum(CONSENT_STATES),
  consentWhatsappAt: z.string().nullable(),
  consentWhatsappEvidence: z.string().trim().max(500).nullable(),
  consentSms: z.enum(CONSENT_STATES),
  consentEmail: z.enum(CONSENT_STATES),
  attributes: z.record(z.string(), z.string()),
  productInterestIds: z.array(z.string()),
  optedOutAt: z.string().nullable(),
  blockedAt: z.string().nullable(),
  updatedAt: z.string(),
})
export type Contact = z.infer<typeof contactSchema>

export const audienceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Name the audience").max(160),
  description: z.string().trim().max(800),
  productId: z.string().nullable(),
  memberIds: z.array(z.string()),
  estimatedSize: z.number().int().min(0),
  refreshedAt: z.string().nullable(),
  updatedAt: z.string(),
})
export type Audience = z.infer<typeof audienceSchema>

export const IMPORT_BATCH_STATUSES = ["pending_review", "accepted", "rejected"] as const
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number]

export const contactImportRowSchema = z.object({
  name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(200).optional(),
  consentWhatsapp: z.enum(CONSENT_STATES).optional(),
  consentSms: z.enum(CONSENT_STATES).optional(),
  consentEmail: z.enum(CONSENT_STATES).optional(),
  productInterest: z.string().trim().max(160).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  error: z.string().optional(),
  phoneE164: z.string().optional(),
})
export type ContactImportRow = z.infer<typeof contactImportRowSchema>

export const contactImportBatchSchema = z.object({
  id: z.string().min(1),
  source: z.enum(CONTACT_SOURCES),
  filename: z.string().nullable(),
  status: z.enum(IMPORT_BATCH_STATUSES),
  rawRows: z.array(contactImportRowSchema),
  acceptedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ContactImportBatch = z.infer<typeof contactImportBatchSchema>

export const MESSAGE_CHANNELS = ["whatsapp", "sms", "email"] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
}

export const TEMPLATE_CATEGORIES = ["marketing", "utility", "authentication"] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
}

export const TEMPLATE_STATUSES = [
  "draft",
  "pending_meta",
  "approved",
  "rejected",
  "paused",
] as const
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Draft",
  pending_meta: "Pending Meta",
  approved: "Approved",
  rejected: "Rejected",
  paused: "Paused",
}

export const TEMPLATE_HEADER_FORMATS = ["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"] as const
export type TemplateHeaderFormat = (typeof TEMPLATE_HEADER_FORMATS)[number]

export const templateComponentSchema = z.object({
  headerText: z.string().trim().max(60).optional(),
  /** WhatsApp header media type when not TEXT. */
  headerFormat: z.enum(TEMPLATE_HEADER_FORMATS).optional(),
  /** Public HTTPS URL (or Meta media id) for IMAGE/VIDEO/DOCUMENT headers at send time. */
  headerMediaUrl: z.string().trim().max(2000).optional(),
  bodyText: z.string().trim().min(1, "Add body text").max(1024),
  footerText: z.string().trim().max(60).optional(),
  /** Ordered example values for {{1}}, {{2}}, … shown in Meta review. */
  variableExamples: z.array(z.string().trim().max(120)).max(10),
  buttons: z
    .array(
      z.object({
        type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
        text: z.string().trim().min(1).max(25),
        url: z.string().trim().max(2000).optional(),
        phoneNumber: z.string().trim().max(32).optional(),
      })
    )
    .max(3)
    .optional(),
  /** India DLT / MSG91 Flow template id (SMS). */
  dltTemplateId: z.string().trim().max(64).optional(),
  /** India DLT entity id (optional; often set at provider account). */
  dltEntityId: z.string().trim().max(64).optional(),
  /** Registered SMS sender id (6-char DLT header). */
  senderId: z.string().trim().max(12).optional(),
  /** Email subject line. */
  emailSubject: z.string().trim().max(200).optional(),
})
export type TemplateComponents = z.infer<typeof templateComponentSchema>

export const messageTemplateSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(MESSAGE_CHANNELS),
  productId: z.string().nullable(),
  connectedAccountId: z.string().nullable(),
  name: z
    .string()
    .trim()
    .min(1, "Enter a template name")
    .max(512)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only"),
  language: z.string().trim().min(2).max(15),
  category: z.enum(TEMPLATE_CATEGORIES),
  bodyComponents: templateComponentSchema,
  status: z.enum(TEMPLATE_STATUSES),
  metaTemplateId: z.string().nullable(),
  metaNamespace: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  updatedAt: z.string(),
})
export type MessageTemplate = z.infer<typeof messageTemplateSchema>

/** Provider id used for connected accounts per messaging channel. */
export const CHANNEL_PROVIDER: Record<MessageChannel, string> = {
  whatsapp: "whatsapp",
  sms: "msg91",
  email: "resend",
}

export function contactHasChannelConsent(
  contact: Contact,
  channel: MessageChannel,
  category: TemplateCategory
): boolean {
  if (category !== "marketing") return true
  switch (channel) {
    case "whatsapp":
      return contact.consentWhatsapp === "opted_in"
    case "sms":
      return contact.consentSms === "opted_in"
    case "email":
      return contact.consentEmail === "opted_in"
    default: {
      const unreachable: never = channel
      throw new Error(`Unknown messaging channel: ${String(unreachable)}`)
    }
  }
}

export function contactReachableOnChannel(contact: Contact, channel: MessageChannel): boolean {
  if (contact.optedOutAt || contact.blockedAt) return false
  switch (channel) {
    case "whatsapp":
    case "sms":
      return Boolean(contact.phoneE164)
    case "email":
      return Boolean(contact.email?.includes("@"))
    default: {
      const unreachable: never = channel
      throw new Error(`Unknown messaging channel: ${String(unreachable)}`)
    }
  }
}

export function emptyContact(id: string): Contact {
  return {
    id,
    phoneE164: null,
    email: "",
    name: "",
    source: "manual",
    consentWhatsapp: "unknown",
    consentWhatsappAt: null,
    consentWhatsappEvidence: null,
    consentSms: "unknown",
    consentEmail: "unknown",
    attributes: {},
    productInterestIds: [],
    optedOutAt: null,
    blockedAt: null,
    updatedAt: new Date().toISOString(),
  }
}

export function emptyProduct(id: string): Product {
  return {
    id,
    name: "",
    description: "",
    sku: null,
    category: null,
    status: "active",
    brandProfileId: null,
    updatedAt: new Date().toISOString(),
  }
}

export function emptyAudience(id: string): Audience {
  return {
    id,
    name: "",
    description: "",
    productId: null,
    memberIds: [],
    estimatedSize: 0,
    refreshedAt: null,
    updatedAt: new Date().toISOString(),
  }
}

export function emptyTemplate(id: string): MessageTemplate {
  return {
    id,
    channel: "whatsapp",
    productId: null,
    connectedAccountId: null,
    name: "",
    language: "en",
    category: "marketing",
    bodyComponents: {
      bodyText: "",
      variableExamples: [],
      buttons: [],
    },
    status: "draft",
    metaTemplateId: null,
    metaNamespace: null,
    rejectionReason: null,
    updatedAt: new Date().toISOString(),
  }
}

/** Parse connected-account external id `wabaId:phoneNumberId`. */
export function parseWhatsappExternalId(externalAccountId: string): {
  wabaId: string
  phoneNumberId: string
} | null {
  const idx = externalAccountId.indexOf(":")
  if (idx <= 0 || idx === externalAccountId.length - 1) return null
  return {
    wabaId: externalAccountId.slice(0, idx),
    phoneNumberId: externalAccountId.slice(idx + 1),
  }
}

export function formatWhatsappExternalId(wabaId: string, phoneNumberId: string): string {
  return `${wabaId}:${phoneNumberId}`
}

export const BROADCAST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "queued",
  "sending",
  "completed",
  "failed",
  "cancelled",
] as const
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

export const BROADCAST_STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  queued: "Queued",
  sending: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
}

export const broadcastStatsSchema = z.object({
  queued: z.number().int().min(0),
  sent: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
})
export type BroadcastStats = z.infer<typeof broadcastStatsSchema>

export const messageBroadcastSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Name the broadcast").max(160),
  channel: z.enum(MESSAGE_CHANNELS),
  productId: z.string().nullable(),
  campaignId: z.string().nullable(),
  templateId: z.string().min(1, "Pick a template"),
  audienceId: z.string().min(1, "Pick an audience"),
  connectedAccountId: z.string().min(1, "Pick a connected messaging account"),
  /** Maps template variable index (1-based as string) → contact attribute key or literal. */
  variableMapping: z.record(z.string(), z.string()),
  contactSnapshotIds: z.array(z.string()),
  scheduledFor: z.string().nullable(),
  status: z.enum(BROADCAST_STATUSES),
  approvalRequestId: z.string().nullable(),
  stats: broadcastStatsSchema,
  lastError: z.string().nullable(),
  updatedAt: z.string(),
})
export type MessageBroadcast = z.infer<typeof messageBroadcastSchema>

export const MESSAGE_EVENT_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "skipped",
  "undeliverable",
] as const
export type MessageEventStatus = (typeof MESSAGE_EVENT_STATUSES)[number]

export const messageEventSchema = z.object({
  id: z.string().min(1),
  broadcastId: z.string().min(1),
  contactId: z.string().min(1),
  providerMessageId: z.string().nullable(),
  status: z.enum(MESSAGE_EVENT_STATUSES),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  occurredAt: z.string(),
})
export type MessageEvent = z.infer<typeof messageEventSchema>

/** Exact payload hashed for `send_marketing_message` approval. */
export const broadcastApprovalPayloadSchema = z.object({
  broadcastId: z.string(),
  channel: z.enum(MESSAGE_CHANNELS),
  templateId: z.string(),
  templateName: z.string(),
  templateLanguage: z.string(),
  audienceId: z.string(),
  connectedAccountId: z.string(),
  contactIds: z.array(z.string()),
  contactSetHash: z.string(),
  variableMapping: z.record(z.string(), z.string()),
  estimatedRecipients: z.number().int().min(0),
})
export type BroadcastApprovalPayload = z.infer<typeof broadcastApprovalPayloadSchema>

export function emptyBroadcast(id: string): MessageBroadcast {
  return {
    id,
    name: "",
    channel: "whatsapp",
    productId: null,
    campaignId: null,
    templateId: "",
    audienceId: "",
    connectedAccountId: "",
    variableMapping: {},
    contactSnapshotIds: [],
    scheduledFor: null,
    status: "draft",
    approvalRequestId: null,
    stats: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 },
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}

export function emptyBroadcastStats(): BroadcastStats {
  return { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 }
}

export const AUTOMATION_TRIGGERS = ["schedule", "event"] as const
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]

export const AUTOMATION_SCHEDULE_PRESETS = ["daily", "weekly", "monthly"] as const
export type AutomationSchedulePreset = (typeof AUTOMATION_SCHEDULE_PRESETS)[number]

export const AUTOMATION_SCHEDULE_LABELS: Record<AutomationSchedulePreset, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

export const AUTOMATION_EVENT_TYPES = ["lead_imported"] as const
export type AutomationEventType = (typeof AUTOMATION_EVENT_TYPES)[number]

export const AUTOMATION_EVENT_LABELS: Record<AutomationEventType, string> = {
  lead_imported: "When a lead import is accepted",
}

export const messageAutomationSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Name the automation").max(160),
  enabled: z.boolean(),
  triggerKind: z.enum(AUTOMATION_TRIGGERS),
  schedulePreset: z.enum(AUTOMATION_SCHEDULE_PRESETS).nullable(),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  scheduleTimezone: z.string().min(1).max(80),
  scheduleDayOfWeek: z.number().int().min(1).max(7).nullable(),
  scheduleDayOfMonth: z.number().int().min(1).max(28).nullable(),
  eventType: z.enum(AUTOMATION_EVENT_TYPES).nullable(),
  channel: z.enum(MESSAGE_CHANNELS),
  productId: z.string().nullable(),
  templateId: z.string().min(1, "Pick a template"),
  audienceId: z.string().min(1, "Pick an audience"),
  connectedAccountId: z.string().min(1, "Pick a connected messaging account"),
  variableMapping: z.record(z.string(), z.string()),
  requireApprovalEachRun: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string(),
})
export type MessageAutomation = z.infer<typeof messageAutomationSchema>

export const INBOX_AUTO_REPLY_MODES = ["off", "draft_only", "auto_faq"] as const
export type InboxAutoReplyMode = (typeof INBOX_AUTO_REPLY_MODES)[number]

export const INBOX_AUTO_REPLY_MODE_LABELS: Record<InboxAutoReplyMode, string> = {
  off: "Off — log only",
  draft_only: "AI drafts — human sends",
  auto_faq: "Auto-reply FAQs (high confidence only)",
}

export const messagingSettingsSchema = z.object({
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1).max(80),
  optOutKeywords: z.array(z.string().trim().min(1).max(40)).max(20),
  defaultLanguage: z.string().trim().min(2).max(15),
  /** When true, inbound messages are classified and draft replies generated. */
  inboxAiEnabled: z.boolean().default(true),
  autoReplyMode: z.enum(INBOX_AUTO_REPLY_MODES).default("draft_only"),
  autoReplyConnectedAccountId: z.string().nullable().default(null),
  updatedAt: z.string(),
})
export type MessagingSettings = z.infer<typeof messagingSettingsSchema>

export const INBOX_CHANNELS = [
  "whatsapp",
  "sms",
  "email",
  "instagram",
  "facebook",
  "messenger",
  "linkedin",
  "tiktok",
  "youtube",
] as const
export type InboxChannel = (typeof INBOX_CHANNELS)[number]

export const INBOX_CHANNEL_LABELS: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
}

export const CONVERSATION_THREAD_STATUSES = ["open", "snoozed", "closed"] as const
export type ConversationThreadStatus = (typeof CONVERSATION_THREAD_STATUSES)[number]

export const conversationThreadSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(INBOX_CHANNELS),
  connectedAccountId: z.string().nullable(),
  contactId: z.string().nullable(),
  externalThreadKey: z.string().min(1),
  participantHandle: z.string(),
  participantName: z.string(),
  status: z.enum(CONVERSATION_THREAD_STATUSES),
  unreadCount: z.number().int().min(0),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string(),
  lastInboundAt: z.string().nullable(),
  aiSummary: z.string().nullable(),
  updatedAt: z.string(),
})
export type ConversationThread = z.infer<typeof conversationThreadSchema>

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  senderKind: z.enum(["contact", "user", "agent", "auto"]),
  body: z.string(),
  contentType: z.string(),
  providerMessageId: z.string().nullable(),
  status: z.string(),
  aiIntent: z.string().nullable(),
  aiSentiment: z.string().nullable(),
  aiConfidence: z.number().nullable(),
  aiDraftReply: z.string().nullable(),
  aiShouldAutoReply: z.boolean(),
  occurredAt: z.string(),
})
export type ConversationMessage = z.infer<typeof conversationMessageSchema>

export const sessionReplyApprovalPayloadSchema = z.object({
  threadId: z.string(),
  messageId: z.string().optional(),
  channel: z.enum(INBOX_CHANNELS),
  connectedAccountId: z.string(),
  toHandle: z.string(),
  body: z.string().min(1).max(4096),
})
export type SessionReplyApprovalPayload = z.infer<typeof sessionReplyApprovalPayloadSchema>

export function emptyAutomation(id: string): MessageAutomation {
  return {
    id,
    name: "",
    enabled: false,
    triggerKind: "schedule",
    schedulePreset: "daily",
    scheduleTime: "10:00",
    scheduleTimezone: "Asia/Kolkata",
    scheduleDayOfWeek: 1,
    scheduleDayOfMonth: 1,
    eventType: null,
    channel: "whatsapp",
    productId: null,
    templateId: "",
    audienceId: "",
    connectedAccountId: "",
    variableMapping: { "1": "name" },
    requireApprovalEachRun: true,
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}

export function defaultMessagingSettings(): MessagingSettings {
  return {
    quietHoursEnabled: true,
    quietHoursStart: "21:00",
    quietHoursEnd: "08:00",
    timezone: "Asia/Kolkata",
    optOutKeywords: ["STOP", "UNSUBSCRIBE", "STOPALL"],
    defaultLanguage: "en",
    inboxAiEnabled: true,
    autoReplyMode: "draft_only",
    autoReplyConnectedAccountId: null,
    updatedAt: new Date().toISOString(),
  }
}
