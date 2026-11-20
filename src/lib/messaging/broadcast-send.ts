import "server-only"

import { assertExecutable, hashPayload, type ApprovalRequest } from "@/lib/approvals/engine"
import type { WorkspaceRepository } from "@/lib/data/types"
import type {
  BroadcastApprovalPayload,
  Contact,
  MessageBroadcast,
  MessageChannel,
  MessageEvent,
  MessageTemplate,
} from "@/lib/domain/messaging"
import {
  CHANNEL_PROVIDER,
  contactHasChannelConsent,
  contactReachableOnChannel,
  emptyBroadcastStats,
} from "@/lib/domain/messaging"
import { loadAccessToken } from "@/lib/integrations/credentials"
import {
  resolveResendApiKey,
  resolveResendFrom,
  sendResendEmail,
} from "@/lib/integrations/email"
import { IntegrationError } from "@/lib/integrations/gateway"
import {
  resolveMsg91AuthKey,
  resolveMsg91SenderId,
  sendMsg91FlowSms,
  sendMsg91PlainSms,
} from "@/lib/integrations/sms"
import {
  listMetaMessageTemplates,
  resolveWhatsappAccountIds,
  sendWhatsappTemplateMessage,
} from "@/lib/integrations/whatsapp"
import {
  applyTemplateVariables,
  listTemplatePlaceholders,
  resolveTemplateParameters,
} from "@/lib/messaging/variables"

export async function buildBroadcastApprovalPayload(input: {
  broadcast: MessageBroadcast
  template: MessageTemplate
  contactIds: string[]
}): Promise<BroadcastApprovalPayload> {
  const sorted = [...input.contactIds].sort()
  return {
    broadcastId: input.broadcast.id,
    channel: input.broadcast.channel,
    templateId: input.template.id,
    templateName: input.template.name,
    templateLanguage: input.template.language,
    audienceId: input.broadcast.audienceId,
    connectedAccountId: input.broadcast.connectedAccountId,
    contactIds: sorted,
    contactSetHash: await hashPayload(sorted),
    variableMapping: input.broadcast.variableMapping,
    estimatedRecipients: sorted.length,
  }
}

function skipEvent(
  broadcastId: string,
  contactId: string,
  code: string,
  message: string,
  occurredAt: string
): MessageEvent {
  return {
    id: crypto.randomUUID(),
    broadcastId,
    contactId,
    providerMessageId: null,
    status: "skipped",
    errorCode: code,
    errorMessage: message,
    occurredAt,
  }
}

/** Send one template message (used by bulk execute and one-contact test sends). */
export async function sendTemplateToSingleContact(input: {
  organizationId: string
  channel: MessageChannel
  connectedAccountId: string
  accountProvider: string
  accountExternalId: string
  template: MessageTemplate
  contact: Contact
  bodyParameters: string[]
  bodyParameterNames?: string[]
  /** Overrides template headerMediaUrl for IMAGE/VIDEO/DOCUMENT headers. */
  headerMediaUrl?: string
}): Promise<{ messageId: string }> {
  const token = await loadAccessToken({
    organizationId: input.organizationId,
    connectedAccountId: input.connectedAccountId,
  })

  switch (input.channel) {
    case "whatsapp": {
      if (input.accountProvider !== "whatsapp") {
        throw new IntegrationError("WhatsApp account missing for this broadcast", "not_configured")
      }
      if (!token) {
        throw new IntegrationError("No encrypted WhatsApp access token stored", "not_configured")
      }
      if (!input.contact.phoneE164) {
        throw new IntegrationError("Contact phone missing", "provider_error")
      }
      const resolved = await resolveWhatsappAccountIds(token, input.accountExternalId)
      const parameterNames =
        input.bodyParameterNames ??
        listTemplatePlaceholders(input.template.bodyComponents.bodyText)
      let headerFormat = input.template.bodyComponents.headerFormat
      const headerMediaUrl =
        input.headerMediaUrl?.trim() || input.template.bodyComponents.headerMediaUrl?.trim()

      // Templates synced before headerFormat existed still need an IMAGE/VIDEO/DOCUMENT header.
      if (!headerFormat) {
        const remote = await listMetaMessageTemplates(token, resolved.wabaId).catch(() => [])
        const match = remote.find(
          (t) => t.name === input.template.name && t.language === input.template.language
        )
        const remoteFormat = match?.components
          ?.find((c) => c.type === "HEADER")
          ?.format?.toUpperCase()
        if (
          remoteFormat === "TEXT" ||
          remoteFormat === "IMAGE" ||
          remoteFormat === "VIDEO" ||
          remoteFormat === "DOCUMENT" ||
          remoteFormat === "LOCATION"
        ) {
          headerFormat = remoteFormat
        } else if (headerMediaUrl) {
          headerFormat = "IMAGE"
        }
      }

      const headerMedia =
        headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT"
          ? {
              format: headerFormat,
              link: headerMediaUrl,
            }
          : undefined
      return sendWhatsappTemplateMessage({
        accessToken: token,
        phoneNumberId: resolved.phoneNumberId,
        toE164: input.contact.phoneE164,
        templateName: input.template.name,
        language: input.template.language,
        bodyParameters: input.bodyParameters,
        bodyParameterNames: parameterNames,
        headerMedia,
      })
    }
    case "sms": {
      if (input.accountProvider !== "msg91") {
        throw new IntegrationError("MSG91 SMS account missing for this broadcast", "not_configured")
      }
      if (!input.contact.phoneE164) {
        throw new IntegrationError("Contact phone missing", "provider_error")
      }
      const authKey = resolveMsg91AuthKey(token)
      const dltTemplateId = input.template.bodyComponents.dltTemplateId?.trim()
      if (dltTemplateId) {
        return sendMsg91FlowSms({
          authKey,
          dltTemplateId,
          toE164: input.contact.phoneE164,
          variables: input.bodyParameters,
        })
      }
      const senderId = resolveMsg91SenderId(
        input.accountExternalId,
        input.template.bodyComponents.senderId
      )
      const message = applyTemplateVariables(
        input.template.bodyComponents.bodyText,
        input.bodyParameters
      )
      return sendMsg91PlainSms({
        authKey,
        senderId,
        toE164: input.contact.phoneE164,
        message,
      })
    }
    case "email": {
      if (input.accountProvider !== "resend") {
        throw new IntegrationError("Resend email account missing for this broadcast", "not_configured")
      }
      if (!input.contact.email) {
        throw new IntegrationError("Contact email missing", "provider_error")
      }
      const apiKey = resolveResendApiKey(token)
      const from = resolveResendFrom(
        input.accountExternalId,
        input.template.bodyComponents.senderId
      )
      const subject =
        input.template.bodyComponents.emailSubject?.trim() ||
        input.template.bodyComponents.headerText?.trim() ||
        input.template.name
      const text = applyTemplateVariables(
        input.template.bodyComponents.bodyText,
        input.bodyParameters
      )
      return sendResendEmail({
        apiKey,
        from,
        to: input.contact.email,
        subject,
        text,
      })
    }
    default: {
      const unreachable: never = input.channel
      throw new IntegrationError(`Unsupported channel ${String(unreachable)}`, "provider_error")
    }
  }
}

