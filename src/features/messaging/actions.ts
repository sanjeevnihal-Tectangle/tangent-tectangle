"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ApprovalError, type ApprovalRequest } from "@/lib/approvals/engine"
import { aiQuotaError, quotaError } from "@/lib/ai/metering"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import { DEFAULT_PLANS } from "@/lib/billing/plans"
import {
  audienceSchema,
  CHANNEL_PROVIDER,
  contactHasChannelConsent,
  contactReachableOnChannel,
  contactSchema,
  CONSENT_STATES,
  emptyAudience,
  emptyBroadcast,
  emptyContact,
  emptyProduct,
  MESSAGE_CHANNEL_LABELS,
  messageAutomationSchema,
  messageBroadcastSchema,
  messageTemplateSchema,
  messagingSettingsSchema,
  sessionReplyApprovalPayloadSchema,
  productSchema,
  type Audience,
  type BroadcastApprovalPayload,
  type ConsentState,
  type Contact,
  type ContactImportBatch,
  type ContactImportRow,
  type ConversationMessage,
  type ConversationThread,
  type MessageAutomation,
  type MessageBroadcast,
  type MessageTemplate,
  type MessagingSettings,
  type Product,
} from "@/lib/domain/messaging"
import { loadAccessToken } from "@/lib/integrations/credentials"
import { IntegrationError } from "@/lib/integrations/gateway"
import {
  listMetaMessageTemplates,
  mapMetaTemplateCategory,
  mapMetaTemplateStatus,
  resolveWhatsappAccountIds,
  submitMetaMessageTemplate,
  uploadMetaTemplateMediaSample,
} from "@/lib/integrations/whatsapp"
import {
  buildBroadcastApprovalPayload,
  executeApprovedBroadcast,
  sendTemplateToSingleContact,
} from "@/lib/messaging/broadcast-send"
import {
  processInboundAiAndMaybeReply,
  readIntakeState,
  resolveIntakeReply,
  sendInboxSessionReply,
  understandInboundMessage,
} from "@/lib/messaging/inbox"
import { createClient } from "@supabase/supabase-js"
import { serverEnv } from "@/lib/env/server"
import { syncInstagramInbox, resolvePageForInstagram } from "@/lib/messaging/instagram-sync"
import { subscribeInstagramLiveWebhooks } from "@/lib/messaging/instagram-webhook"
import { publicEnv } from "@/lib/env/public"
import { mapCsvRow, normalizePhoneE164, parseCsvContacts } from "@/lib/messaging/phone"
import { DEFAULT_QUIET_HOURS, isWithinQuietHours } from "@/lib/messaging/quiet-hours"
import { computeNextRunAt } from "@/lib/messaging/schedule"
import {
  listTemplatePlaceholders,
  resolveTemplateParameters,
} from "@/lib/messaging/variables"
import { resolveWorkspace } from "@/lib/workspace/server"

export type MessagingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function revalidateMessaging(slug: string) {
  revalidatePath(`/w/${slug}/messaging`)
  revalidatePath(`/w/${slug}/integrations`)
}

/** Seeds products without revalidatePath — safe to call from a Server Component loader. */
export async function seedProductsFromBusinessQuiet(
  workspace: string
): Promise<MessagingResult<Product[]>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const { repository } = gate

  const existing = await repository.listBusinessProducts()
  if (existing.length > 0) return { ok: true, data: existing }

  const business = await repository.getBusinessProfile()
  const names = business?.productsAndServices ?? []
  if (names.length === 0) return { ok: true, data: [] }

  const created: Product[] = []
  for (const name of names) {
    try {
      const product = emptyProduct(crypto.randomUUID())
      product.name = name
      product.description = `Imported from business profile`
      created.push(await repository.saveBusinessProduct(product))
    } catch (error) {
      console.error("[tangent] seed product failed", error)
      return {
        ok: false,
        error:
          "Messaging tables are not ready. Run supabase/migrations/20261119000100_messaging.sql in the Supabase SQL Editor.",
      }
    }
  }
  return { ok: true, data: created }
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".")] ??= issue.message
  }
  return fieldErrors
}

async function requireMessagingManage(workspace: string) {
  const resolved = await resolveWorkspace(workspace)
  if (!resolved.context.permissions.includes("campaigns.manage")) {
    return { ok: false as const, error: "Your role cannot manage messaging." }
  }
  return { ok: true as const, ...resolved }
}

export async function seedProductsFromBusinessAction(
  workspace: string
): Promise<MessagingResult<Product[]>> {
  const result = await seedProductsFromBusinessQuiet(workspace)
  if (!result.ok) return result
  if (result.data.length > 0) {
    const { context, repository } = await resolveWorkspace(workspace)
    await repository.recordAudit({
      action: "messaging.products_seeded",
      entityType: "product",
      entityId: null,
      summary: `Seeded ${result.data.length} products from business profile`,
      actor: { type: "user", id: context.user.id },
    })
    revalidateMessaging(context.workspace.slug)
  }
  return result
}

