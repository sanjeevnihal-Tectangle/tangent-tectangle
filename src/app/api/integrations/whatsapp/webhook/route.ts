import { createClient } from "@supabase/supabase-js"
import { after, NextResponse, type NextRequest } from "next/server"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import {
  applyInboundUnderstanding,
  isFaqAutoReplyAllowed,
  loadOrgMessagingSettings,
  persistOutboundInboxMessage,
  sendInboxSessionReply,
  understandInboundMessage,
  upsertWhatsappInboundMessage,
} from "@/lib/messaging/inbox"

/**
 * Meta WhatsApp Cloud API webhook.
 * - GET: hub challenge verification
 * - POST: delivery statuses + inbound messages (inbox + STOP opt-out + AI)
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge")
  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN ?? "tangent-whatsapp-verify"

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

type WaInbound = {
  from?: string
  id?: string
  type?: string
  text?: { body?: string }
  timestamp?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    entry?: {
      id?: string
      changes?: {
        value?: {
          metadata?: { phone_number_id?: string; display_phone_number?: string }
          contacts?: { profile?: { name?: string }; wa_id?: string }[]
          messages?: WaInbound[]
          statuses?: { id?: string; status?: string; errors?: { code?: number; title?: string }[] }[]
        }
      }[]
    }[]
  } | null

  if (!body) return NextResponse.json({ ok: true })

  const env = serverEnv()
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, skipped: "no_supabase" })
  }

  const admin = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const aiJobs: {
    organizationId: string
    threadId: string
    messageId: string
    connectedAccountId: string | null
    body: string
    participantName: string
  }[] = []

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue
        const mapped =
          status.status === "delivered"
            ? "delivered"
            : status.status === "read"
              ? "read"
              : status.status === "failed"
                ? "failed"
                : status.status === "sent"
                  ? "sent"
                  : null
        if (!mapped) continue
        await admin
          .from("message_events")
          .update({
            status: mapped,
            error_code: status.errors?.[0]?.code ? String(status.errors[0].code) : null,
            error_message: status.errors?.[0]?.title ?? null,
            occurred_at: new Date().toISOString(),
          })
          .eq("provider_message_id", status.id)

        await admin
          .from("conversation_messages")
          .update({ status: mapped })
          .eq("provider_message_id", status.id)
      }

      const phoneNumberId = value.metadata?.phone_number_id?.trim() || null
      let connectedAccountId: string | null = null
      let organizationIds: string[] = []

      if (phoneNumberId) {
        const { data: accounts } = await admin
          .from("connected_accounts")
          .select("id, organization_id, external_account_id, status")
          .eq("provider", "whatsapp")
          .neq("status", "revoked")
        const matches = (accounts ?? []).filter((a) => {
          const ext = String((a as { external_account_id?: string }).external_account_id ?? "")
          return ext === phoneNumberId || ext.endsWith(`:${phoneNumberId}`)
        }) as { id: string; organization_id: string }[]
        organizationIds = [...new Set(matches.map((m) => m.organization_id))]
        connectedAccountId = matches[0]?.id ?? null
      }

      if (organizationIds.length === 0) {
        const { data: settingsRows } = await admin.from("messaging_settings").select("organization_id")
        organizationIds = (settingsRows ?? []).map((r) => r.organization_id as string)
      }

      for (const message of value.messages ?? []) {
        const text = (message.text?.body ?? "").trim()
        const from = message.from
        if (!from || !text) continue

        const contactName =
          value.contacts?.find((c) => c.wa_id === from)?.profile?.name ||
          value.contacts?.[0]?.profile?.name

        for (const organizationId of organizationIds) {
          const settings = await loadOrgMessagingSettings(admin, organizationId)
          const upper = text.toUpperCase()
          const isOptOut = settings.optOutKeywords.some(
            (k) => upper === k.toUpperCase() || upper.startsWith(`${k.toUpperCase()} `)
          )
          if (isOptOut) {
            const e164 = from.startsWith("+") ? from : `+${from}`
            await admin
              .from("contacts")
              .update({
                consent_whatsapp: "opted_out",
                opted_out_at: new Date().toISOString(),
                consent_whatsapp_evidence: "webhook:STOP",
              })
              .eq("organization_id", organizationId)
              .eq("phone_e164", e164)
          }

          const upserted = await upsertWhatsappInboundMessage({
            admin,
            organizationId,
            connectedAccountId:
              settings.autoReplyConnectedAccountId || connectedAccountId,
            fromDigits: from,
            body: text,
            providerMessageId: message.id ?? null,
            contactName,
          }).catch(() => null)

          if (upserted && settings.inboxAiEnabled) {
            aiJobs.push({
              organizationId,
              threadId: upserted.thread.id,
              messageId: upserted.message.id,
              connectedAccountId:
                settings.autoReplyConnectedAccountId ||
                upserted.thread.connectedAccountId ||
                connectedAccountId,
              body: text,
              participantName: upserted.thread.participantName,
            })
          }
        }
      }
    }
  }

  if (aiJobs.length > 0) {
    after(async () => {
      for (const job of aiJobs) {
        try {
          const settings = await loadOrgMessagingSettings(admin, job.organizationId)
          if (!settings.inboxAiEnabled) continue

          const { data: org } = await admin
            .from("organizations")
            .select("name")
            .eq("id", job.organizationId)
            .maybeSingle()
          const { data: business } = await admin
            .from("business_profiles")
            .select("description, products_and_services")
            .eq("organization_id", job.organizationId)
            .maybeSingle()

          const { data: recentRows } = await admin
            .from("conversation_messages")
            .select("direction, body")
            .eq("thread_id", job.threadId)
            .order("occurred_at", { ascending: true })
            .limit(20)

          const understanding = await understandInboundMessage({
            businessName: (org as { name?: string } | null)?.name || "Business",
            businessSummary: [
              (business as { description?: string } | null)?.description,
              Array.isArray((business as { products_and_services?: unknown })?.products_and_services)
                ? ((business as { products_and_services: string[] }).products_and_services || []).join(
                    ", "
                  )
                : "",
            ]
              .filter(Boolean)
              .join(" — "),
            channel: "whatsapp",
            participantName: job.participantName,
            recentMessages: (recentRows ?? []) as { direction: string; body: string }[],
            latestInbound: job.body,
          })
          if (!understanding) continue

          await applyInboundUnderstanding({
            admin,
            organizationId: job.organizationId,
            threadId: job.threadId,
            messageId: job.messageId,
            understanding,
          })

          if (
            !job.connectedAccountId ||
            !isFaqAutoReplyAllowed(understanding, settings.autoReplyMode)
          ) {
            continue
          }

          const { data: account } = await admin
            .from("connected_accounts")
            .select("id, provider, external_account_id")
            .eq("id", job.connectedAccountId)
            .eq("organization_id", job.organizationId)
            .maybeSingle()
          if (!account) continue

          const { data: thread } = await admin
            .from("conversation_threads")
            .select("participant_handle")
            .eq("id", job.threadId)
            .maybeSingle()
          const toHandle = (thread as { participant_handle?: string } | null)?.participant_handle
          if (!toHandle) continue

          const sent = await sendInboxSessionReply({
            organizationId: job.organizationId,
            channel: "whatsapp",
            connectedAccountId: account.id as string,
            accountExternalId: String(
              (account as { external_account_id?: string }).external_account_id ?? ""
            ),
            accountProvider: String((account as { provider?: string }).provider ?? ""),
            toHandle,
            body: understanding.draftReply,
          })

          await persistOutboundInboxMessage({
            admin,
            organizationId: job.organizationId,
            threadId: job.threadId,
            body: understanding.draftReply,
            providerMessageId: sent.messageId,
            senderKind: "auto",
          })
        } catch (error) {
          console.warn("[tangent] inbox AI processing failed", error)
        }
      }
    })
  }

  return NextResponse.json({ ok: true })
}