export async function executeApprovedBroadcast(input: {
  organizationId: string
  repository: WorkspaceRepository
  broadcast: MessageBroadcast
  template: MessageTemplate
  contacts: Contact[]
  approval: ApprovalRequest<BroadcastApprovalPayload>
  payload: BroadcastApprovalPayload
}): Promise<MessageBroadcast> {
  await assertExecutable(input.approval, input.payload)

  const expectedProvider = CHANNEL_PROVIDER[input.broadcast.channel]
  const account = (await input.repository.listConnectedAccounts()).find(
    (a) => a.id === input.broadcast.connectedAccountId
  )
  if (!account || account.provider !== expectedProvider) {
    throw new IntegrationError(
      `${expectedProvider} account missing for this ${input.broadcast.channel} broadcast`,
      "not_configured"
    )
  }

  const placeholders = listTemplatePlaceholders(input.template.bodyComponents.bodyText)
  const stats = emptyBroadcastStats()
  const events: MessageEvent[] = []
  const now = new Date().toISOString()

  let sending = await input.repository.saveBroadcast({
    ...input.broadcast,
    status: "sending",
    lastError: null,
  })

  for (const contact of input.contacts) {
    if (!contactReachableOnChannel(contact, input.broadcast.channel)) {
      stats.skipped++
      events.push(
        skipEvent(
          sending.id,
          contact.id,
          "consent_or_address",
          "Missing address, opted out, or blocked",
          now
        )
      )
      continue
    }

    if (!contactHasChannelConsent(contact, input.broadcast.channel, input.template.category)) {
      stats.skipped++
      events.push(
        skipEvent(
          sending.id,
          contact.id,
          "consent",
          `Marketing templates require ${input.broadcast.channel} opt-in`,
          now
        )
      )
      continue
    }

    try {
      const bodyParameters = resolveTemplateParameters(
        contact,
        sending.variableMapping,
        placeholders
      )
      const sent = await sendTemplateToSingleContact({
        organizationId: input.organizationId,
        channel: input.broadcast.channel,
        connectedAccountId: account.id,
        accountProvider: account.provider,
        accountExternalId: account.externalAccountId,
        template: input.template,
        contact,
        bodyParameters,
        bodyParameterNames: placeholders,
      })
      stats.sent++
      stats.queued++
      events.push({
        id: crypto.randomUUID(),
        broadcastId: sending.id,
        contactId: contact.id,
        providerMessageId: sent.messageId,
        status: "sent",
        errorCode: null,
        errorMessage: null,
        occurredAt: new Date().toISOString(),
      })
    } catch (error) {
      stats.failed++
      events.push({
        id: crypto.randomUUID(),
        broadcastId: sending.id,
        contactId: contact.id,
        providerMessageId: null,
        status: "failed",
        errorCode: error instanceof IntegrationError ? error.code : "provider_error",
        errorMessage: error instanceof Error ? error.message : "Send failed",
        occurredAt: new Date().toISOString(),
      })
    }
  }

  await input.repository.saveMessageEvents(events)

  sending = await input.repository.saveBroadcast({
    ...sending,
    status: stats.failed > 0 && stats.sent === 0 ? "failed" : "completed",
    stats,
    lastError:
      stats.failed > 0 && stats.sent === 0
        ? events.find((e) => e.status === "failed")?.errorMessage ?? "All sends failed"
        : null,
  })

  return sending
}