export async function saveProductAction(
  workspace: string,
  input: Product
): Promise<MessagingResult<Product>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const saved = await gate.repository.saveBusinessProduct(parsed.data)
  await gate.repository.recordAudit({
    action: "messaging.product_saved",
    entityType: "product",
    entityId: saved.id,
    summary: `Saved product "${saved.name}"`,
    actor: { type: "user", id: gate.context.user.id },
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteProductAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteBusinessProduct(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

export async function saveContactAction(
  workspace: string,
  input: Contact
): Promise<MessagingResult<Contact>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  if (!parsed.data.phoneE164 && !parsed.data.email) {
    return { ok: false, error: "Add a phone number or email." }
  }
  const existing = await gate.repository.listContacts({ limit: 50_000 })
  const isNew = !existing.some((c) => c.id === parsed.data.id)
  if (isNew) {
    const capped = quotaError(gate.context, "messaging_contacts_max", 1)
    if (capped) return { ok: false, error: capped }
  }
  const saved = await gate.repository.saveContact(parsed.data)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function optOutContactAction(
  workspace: string,
  contactId: string,
  reason = "manual"
): Promise<MessagingResult<Contact>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const contacts = await gate.repository.listContacts({ limit: 50_000 })
  const contact = contacts.find((c) => c.id === contactId)
  if (!contact) return { ok: false, error: "Contact not found." }
  const now = new Date().toISOString()
  const saved = await gate.repository.saveContact({
    ...contact,
    consentWhatsapp: "opted_out",
    optedOutAt: now,
    consentWhatsappEvidence: `opt_out:${reason}`,
  })
  await gate.repository.recordAudit({
    action: "messaging.contact_opted_out",
    entityType: "contact",
    entityId: saved.id,
    summary: `Opted out ${saved.phoneE164 ?? saved.email ?? saved.id} (${reason})`,
    actor: { type: "user", id: gate.context.user.id },
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteContactAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteContact(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

export async function saveAudienceAction(
  workspace: string,
  input: Audience
): Promise<MessagingResult<Audience>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = audienceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const saved = await gate.repository.saveAudience(parsed.data)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteAudienceAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteAudience(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

function parseConsent(raw: string | undefined): ConsentState {
  if (!raw) return "unknown"
  const lower = raw.trim().toLowerCase()
  if (["1", "true", "yes", "y", "opted_in", "opt-in", "optin"].includes(lower)) return "opted_in"
  if (["0", "false", "no", "n", "opted_out", "opt-out", "optout"].includes(lower)) return "opted_out"
  if ((CONSENT_STATES as readonly string[]).includes(lower)) return lower as ConsentState
  return "unknown"
}

export async function importContactsCsvAction(
  workspace: string,
  input: { csvText: string; filename: string; source: "csv" | "scrape" }
): Promise<MessagingResult<ContactImportBatch>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const { rows } = parseCsvContacts(input.csvText)
  if (rows.length === 0) {
    return { ok: false, error: "CSV is empty. Include a header row and at least one contact." }
  }

  const rawRows: ContactImportRow[] = []
  let accepted = 0
  let rejected = 0

  for (const row of rows) {
    const mapped = mapCsvRow(row)
    const phoneResult = mapped.phone ? normalizePhoneE164(mapped.phone) : null
    if (!phoneResult?.ok && !mapped.email) {
      rejected++
      rawRows.push({
        name: mapped.name,
        phone: mapped.phone,
        email: mapped.email,
        error: phoneResult && !phoneResult.ok ? phoneResult.error : "Missing phone and email",
      })
      continue
    }
    accepted++
    rawRows.push({
      name: mapped.name ?? "",
      phone: mapped.phone,
      email: mapped.email,
      phoneE164: phoneResult?.ok ? phoneResult.e164 : undefined,
      consentWhatsapp: parseConsent(mapped.consentWhatsapp),
      consentSms: parseConsent(mapped.consentSms),
      consentEmail: parseConsent(mapped.consentEmail),
      attributes: Object.fromEntries(
        Object.entries(row).filter(
          ([k]) =>
            ![
              "name",
              "phone",
              "email",
              "mobile",
              "consent_whatsapp",
              "consent_sms",
              "consent_email",
            ].includes(k)
        )
      ),
    })
  }

  const batch: ContactImportBatch = {
    id: crypto.randomUUID(),
    source: input.source,
    filename: input.filename || null,
    status: "pending_review",
    rawRows,
    acceptedCount: accepted,
    rejectedCount: rejected,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const saved = await gate.repository.saveContactImportBatch(batch)
  await gate.repository.recordAudit({
    action: "messaging.import_uploaded",
    entityType: "contact_import_batch",
    entityId: saved.id,
    summary: `Uploaded ${input.source} import "${input.filename}" (${accepted} valid, ${rejected} rejected)`,
    actor: { type: "user", id: gate.context.user.id },
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function acceptImportBatchAction(
  workspace: string,
  batchId: string
): Promise<MessagingResult<{ batch: ContactImportBatch; contacts: Contact[] }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const batches = await gate.repository.listContactImportBatches()
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) return { ok: false, error: "Import batch not found." }
  if (batch.status !== "pending_review") {
    return { ok: false, error: "This import batch was already processed." }
  }

  const contacts: Contact[] = []
  const now = new Date().toISOString()
  for (const row of batch.rawRows) {
    if (row.error || (!row.phoneE164 && !row.email)) continue
    contacts.push({
      id: crypto.randomUUID(),
      phoneE164: row.phoneE164 ?? null,
      email: row.email ?? "",
      name: row.name ?? "",
      source: batch.source,
      consentWhatsapp: row.consentWhatsapp ?? "unknown",
      consentWhatsappAt: row.consentWhatsapp === "opted_in" ? now : null,
      consentWhatsappEvidence:
        row.consentWhatsapp === "opted_in" ? `import:${batch.id}` : null,
      consentSms: row.consentSms ?? "unknown",
      consentEmail: row.consentEmail ?? "unknown",
      attributes: row.attributes ?? {},
      productInterestIds: [],
      optedOutAt:
        row.consentWhatsapp === "opted_out" ||
        row.consentSms === "opted_out" ||
        row.consentEmail === "opted_out"
          ? now
          : null,
      blockedAt: null,
      updatedAt: now,
    })
  }

  const existingCount = (await gate.repository.listContacts({ limit: 50_000 })).length
  const contactCap = quotaError(gate.context, "messaging_contacts_max", contacts.length)
  if (contactCap && existingCount + contacts.length > (DEFAULT_PLANS[gate.context.workspace.planId].entitlements.messaging_contacts_max ?? Infinity)) {
    return { ok: false, error: contactCap }
  }

  const savedContacts = await gate.repository.upsertContacts(contacts)
  const updatedBatch = await gate.repository.saveContactImportBatch({
    ...batch,
    status: "accepted",
    acceptedCount: savedContacts.length,
  })

  await gate.repository.recordAudit({
    action: "messaging.import_accepted",
    entityType: "contact_import_batch",
    entityId: batch.id,
    summary: `Accepted import — ${savedContacts.length} contacts added`,
    actor: { type: "user", id: gate.context.user.id },
  })

  // Fire lead_imported automations (create approval-gated broadcasts).
  await triggerEventAutomations(gate.context.workspace.slug, "lead_imported")

  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { batch: updatedBatch, contacts: savedContacts } }
}

export async function rejectImportBatchAction(
  workspace: string,
  batchId: string
): Promise<MessagingResult<ContactImportBatch>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const batches = await gate.repository.listContactImportBatches()
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) return { ok: false, error: "Import batch not found." }
  const saved = await gate.repository.saveContactImportBatch({
    ...batch,
    status: "rejected",
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function saveTemplateAction(
  workspace: string,
  input: MessageTemplate
): Promise<MessagingResult<MessageTemplate>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = messageTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  if (parsed.data.channel === "sms" && parsed.data.category === "marketing") {
    const dltId = parsed.data.bodyComponents.dltTemplateId?.trim()
    if (!dltId) {
      return {
        ok: false,
        error: "India marketing SMS requires a DLT / MSG91 Flow template id on the template.",
        fieldErrors: { "bodyComponents.dltTemplateId": "Enter the DLT Flow template id" },
      }
    }
  }
  if (parsed.data.channel === "email") {
    const subject =
      parsed.data.bodyComponents.emailSubject?.trim() ||
      parsed.data.bodyComponents.headerText?.trim()
    if (!subject) {
      return {
        ok: false,
        error: "Email templates need a subject line.",
        fieldErrors: { "bodyComponents.emailSubject": "Enter a subject" },
      }
    }
  }
  if (parsed.data.channel === "whatsapp") {
    const headerFormat = parsed.data.bodyComponents.headerFormat
    if (
      (headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT") &&
      !parsed.data.bodyComponents.headerMediaUrl?.trim()
    ) {
      return {
        ok: false,
        error: `Add a public HTTPS ${headerFormat.toLowerCase()} URL for the WhatsApp header.`,
        fieldErrors: { "bodyComponents.headerMediaUrl": "Required for media headers" },
      }
    }
    if (headerFormat === "TEXT" && !parsed.data.bodyComponents.headerText?.trim()) {
      return {
        ok: false,
        error: "Add header text or set header to None.",
        fieldErrors: { "bodyComponents.headerText": "Required for text headers" },
      }
    }
    for (const button of parsed.data.bodyComponents.buttons ?? []) {
      if (button.type === "URL" && !button.url?.trim()) {
        return { ok: false, error: `URL button “${button.text}” needs a website link.` }
      }
      if (button.type === "PHONE_NUMBER" && !button.phoneNumber?.trim()) {
        return { ok: false, error: `Call button “${button.text}” needs a phone number.` }
      }
    }
  }
  const saved = await gate.repository.saveMessageTemplate(parsed.data)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

/** Mark SMS/email drafts ready to send (WhatsApp still goes through Meta approval). */
export async function markTemplateReadyAction(
  workspace: string,
  templateId: string
): Promise<MessagingResult<MessageTemplate>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const templates = await gate.repository.listMessageTemplates()
  const template = templates.find((t) => t.id === templateId)
  if (!template) return { ok: false, error: "Template not found." }
  if (template.channel === "whatsapp") {
    return {
      ok: false,
      error: "WhatsApp templates must be submitted to Meta for approval — use Submit to Meta.",
    }
  }
  if (template.status !== "draft" && template.status !== "rejected" && template.status !== "paused") {
    return { ok: false, error: `Template is already ${template.status}.` }
  }
  if (template.channel === "sms" && template.category === "marketing") {
    if (!template.bodyComponents.dltTemplateId?.trim()) {
      return {
        ok: false,
        error: "Add the DLT / MSG91 Flow template id before marking SMS ready.",
      }
    }
  }
  if (template.channel === "email") {
    const subject =
      template.bodyComponents.emailSubject?.trim() || template.bodyComponents.headerText?.trim()
    if (!subject) {
      return { ok: false, error: "Add an email subject before marking ready." }
    }
  }

  const saved = await gate.repository.saveMessageTemplate({
    ...template,
    status: "approved",
    rejectionReason: null,
    updatedAt: new Date().toISOString(),
  })

  await gate.repository.recordAudit({
    action: "messaging.template_marked_ready",
    entityType: "message_template",
    entityId: saved.id,
    summary: `Marked ${saved.channel} template "${saved.name}" ready to send`,
    actor: { type: "user", id: gate.context.user.id },
  })

  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteTemplateAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteMessageTemplate(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

export async function syncWhatsappTemplatesAction(
  workspace: string,
  connectedAccountId: string
): Promise<MessagingResult<{ synced: number; templates: MessageTemplate[] }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const accounts = await gate.repository.listConnectedAccounts()
  const account = accounts.find((a) => a.id === connectedAccountId && a.provider === "whatsapp")
  if (!account) return { ok: false, error: "WhatsApp account not found. Connect it under Integrations." }
  if (account.status !== "active") {
    return { ok: false, error: "WhatsApp account needs re-authorisation before syncing templates." }
  }

  const token = await loadAccessToken({
    organizationId: gate.context.workspace.id,
    connectedAccountId: account.id,
  })
  if (!token) {
    return {
      ok: false,
      error:
        "No encrypted access token stored for this WhatsApp account. Open Integrations → WhatsApp → linked account → Attach token (paste your System User token), then sync again.",
    }
  }

  try {
    const resolved = await resolveWhatsappAccountIds(token, account.externalAccountId)
    const remote = await listMetaMessageTemplates(token, resolved.wabaId)
    const existing = await gate.repository.listMessageTemplates()
    const byMetaId = new Map(existing.filter((t) => t.metaTemplateId).map((t) => [t.metaTemplateId!, t]))
    const byNameLang = new Map(existing.map((t) => [`${t.name}:${t.language}`, t]))

    const synced: MessageTemplate[] = []
    for (const remoteTpl of remote) {
      const bodyComponent = remoteTpl.components?.find((c) => c.type === "BODY")
      const headerComponent = remoteTpl.components?.find((c) => c.type === "HEADER")
      const footerComponent = remoteTpl.components?.find((c) => c.type === "FOOTER")
      const buttonsComponent = remoteTpl.components?.find((c) => c.type === "BUTTONS")

      const prior =
        byMetaId.get(remoteTpl.id) ?? byNameLang.get(`${remoteTpl.name}:${remoteTpl.language}`)

      const template: MessageTemplate = {
        id: prior?.id ?? crypto.randomUUID(),
        channel: "whatsapp",
        productId: prior?.productId ?? null,
        connectedAccountId: account.id,
        name: remoteTpl.name,
        language: remoteTpl.language,
        category: mapMetaTemplateCategory(remoteTpl.category),
        bodyComponents: {
          headerText: headerComponent?.text,
          headerFormat: (() => {
            const format = headerComponent?.format?.toUpperCase()
            if (
              format === "TEXT" ||
              format === "IMAGE" ||
              format === "VIDEO" ||
              format === "DOCUMENT" ||
              format === "LOCATION"
            ) {
              return format
            }
            return prior?.bodyComponents.headerFormat
          })(),
          headerMediaUrl:
            headerComponent?.example?.header_url?.[0] ||
            (headerComponent?.example?.header_handle?.[0]?.startsWith("http")
              ? headerComponent.example.header_handle[0]
              : undefined) ||
            prior?.bodyComponents.headerMediaUrl,
          bodyText: bodyComponent?.text ?? prior?.bodyComponents.bodyText ?? "(synced from Meta)",
          footerText: footerComponent?.text,
          variableExamples: bodyComponent?.example?.body_text?.[0] ?? [],
          buttons: (buttonsComponent?.buttons ?? []).map((b) => ({
            type: b.type as "QUICK_REPLY" | "URL" | "PHONE_NUMBER",
            text: b.text,
            url: b.url,
            phoneNumber: b.phone_number,
          })),
        },
        status: mapMetaTemplateStatus(remoteTpl.status),
        metaTemplateId: remoteTpl.id,
        metaNamespace: prior?.metaNamespace ?? null,
        rejectionReason:
          remoteTpl.rejected_reason && remoteTpl.rejected_reason.toUpperCase() !== "NONE"
            ? remoteTpl.rejected_reason
            : null,
        updatedAt: new Date().toISOString(),
      }

      const saved = await gate.repository.saveMessageTemplate(template)
      synced.push(saved)
    }

    await gate.repository.recordAudit({
      action: "messaging.templates_synced",
      entityType: "connected_account",
      entityId: account.id,
      summary: `Synced ${synced.length} WhatsApp templates from Meta`,
      actor: { type: "user", id: gate.context.user.id },
    })

    revalidateMessaging(gate.context.workspace.slug)
    return { ok: true, data: { synced: synced.length, templates: synced } }
  } catch (error) {
    const message =
      error instanceof IntegrationError
        ? error.message
        : "Could not sync templates from Meta."
    return { ok: false, error: message }
  }
}

export async function submitTemplateToMetaAction(
  workspace: string,
  templateId: string,
  connectedAccountId: string
): Promise<MessagingResult<MessageTemplate>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const templates = await gate.repository.listMessageTemplates()
  const template = templates.find((t) => t.id === templateId)
  if (!template) return { ok: false, error: "Template not found." }

  const accounts = await gate.repository.listConnectedAccounts()
  const account = accounts.find((a) => a.id === connectedAccountId && a.provider === "whatsapp")
  if (!account) return { ok: false, error: "WhatsApp account not found." }

  const token = await loadAccessToken({
    organizationId: gate.context.workspace.id,
    connectedAccountId: account.id,
  })
  if (!token) {
    return { ok: false, error: "No encrypted access token for this WhatsApp account." }
  }

  const category =
    template.category === "utility"
      ? "UTILITY"
      : template.category === "authentication"
        ? "AUTHENTICATION"
        : "MARKETING"

  try {
    const resolved = await resolveWhatsappAccountIds(token, account.externalAccountId)
    const headerFormat = template.bodyComponents.headerFormat
    const headerMediaUrl = template.bodyComponents.headerMediaUrl?.trim()
    let headerMediaHandle: string | undefined
    if (
      headerFormat === "IMAGE" ||
      headerFormat === "VIDEO" ||
      headerFormat === "DOCUMENT"
    ) {
      if (!headerMediaUrl) {
        return {
          ok: false,
          error: `This template has a ${headerFormat} header. Add a public HTTPS sample media URL in Edit, then submit again.`,
        }
      }
      headerMediaHandle = await uploadMetaTemplateMediaSample({
        accessToken: token,
        mediaUrl: headerMediaUrl,
        format: headerFormat,
      })
    }

    const buttons = template.bodyComponents.buttons ?? []
    for (const button of buttons) {
      if (button.type === "URL" && !button.url?.trim()) {
        return { ok: false, error: `URL button “${button.text}” needs a link.` }
      }
      if (button.type === "PHONE_NUMBER" && !button.phoneNumber?.trim()) {
        return { ok: false, error: `Call button “${button.text}” needs a phone number.` }
      }
    }

    const result = await submitMetaMessageTemplate(token, resolved.wabaId, {
      name: template.name,
      language: template.language,
      category,
      headerText: template.bodyComponents.headerText,
      headerFormat,
      headerMediaUrl,
      headerMediaHandle,
      bodyText: template.bodyComponents.bodyText,
      footerText: template.bodyComponents.footerText,
      variableExamples: template.bodyComponents.variableExamples,
      buttons,
    })

    const saved = await gate.repository.saveMessageTemplate({
      ...template,
      connectedAccountId: account.id,
      metaTemplateId: result.id,
      status: mapMetaTemplateStatus(result.status),
      rejectionReason: null,
      bodyComponents: {
        ...template.bodyComponents,
        headerFormat:
          headerFormat ??
          (template.bodyComponents.headerText?.trim() ? "TEXT" : template.bodyComponents.headerFormat),
        headerMediaUrl: headerMediaUrl || template.bodyComponents.headerMediaUrl,
      },
    })

    await gate.repository.recordAudit({
      action: "messaging.template_submitted",
      entityType: "message_template",
      entityId: saved.id,
      summary: `Submitted template "${saved.name}" to Meta (${saved.status})`,
      actor: { type: "user", id: gate.context.user.id },
    })

    revalidateMessaging(gate.context.workspace.slug)
    return { ok: true, data: saved }
  } catch (error) {
    const message =
      error instanceof IntegrationError ? error.message : "Meta rejected the template submission."
    return { ok: false, error: message }
  }
}

export async function saveBroadcastAction(
  workspace: string,
  input: MessageBroadcast
): Promise<MessagingResult<MessageBroadcast>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = messageBroadcastSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  const templates = await gate.repository.listMessageTemplates()
  const template = templates.find((t) => t.id === parsed.data.templateId)
  if (!template) return { ok: false, error: "Template not found." }

  const expectedProvider = CHANNEL_PROVIDER[template.channel]
  const accounts = await gate.repository.listConnectedAccounts()
  const account = accounts.find((a) => a.id === parsed.data.connectedAccountId)
  if (!account || account.provider !== expectedProvider) {
    return {
      ok: false,
      error: `Pick a connected ${MESSAGE_CHANNEL_LABELS[template.channel]} account (${expectedProvider}).`,
    }
  }

  const saved = await gate.repository.saveBroadcast({
    ...parsed.data,
    channel: template.channel,
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteBroadcastAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteBroadcast(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

export async function submitBroadcastForApprovalAction(
  workspace: string,
  broadcastId: string
): Promise<MessagingResult<MessageBroadcast>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const broadcast = await gate.repository.getBroadcast(broadcastId)
  if (!broadcast) return { ok: false, error: "Broadcast not found." }
  if (broadcast.status !== "draft" && broadcast.status !== "failed") {
    return { ok: false, error: "Only draft or failed broadcasts can be submitted for approval." }
  }

  const template = (await gate.repository.listMessageTemplates()).find(
    (t) => t.id === broadcast.templateId
  )
  if (!template) return { ok: false, error: "Template not found." }
  if (template.status !== "approved") {
    return {
      ok: false,
      error:
        template.channel === "whatsapp"
          ? "Template must be Meta-approved before bulk send."
          : "Template must be marked ready before bulk send.",
    }
  }

  const expectedProvider = CHANNEL_PROVIDER[template.channel]
  const accounts = await gate.repository.listConnectedAccounts()
  const account = accounts.find((a) => a.id === broadcast.connectedAccountId)
  if (!account || account.provider !== expectedProvider) {
    return {
      ok: false,
      error: `Connected account must be a ${MESSAGE_CHANNEL_LABELS[template.channel]} (${expectedProvider}) account.`,
    }
  }

  const audience = (await gate.repository.listAudiences()).find((a) => a.id === broadcast.audienceId)
  if (!audience) return { ok: false, error: "Audience not found." }

  const contacts = await gate.repository.listContacts({ limit: 5000 })
  const memberSet = new Set(audience.memberIds)
  const eligible = contacts.filter(
    (c) =>
      memberSet.has(c.id) &&
      contactReachableOnChannel(c, template.channel) &&
      contactHasChannelConsent(c, template.channel, template.category)
  )

  if (eligible.length === 0) {
    const channelLabel = MESSAGE_CHANNEL_LABELS[template.channel]
    return {
      ok: false,
      error: `No eligible contacts for ${channelLabel} (need reachable address + ${channelLabel} opt-in for marketing).`,
    }
  }

  const snapshotIds = eligible.map((c) => c.id)
  const draftBroadcast: MessageBroadcast = {
    ...broadcast,
    channel: template.channel,
    contactSnapshotIds: snapshotIds,
    status: "pending_approval",
  }

  const payload = await buildBroadcastApprovalPayload({
    broadcast: draftBroadcast,
    template,
    contactIds: snapshotIds,
  })

  const channelLabel = MESSAGE_CHANNEL_LABELS[template.channel]
  const approval = await gate.repository.createApprovalRequest({
    actionType: "send_marketing_message",
    title: `Send ${channelLabel} “${template.name}” to ${snapshotIds.length} contacts`,
    connectedAccountId: broadcast.connectedAccountId,
    payload,
    financialImpact: null,
    requestedByAgent: null,
  })

  const saved = await gate.repository.saveBroadcast({
    ...draftBroadcast,
    approvalRequestId: approval.id,
  })

  await gate.repository.recordAudit({
    action: "messaging.broadcast_submitted",
    entityType: "message_broadcast",
    entityId: saved.id,
    summary: `Submitted broadcast "${saved.name}" for approval (${snapshotIds.length} recipients)`,
    actor: { type: "user", id: gate.context.user.id },
  })

  revalidateMessaging(gate.context.workspace.slug)
  revalidatePath(`/w/${gate.context.workspace.slug}/command-centre`)
  return { ok: true, data: saved }
}

export async function executeBroadcastAction(
  workspace: string,
  broadcastId: string
): Promise<MessagingResult<MessageBroadcast>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role cannot execute approved marketing sends." }
  }

  const broadcast = await repository.getBroadcast(broadcastId)
  if (!broadcast) return { ok: false, error: "Broadcast not found." }
  if (!broadcast.approvalRequestId) {
    return { ok: false, error: "Broadcast has no approval request." }
  }
  if (
    broadcast.status !== "pending_approval" &&
    broadcast.status !== "approved" &&
    broadcast.status !== "failed"
  ) {
    return { ok: false, error: `Cannot execute a broadcast in status "${broadcast.status}".` }
  }

  const executable = await repository.getApprovalExecutable(broadcast.approvalRequestId)
  if (!executable) return { ok: false, error: "Approval request not found." }
  if (executable.status !== "approved") {
    return { ok: false, error: `Approval is ${executable.status}. Approve it before sending.` }
  }

  const settings = await repository.getMessagingSettings()
  if (
    isWithinQuietHours(new Date(), {
      enabled: settings.quietHoursEnabled,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
      timezone: settings.timezone,
    })
  ) {
    return {
      ok: false,
      error: `Quiet hours are active (${settings.quietHoursStart}–${settings.quietHoursEnd} ${settings.timezone}). Try again later.`,
    }
  }

  const template = (await repository.listMessageTemplates()).find((t) => t.id === broadcast.templateId)
  if (!template) return { ok: false, error: "Template not found." }

  const contacts = await repository.listContacts({ limit: 5000 })
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const snapshot = broadcast.contactSnapshotIds
    .map((id) => byId.get(id))
    .filter((c): c is Contact => Boolean(c))

  const sendQuota = quotaError(context, "messaging_sends_monthly", Math.max(1, snapshot.length))
  if (sendQuota) return { ok: false, error: sendQuota }

  const payload = executable.payload as BroadcastApprovalPayload
  const approvalRequest: ApprovalRequest<BroadcastApprovalPayload> = {
    id: executable.id,
    version: 1,
    previousVersionId: null,
    actionType: "send_marketing_message",
    connectedAccountId: broadcast.connectedAccountId,
    payload,
    payloadHash: executable.payloadHash,
    financialImpact: null,
    requestedByAgent: null,
    status: "approved",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  }

  try {
    const saved = await executeApprovedBroadcast({
      organizationId: context.workspace.id,
      repository,
      broadcast: { ...broadcast, status: "approved" },
      template,
      contacts: snapshot,
      approval: approvalRequest,
      payload,
    })

    if (saved.stats.sent > 0) {
      await repository.recordUsage("messaging_sends_monthly", saved.stats.sent, {
        broadcastId: saved.id,
      })
    }

    await repository.recordAudit({
      action: "messaging.broadcast_executed",
      entityType: "message_broadcast",
      entityId: saved.id,
      summary: `Executed broadcast "${saved.name}" — sent ${saved.stats.sent}, failed ${saved.stats.failed}, skipped ${saved.stats.skipped}`,
      actor: { type: "user", id: context.user.id },
    })

    revalidateMessaging(context.workspace.slug)
    return { ok: true, data: saved }
  } catch (error) {
    if (error instanceof ApprovalError || error instanceof IntegrationError) {
      return { ok: false, error: error.message }
    }
    console.error("[tangent] broadcast execute failed", error)
    return { ok: false, error: "Could not execute the broadcast." }
  }
}

/**
 * One-click test send: upsert optional contact, create a 1-recipient broadcast,
 * human-confirm via this action (approve + execute) for users with content.publish.
 */
export async function testSendTemplateAction(
  workspace: string,
  input: {
    templateId: string
    connectedAccountId: string
    contactId?: string
    newContact?: {
      name: string
      phone: string
      email?: string
      consentWhatsapp?: ConsentState
    }
    variableValues: Record<string, string>
    /** Public HTTPS URL for IMAGE/VIDEO/DOCUMENT template headers. */
    headerMediaUrl?: string
  }
): Promise<MessagingResult<{ broadcast: MessageBroadcast; contact: Contact }>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("campaigns.manage")) {
    return { ok: false, error: "Your role cannot manage messaging." }
  }
  if (!context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role cannot send messages. Ask an Owner/Admin to grant publish." }
  }

  const templates = await repository.listMessageTemplates()
  const template = templates.find((t) => t.id === input.templateId)
  if (!template) return { ok: false, error: "Template not found." }
  if (template.status !== "approved") {
    return { ok: false, error: "Only approved / ready templates can be test-sent." }
  }

  const expectedProvider = CHANNEL_PROVIDER[template.channel]
  const accounts = await repository.listConnectedAccounts()
  const account = accounts.find((a) => a.id === input.connectedAccountId)
  if (!account || account.provider !== expectedProvider) {
    return {
      ok: false,
      error: `Pick a connected ${MESSAGE_CHANNEL_LABELS[template.channel]} account.`,
    }
  }

  let contact: Contact | undefined
  if (input.contactId) {
    contact = (await repository.listContacts({ limit: 5000 })).find((c) => c.id === input.contactId)
    if (!contact) return { ok: false, error: "Contact not found." }
  } else if (input.newContact) {
    const phoneResult = normalizePhoneE164(input.newContact.phone)
    if (!phoneResult.ok && template.channel !== "email") {
      return { ok: false, error: phoneResult.error }
    }
    if (template.channel === "email" && !input.newContact.email?.includes("@")) {
      return { ok: false, error: "Enter a valid email for email templates." }
    }
    const consent =
      input.newContact.consentWhatsapp &&
      (CONSENT_STATES as readonly string[]).includes(input.newContact.consentWhatsapp)
        ? input.newContact.consentWhatsapp
        : "opted_in"
    const now = new Date().toISOString()
    const draft = emptyContact(crypto.randomUUID())
    draft.name = input.newContact.name.trim() || "Test contact"
    draft.phoneE164 = phoneResult.ok ? phoneResult.e164 : null
    draft.email = input.newContact.email?.trim() || ""
    draft.source = "manual"
    draft.consentWhatsapp = consent
    draft.consentWhatsappAt = consent === "opted_in" ? now : null
    draft.consentWhatsappEvidence = consent === "opted_in" ? "test_send:manual" : null
    draft.consentSms = consent
    draft.consentEmail = consent
    const capped = quotaError(context, "messaging_contacts_max", 1)
    if (capped) return { ok: false, error: capped }
    contact = await repository.saveContact(draft)
  } else {
    return { ok: false, error: "Select a contact or enter new contact details." }
  }

  if (!contactReachableOnChannel(contact, template.channel)) {
    return {
      ok: false,
      error: `Contact is missing a ${template.channel === "email" ? "email" : "phone"} for this channel.`,
    }
  }
  if (!contactHasChannelConsent(contact, template.channel, template.category)) {
    return {
      ok: false,
      error: `Marketing sends require ${MESSAGE_CHANNEL_LABELS[template.channel]} opt-in on the contact.`,
    }
  }

  // Quiet hours still apply to bulk execute / automations — not to explicit one-contact test sends.

  const placeholders = listTemplatePlaceholders(template.bodyComponents.bodyText)
  const variableMapping: Record<string, string> = {}
  for (const placeholder of placeholders) {
    const value = input.variableValues[placeholder]?.trim()
    if (value) variableMapping[placeholder] = `literal:${value}`
  }

  const sendQuota = quotaError(context, "messaging_sends_monthly", 1)
  if (sendQuota) return { ok: false, error: sendQuota }

  const audiences = await repository.listAudiences()
  let testAudience = audiences.find((a) => a.name === "Test sends")
  if (!testAudience) {
    testAudience = await repository.saveAudience({
      ...emptyAudience(crypto.randomUUID()),
      name: "Test sends",
      description: "Single-contact and template test sends",
      memberIds: [contact.id],
      estimatedSize: 1,
      refreshedAt: new Date().toISOString(),
    })
  } else if (!testAudience.memberIds.includes(contact.id)) {
    testAudience = await repository.saveAudience({
      ...testAudience,
      memberIds: [...testAudience.memberIds, contact.id],
      estimatedSize: testAudience.memberIds.length + 1,
      refreshedAt: new Date().toISOString(),
    })
  }

  const broadcast = emptyBroadcast(crypto.randomUUID())
  broadcast.name = `Test · ${template.name} · ${contact.name || contact.phoneE164 || "contact"}`.slice(
    0,
    160
  )
  broadcast.channel = template.channel
  broadcast.templateId = template.id
  broadcast.audienceId = testAudience.id
  broadcast.connectedAccountId = account.id
  broadcast.variableMapping = variableMapping
  broadcast.contactSnapshotIds = [contact.id]
  broadcast.status = "pending_approval"

  const broadcastParsed = messageBroadcastSchema.safeParse(broadcast)
  if (!broadcastParsed.success) {
    return { ok: false, error: "Could not build test broadcast.", fieldErrors: fieldErrorsFromZod(broadcastParsed.error) }
  }

  const payload = await buildBroadcastApprovalPayload({
    broadcast: broadcastParsed.data,
    template,
    contactIds: [contact.id],
  })

  try {
    const approval = await repository.createApprovalRequest({
      actionType: "send_marketing_message",
      title: `Test send ${MESSAGE_CHANNEL_LABELS[template.channel]} “${template.name}” to ${contact.name || contact.phoneE164}`,
      connectedAccountId: account.id,
      payload,
      financialImpact: null,
      requestedByAgent: null,
    })

    await repository.decideApproval(approval.id, "approve", "Test send confirmed in Messaging", context.user.id)

    const headerMediaUrl =
      input.headerMediaUrl?.trim() || template.bodyComponents.headerMediaUrl?.trim()

    const bodyParameters = resolveTemplateParameters(contact, variableMapping, placeholders)
    let sent: { messageId: string }
    try {
      sent = await sendTemplateToSingleContact({
        organizationId: context.workspace.id,
        channel: template.channel,
        connectedAccountId: account.id,
        accountProvider: account.provider,
        accountExternalId: account.externalAccountId,
        template,
        contact,
        bodyParameters,
        bodyParameterNames: placeholders,
        headerMediaUrl,
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError)
      if (/requires a (IMAGE|VIDEO|DOCUMENT) header/i.test(message) && !headerMediaUrl) {
        return {
          ok: false,
          error:
            "This WhatsApp template has an image/video header. Paste a public HTTPS media URL in Header media URL, then send again.",
        }
      }
      throw sendError
    }

    // Persist broadcast when M2 tables exist; test send still works without them.
    let savedBroadcast: MessageBroadcast = {
      ...broadcastParsed.data,
      approvalRequestId: approval.id,
      status: "completed",
      stats: { queued: 1, sent: 1, delivered: 0, read: 0, failed: 0, skipped: 0 },
      lastError: null,
      updatedAt: new Date().toISOString(),
    }
    try {
      savedBroadcast = await repository.saveBroadcast(savedBroadcast)
    } catch (persistError) {
      console.warn(
        "[tangent] test send succeeded but broadcast table missing — run 20261119000200_messaging_broadcasts.sql",
        persistError
      )
    }

    await repository.recordUsage("messaging_sends_monthly", 1, {
      broadcastId: savedBroadcast.id,
      test: true,
      providerMessageId: sent.messageId,
    })

    await repository.recordAudit({
      action: "messaging.template_test_sent",
      entityType: "message_broadcast",
      entityId: savedBroadcast.id,
      summary: `Test-sent “${template.name}” to ${contact.phoneE164 ?? contact.email} (${sent.messageId})`,
      actor: { type: "user", id: context.user.id },
    })

    revalidateMessaging(context.workspace.slug)
    revalidatePath(`/w/${context.workspace.slug}/command-centre`)

    return { ok: true, data: { broadcast: savedBroadcast, contact } }
  } catch (error) {
    if (error instanceof ApprovalError || error instanceof IntegrationError) {
      return { ok: false, error: error.message }
    }
    const message = error instanceof Error ? error.message : "Could not complete the test send."
    if (message.includes("message_broadcasts") || message.includes("schema cache")) {
      return {
        ok: false,
        error:
          "Messaging broadcast tables are missing. Run supabase/migrations/20261119000200_messaging_broadcasts.sql (and …00300_messaging_automations.sql) in the Supabase SQL Editor, then try again.",
      }
    }
    console.error("[tangent] test send failed", error)
    return { ok: false, error: message }
  }
}

async function createBroadcastFromAutomation(
  workspace: string,
  automation: MessageAutomation,
  nameSuffix: string
): Promise<MessagingResult<MessageBroadcast>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const draft = emptyBroadcast(crypto.randomUUID())
  draft.name = `${automation.name} · ${nameSuffix}`.slice(0, 160)
  draft.channel = automation.channel
  draft.productId = automation.productId
  draft.templateId = automation.templateId
  draft.audienceId = automation.audienceId
  draft.connectedAccountId = automation.connectedAccountId
  draft.variableMapping = automation.variableMapping
  draft.status = "draft"

  const saved = await gate.repository.saveBroadcast(draft)
  if (automation.requireApprovalEachRun) {
    return submitBroadcastForApprovalAction(workspace, saved.id)
  }
  return { ok: true, data: saved }
}

async function triggerEventAutomations(
  workspace: string,
  eventType: "lead_imported"
): Promise<void> {
  try {
    const { repository } = await resolveWorkspace(workspace)
    const automations = await repository.listAutomations()
    const matching = automations.filter(
      (a) => a.enabled && a.triggerKind === "event" && a.eventType === eventType
    )
    for (const automation of matching) {
      await createBroadcastFromAutomation(
        workspace,
        automation,
        eventType === "lead_imported" ? "import" : eventType
      )
      await repository.saveAutomation({
        ...automation,
        lastRunAt: new Date().toISOString(),
        lastError: null,
      })
    }
  } catch (error) {
    console.error("[tangent] event automation trigger failed", error)
  }
}

export async function saveMessagingSettingsAction(
  workspace: string,
  input: MessagingSettings
): Promise<MessagingResult<MessagingSettings>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = messagingSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check quiet hours and keywords.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  try {
    const saved = await gate.repository.saveMessagingSettings(parsed.data)
    // Confirm intake flags actually persisted (migration may be missing).
    const reloaded = await gate.repository.getMessagingSettings()
    if (
      parsed.data.intakeAutoSend &&
      !reloaded.intakeAutoSend &&
      parsed.data.intakeFlowEnabled
    ) {
      return {
        ok: false,
        error:
          "Settings saved without intake columns. Run supabase/migrations/20261121000100_messaging_intake_flow.sql in Supabase, then save again.",
      }
    }
    await gate.repository.recordAudit({
      action: "messaging.settings_saved",
      entityType: "messaging_settings",
      entityId: gate.context.workspace.id,
      summary: `Updated messaging settings (intake ${saved.intakeFlowEnabled ? "on" : "off"}, auto-send ${saved.intakeAutoSend ? "on" : "off"})`,
      actor: { type: "user", id: gate.context.user.id },
    })
    revalidateMessaging(gate.context.workspace.slug)
    return { ok: true, data: saved }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save messaging settings.",
    }
  }
}

export async function saveAutomationAction(
  workspace: string,
  input: MessageAutomation
): Promise<MessagingResult<MessageAutomation>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const parsed = messageAutomationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  const existing = await gate.repository.listAutomations()
  const isNew = !existing.some((a) => a.id === parsed.data.id)
  if (isNew) {
    const capped = quotaError(gate.context, "messaging_automations", 1)
    if (capped) return { ok: false, error: capped }
  }

  let nextRunAt = parsed.data.nextRunAt
  if (parsed.data.enabled && parsed.data.triggerKind === "schedule" && parsed.data.schedulePreset) {
    nextRunAt = computeNextRunAt({
      from: new Date(),
      preset: parsed.data.schedulePreset,
      timeHm: parsed.data.scheduleTime,
      timeZone: parsed.data.scheduleTimezone,
      dayOfWeek: parsed.data.scheduleDayOfWeek,
      dayOfMonth: parsed.data.scheduleDayOfMonth,
    }).toISOString()
  }

  const saved = await gate.repository.saveAutomation({
    ...parsed.data,
    nextRunAt: parsed.data.enabled ? nextRunAt : null,
  })
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: saved }
}

export async function deleteAutomationAction(
  workspace: string,
  id: string
): Promise<MessagingResult<{ id: string }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  await gate.repository.deleteAutomation(id)
  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { id } }
}

export async function runDueAutomationsAction(
  workspace: string
): Promise<MessagingResult<{ ran: number; broadcasts: MessageBroadcast[] }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const settings = await gate.repository.getMessagingSettings()
  if (
    isWithinQuietHours(new Date(), {
      enabled: settings.quietHoursEnabled,
      start: settings.quietHoursStart,
      end: settings.quietHoursEnd,
      timezone: settings.timezone || DEFAULT_QUIET_HOURS.timezone,
    })
  ) {
    return {
      ok: false,
      error: `Quiet hours are active — scheduled automations will not run until ${settings.quietHoursEnd} ${settings.timezone}.`,
    }
  }

  const now = new Date()
  const automations = await gate.repository.listAutomations()
  const due = automations.filter(
    (a) =>
      a.enabled &&
      a.triggerKind === "schedule" &&
      a.schedulePreset &&
      a.nextRunAt &&
      new Date(a.nextRunAt).getTime() <= now.getTime()
  )

  const broadcasts: MessageBroadcast[] = []
  for (const automation of due) {
    const result = await createBroadcastFromAutomation(
      workspace,
      automation,
      now.toISOString().slice(0, 10)
    )
    if (result.ok) broadcasts.push(result.data)

    const nextRunAt = computeNextRunAt({
      from: now,
      preset: automation.schedulePreset!,
      timeHm: automation.scheduleTime,
      timeZone: automation.scheduleTimezone,
      dayOfWeek: automation.scheduleDayOfWeek,
      dayOfMonth: automation.scheduleDayOfMonth,
    }).toISOString()

    await gate.repository.saveAutomation({
      ...automation,
      lastRunAt: now.toISOString(),
      nextRunAt,
      lastError: result.ok ? null : result.error,
    })
  }

  await gate.repository.recordAudit({
    action: "messaging.automations_ran",
    entityType: "message_automation",
    entityId: null,
    summary: `Ran ${broadcasts.length} due automation(s)`,
    actor: { type: "user", id: gate.context.user.id },
  })

  revalidateMessaging(gate.context.workspace.slug)
  return { ok: true, data: { ran: broadcasts.length, broadcasts } }
}

export async function listInboxThreadsAction(
  workspace: string
): Promise<MessagingResult<ConversationThread[]>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  const threads = await gate.repository.listConversationThreads({ limit: 80 })
  return { ok: true, data: threads }
}

export async function enableInstagramLiveInboxAction(
  workspace: string,
  connectedAccountId?: string
): Promise<
  MessagingResult<{
    callbackUrl: string
    verifyTokenHint: string
    subscribed: boolean
    mode?: "webhook" | "poll"
    detail?: string
  }>
> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const accounts = await gate.repository.listConnectedAccounts()
  const instagramAccounts = accounts.filter(
    (a) => a.provider === "instagram" && a.status !== "revoked"
  )
  const account =
    (connectedAccountId
      ? instagramAccounts.find((a) => a.id === connectedAccountId)
      : undefined) ?? instagramAccounts[0]
  if (!account) {
    return {
      ok: false,
      error: "Connect Instagram under Integrations first, then enable live inbox.",
    }
  }

  const token = await loadAccessToken({
    organizationId: gate.context.workspace.id,
    connectedAccountId: account.id,
  })
  if (!token) {
    return {
      ok: false,
      error: "No Instagram access token stored. Attach a System User token first.",
    }
  }

  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  const callbackUrl = `${appUrl}/api/integrations/meta/webhook`
  const verifyTokenHint =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.META_WHATSAPP_VERIFY_TOKEN ||
    "tangent-whatsapp-verify"
  const isLocalCallback = /localhost|127\.0\.0\.1/i.test(appUrl)

  let pageId: string | undefined
  let pageAccessToken: string | undefined
  try {
    const page = await resolvePageForInstagram({
      accessToken: token,
      igUserId: account.externalAccountId,
    })
    pageId = page.pageId
    pageAccessToken = page.pageToken
  } catch {
    /* subscribe may still work with IG user token */
  }

  const subscribed = isLocalCallback
    ? {
        ok: false as const,
        error:
          "NEXT_PUBLIC_APP_URL is localhost — Meta cannot push webhooks to your PC. Inbox will use live Meta polling while this tab is open. For true push webhooks, set NEXT_PUBLIC_APP_URL to a public HTTPS URL (ngrok / production) and re-enable.",
      }
    : await subscribeInstagramLiveWebhooks({
        accessToken: token,
        igUserId: account.externalAccountId,
        pageId,
        pageAccessToken,
      })

  await gate.repository.recordAudit({
    action: "messaging.instagram_live_enabled",
    entityType: "connected_account",
    entityId: account.id,
    summary: isLocalCallback
      ? `Instagram live poll mode for ${account.displayName} (localhost — no Meta push)`
      : subscribed.ok
        ? `Enabled live Instagram inbox webhooks for ${account.displayName}`
        : `Attempted Instagram live inbox setup for ${account.displayName}`,
    actor: { type: "user", id: gate.context.user.id },
    metadata: { callbackUrl, subscribed: subscribed.ok, isLocalCallback },
  })

  // Localhost: succeed in "poll mode" so the UI turns live polling on.
  if (isLocalCallback) {
    return {
      ok: true,
      data: {
        callbackUrl,
        verifyTokenHint,
        subscribed: false,
        mode: "poll",
        detail: subscribed.ok ? undefined : subscribed.error,
      },
    }
  }

  if (!subscribed.ok) {
    return {
      ok: false,
      error: `${subscribed.error} Also set Meta App → Webhooks → Instagram Callback URL to ${callbackUrl} with verify token “${verifyTokenHint}”, fields: messages, comments.`,
    }
  }

  return {
    ok: true,
    data: { callbackUrl, verifyTokenHint, subscribed: true, mode: "webhook" },
  }
}

export async function syncInstagramInboxAction(
  workspace: string,
  connectedAccountId?: string
): Promise<
  MessagingResult<{
    conversations: number
    messages: number
    comments: number
    threads: ConversationThread[]
    autoSent: number
    autoDrafted: number
    autoErrors: string[]
    intakeAutoSend: boolean
  }>
> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate

  const accounts = await gate.repository.listConnectedAccounts()
  const instagramAccounts = accounts.filter(
    (a) => a.provider === "instagram" && a.status !== "revoked"
  )
  const account =
    (connectedAccountId
      ? instagramAccounts.find((a) => a.id === connectedAccountId)
      : undefined) ?? instagramAccounts[0]
  if (!account) {
    return {
      ok: false,
      error:
        "No Instagram account on this workspace. Open Integrations → Instagram → Add/Connect (and Attach token), then try Sync Instagram again.",
    }
  }

  const token = await loadAccessToken({
    organizationId: gate.context.workspace.id,
    connectedAccountId: account.id,
  })
  if (!token) {
    return {
      ok: false,
      error:
        "No encrypted Instagram token stored. Open Integrations → Instagram → Attach token, paste a System User token with instagram_manage_messages + pages_messaging, then Sync again.",
    }
  }

  try {
    const result = await syncInstagramInbox({
      repository: gate.repository,
      organizationId: gate.context.workspace.id,
      connectedAccountId: account.id,
      igUserId: account.externalAccountId,
      accessToken: token,
      ourIgUsername: account.displayName.replace(/^@/, ""),
    })

    // Localhost cannot receive Meta webhooks — run intake/AI for new DMs + catch-up.
    const settings = await gate.repository.getMessagingSettings()
    const autoErrors: string[] = []
    let autoSent = 0
    let autoDrafted = 0

    const jobs: {
      id: string
      threadId: string
      body: string
      participantName: string
    }[] = [...result.newInbound]

    // Catch-up: latest inbound that still has no outbound after it (waiting for auto-reply).
    const threads = await gate.repository.listConversationThreads({ limit: 20 })
    for (const thread of threads) {
      if (thread.channel !== "instagram") continue
      if (thread.externalThreadKey.startsWith("ig_comments:")) continue
      if (jobs.some((j) => j.threadId === thread.id)) continue
      const messages = await gate.repository.listConversationMessages(thread.id)
      let pending: (typeof messages)[number] | null = null
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (!m) continue
        if (m.direction === "outbound") break
        if (m.direction === "inbound") {
          pending = m
          break
        }
      }
      if (!pending) continue
      jobs.push({
        id: pending.id,
        threadId: thread.id,
        body: pending.body,
        participantName: thread.participantName || thread.participantHandle || "Customer",
      })
      if (jobs.length >= 8) break
    }

    const env = serverEnv()
    const admin =
      publicEnv.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null

    if (!admin) {
      autoErrors.push(
        "SUPABASE_SERVICE_ROLE_KEY is missing — intake can draft but may not auto-send on sync. Add it to .env."
      )
    }

    for (const inbound of jobs.slice(0, 8)) {
      try {
        if (admin) {
          const before = await gate.repository.listConversationMessages(inbound.threadId)
          const outboundBefore = before.filter((m) => m.direction === "outbound").length
          await processInboundAiAndMaybeReply({
            admin,
            organizationId: gate.context.workspace.id,
            threadId: inbound.threadId,
            messageId: inbound.id,
            connectedAccountId: account.id,
            channel: "instagram",
            body: inbound.body,
            participantName: inbound.participantName,
          })
          const after = await gate.repository.listConversationMessages(inbound.threadId)
          const outboundAfter = after.filter((m) => m.direction === "outbound").length
          if (outboundAfter > outboundBefore) autoSent += 1
          else {
            const latestInbound = [...after].reverse().find((m) => m.id === inbound.id)
            if (latestInbound?.aiDraftReply) autoDrafted += 1
          }
        } else {
          // No service role: still compute intake draft onto the inbound message via repository.
          const messages = await gate.repository.listConversationMessages(inbound.threadId)
          const metadata = await gate.repository.getConversationThreadMetadata(inbound.threadId)
          const intake = resolveIntakeReply({
            settings,
            state: readIntakeState(metadata),
            latestInbound: inbound.body,
            recentMessages: messages.map((m) => ({ direction: m.direction, body: m.body })),
          })
          if (intake?.draftReply) {
            await gate.repository.mergeConversationThreadMetadata(inbound.threadId, {
              intake: intake.nextState,
            })
            await gate.repository.updateConversationMessageAi(inbound.id, {
              aiIntent: intake.intent,
              aiSentiment: "neutral",
              aiConfidence: intake.confidence,
              aiDraftReply: intake.draftReply,
              aiShouldAutoReply: intake.shouldAutoReply,
            })
            autoDrafted += 1
            if (settings.intakeAutoSend && intake.shouldAutoReply) {
              const thread = await gate.repository.getConversationThread(inbound.threadId)
              if (!thread) continue
              let toHandle = thread.participantHandle
              if (!/^\d+$/.test(toHandle.replace(/^@/, ""))) {
                const igId = metadata.participantIgId
                if (typeof igId === "string" && /^\d+$/.test(igId)) toHandle = igId
              }
              try {
                const sent = await sendInboxSessionReply({
                  organizationId: gate.context.workspace.id,
                  channel: "instagram",
                  connectedAccountId: account.id,
                  accountExternalId: account.externalAccountId,
                  accountProvider: "instagram",
                  toHandle,
                  body: intake.draftReply,
                })
                await gate.repository.saveConversationOutbound({
                  threadId: inbound.threadId,
                  body: intake.draftReply,
                  providerMessageId: sent.messageId,
                  senderKind: "auto",
                })
                autoSent += 1
                autoDrafted -= 1
              } catch (error) {
                autoErrors.push(
                  error instanceof Error ? error.message : "Instagram auto-send failed"
                )
              }
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Intake/AI failed"
        console.warn("[tangent] Instagram sync intake/AI failed", message)
        autoErrors.push(message)
      }
    }

    if (settings.intakeFlowEnabled && settings.intakeAutoSend && autoSent === 0 && autoDrafted === 0) {
      autoErrors.push(
        "No auto replies were produced. Confirm intake is saved, Sync again after a customer message, and that the branch Then action is “Send reply and end intake”."
      )
    }

    await gate.repository.recordAudit({
      action: "messaging.instagram_inbox_synced",
      entityType: "connected_account",
      entityId: account.id,
      summary: `Synced Instagram inbox: ${result.conversations} chats, ${result.messages} messages, ${result.comments} comments; auto-sent ${autoSent}`,
      actor: { type: "user", id: gate.context.user.id },
    })

    revalidateMessaging(gate.context.workspace.slug)
    return {
      ok: true,
      data: {
        ...result,
        autoSent,
        autoDrafted,
        autoErrors: autoErrors.slice(0, 5),
        intakeAutoSend: settings.intakeAutoSend,
      },
    }
  } catch (error) {
    if (error instanceof IntegrationError) return { ok: false, error: error.message }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not sync Instagram messages. Check token permissions and inbox SQL migration.",
    }
  }
}

export async function openInboxThreadAction(
  workspace: string,
  threadId: string
): Promise<MessagingResult<{ thread: ConversationThread; messages: ConversationMessage[] }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  try {
    // Fast path: load messages + thread in parallel (do not list the whole inbox).
    const [thread, messages] = await Promise.all([
      gate.repository.getConversationThread(threadId),
      gate.repository.listConversationMessages(threadId),
    ])
    if (!thread) {
      return { ok: false, error: "Conversation not found. Sync Instagram and try again." }
    }

    // Mark read in the background so opening the chat is not blocked.
    void gate.repository.markConversationThreadRead(threadId).catch((error) => {
      console.error("[tangent] markConversationThreadRead failed", error)
    })

    return {
      ok: true,
      data: { thread: { ...thread, unreadCount: 0 }, messages },
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not open this conversation. Confirm inbox SQL migration is applied.",
    }
  }
}

export async function draftInboxReplyAction(
  workspace: string,
  threadId: string
): Promise<MessagingResult<{ draftReply: string; intent: string; confidence: number }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  if (!gate.context.permissions.includes("ai.run")) {
    return { ok: false, error: "Your role cannot run AI drafts." }
  }
  const provider = getModelProvider()
  if (!provider) {
    return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  }
  const quota = aiQuotaError(gate.context)
  if (quota) return { ok: false, error: quota }

  const [thread, messages] = await Promise.all([
    gate.repository.getConversationThread(threadId),
    gate.repository.listConversationMessages(threadId),
  ])
  if (!thread) return { ok: false, error: "Conversation not found." }
  const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound")
  if (!latestInbound) return { ok: false, error: "No inbound message to reply to." }

  try {
    const [business, orgName, settings, metadata] = await Promise.all([
      gate.repository.getBusinessProfile(),
      Promise.resolve(gate.context.workspace.name),
      gate.repository.getMessagingSettings(),
      gate.repository.getConversationThreadMetadata(threadId),
    ])

    const intakeState = readIntakeState(metadata)
    const recentMessages = messages.map((m) => ({ direction: m.direction, body: m.body }))
    const intake = resolveIntakeReply({
      settings,
      state: intakeState,
      latestInbound: latestInbound.body,
      recentMessages,
    })

    if (!intake && settings.intakeFlowEnabled && !intakeState.completed) {
      return {
        ok: false,
        error: "Intake is waiting for the customer’s next answer — nothing to draft yet.",
      }
    }

    if (intake && !intake.handoffToAi) {
      await gate.repository.mergeConversationThreadMetadata(threadId, { intake: intake.nextState })
      await gate.repository.updateConversationMessageAi(latestInbound.id, {
        aiIntent: intake.intent,
        aiSentiment: "neutral",
        aiConfidence: intake.confidence,
        aiDraftReply: intake.draftReply,
        aiShouldAutoReply: intake.shouldAutoReply,
      })
      return {
        ok: true,
        data: {
          draftReply: intake.draftReply,
          intent: intake.intent,
          confidence: intake.confidence,
        },
      }
    }

    if (intake?.handoffToAi) {
      await gate.repository.mergeConversationThreadMetadata(threadId, { intake: intake.nextState })
    }

    const intakeAnswers =
      intake?.nextState.answers ?? readIntakeState(metadata).answers

    const understanding = await understandInboundMessage({
      businessName: orgName || business?.name || "Business",
      businessSummary: [
        business?.description,
        (business?.productsAndServices ?? []).join(", "),
      ]
        .filter(Boolean)
        .join(" — "),
      channel: thread.channel,
      participantName: thread.participantName,
      recentMessages: messages.map((m) => ({ direction: m.direction, body: m.body })),
      latestInbound: latestInbound.body,
      intakeAnswers,
    })
    if (!understanding) return { ok: false, error: "AI did not return a draft." }

    await gate.repository.updateConversationMessageAi(latestInbound.id, {
      aiIntent: understanding.intent,
      aiSentiment: understanding.sentiment,
      aiConfidence: understanding.confidence,
      aiDraftReply: understanding.draftReply,
      aiShouldAutoReply: understanding.shouldAutoReply,
    })

    return {
      ok: true,
      data: {
        draftReply: understanding.draftReply,
        intent: understanding.intent,
        confidence: understanding.confidence,
      },
    }
  } catch (error) {
    const message =
      error instanceof ProviderError ? error.message : "Could not draft an AI reply."
    return { ok: false, error: message }
  }
}

export async function sendInboxReplyAction(
  workspace: string,
  input: {
    threadId: string
    body: string
    connectedAccountId?: string
  }
): Promise<MessagingResult<{ message: ConversationMessage }>> {
  const gate = await requireMessagingManage(workspace)
  if (!gate.ok) return gate
  if (!gate.context.permissions.includes("content.publish")) {
    return { ok: false, error: "Your role cannot send session replies." }
  }

  const body = input.body.trim()
  if (!body) return { ok: false, error: "Write a reply first." }

  const thread = await gate.repository.getConversationThread(input.threadId)
  if (!thread) return { ok: false, error: "Conversation not found." }

  if (thread.externalThreadKey.startsWith("ig_comments:")) {
    return {
      ok: false,
      error: "Comment threads are read-only in Inbox. Reply from a DM conversation instead.",
    }
  }

  const accounts = await gate.repository.listConnectedAccounts()
  const preferredProvider = thread.channel === "instagram" ? "instagram" : "whatsapp"
  const accountId =
    input.connectedAccountId ||
    thread.connectedAccountId ||
    accounts.find((a) => a.provider === preferredProvider)?.id ||
    accounts.find((a) => a.provider === "whatsapp")?.id
  const account = accounts.find((a) => a.id === accountId)
  if (!account) {
    return {
      ok: false,
      error:
        preferredProvider === "instagram"
          ? "Connect an Instagram account under Integrations to reply to DMs."
          : "Connect a WhatsApp account under Integrations for session replies.",
    }
  }

  const payloadParsed = sessionReplyApprovalPayloadSchema.safeParse({
    threadId: thread.id,
    channel: thread.channel,
    connectedAccountId: account.id,
    toHandle: thread.participantHandle,
    body,
  })
  if (!payloadParsed.success) {
    return { ok: false, error: "Invalid reply payload.", fieldErrors: fieldErrorsFromZod(payloadParsed.error) }
  }

  try {
    const approval = await gate.repository.createApprovalRequest({
      actionType: "send_session_message",
      title: `Reply on ${thread.channel} to ${thread.participantName || thread.participantHandle}`,
      connectedAccountId: account.id,
      payload: payloadParsed.data,
      financialImpact: null,
      requestedByAgent: null,
    })
    await gate.repository.decideApproval(
      approval.id,
      "approve",
      "Session reply confirmed in Messaging Inbox",
      gate.context.user.id
    )

    const sent = await sendInboxSessionReply({
      organizationId: gate.context.workspace.id,
      channel: thread.channel,
      connectedAccountId: account.id,
      accountExternalId: account.externalAccountId,
      accountProvider: account.provider,
      toHandle: thread.participantHandle,
      body,
    })

    const message = await gate.repository.saveConversationOutbound({
      threadId: thread.id,
      body,
      providerMessageId: sent.messageId,
      senderKind: "user",
    })
    if (!message) {
      return {
        ok: false,
        error:
          "Reply sent but inbox tables are missing. Run 20261120000100_messaging_inbox.sql.",
      }
    }

    await gate.repository.recordAudit({
      action: "messaging.session_reply_sent",
      entityType: "conversation_thread",
      entityId: thread.id,
      summary: `Sent session reply to ${thread.participantHandle}`,
      actor: { type: "user", id: gate.context.user.id },
    })

    revalidateMessaging(gate.context.workspace.slug)
    return { ok: true, data: { message } }
  } catch (error) {
    if (error instanceof ApprovalError) return { ok: false, error: error.message }
    if (error instanceof IntegrationError) return { ok: false, error: error.message }
    return { ok: false, error: "Could not send the session reply." }
  }
}
