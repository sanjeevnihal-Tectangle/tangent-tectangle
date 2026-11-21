import { createClient } from "@supabase/supabase-js"
import { after, NextResponse, type NextRequest } from "next/server"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import { processInboundAiAndMaybeReply } from "@/lib/messaging/inbox"
import {
  processInstagramWebhook,
  type InstagramWebhookBody,
} from "@/lib/messaging/instagram-webhook"

/**
 * Meta webhook for Instagram Messaging + comments (and future Page fields).
 * Configure in Meta App → Webhooks → Instagram:
 *   Callback URL: {APP_URL}/api/integrations/meta/webhook
 *   Verify token: META_WHATSAPP_VERIFY_TOKEN (same as WhatsApp) or META_WEBHOOK_VERIFY_TOKEN
 * Subscribe fields: messages, comments, live_comments
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge")
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN ??
    process.env.META_WHATSAPP_VERIFY_TOKEN ??
    "tangent-whatsapp-verify"

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as InstagramWebhookBody | null
  if (!body) return NextResponse.json({ ok: true })

  // Always 200 quickly — Meta retries on non-2xx.
  const env = serverEnv()
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, skipped: "no_supabase" })
  }

  const admin = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (body.object === "instagram") {
    const result = await processInstagramWebhook(admin, body).catch((error) => {
      console.warn("[tangent] Instagram webhook processing failed", error)
      return { processed: 0 }
    })

    if (result.processed > 0) {
      after(async () => {
        try {
          const { data: recent } = await admin
            .from("conversation_messages")
            .select("id, thread_id, organization_id, body, direction, ai_draft_reply")
            .eq("direction", "inbound")
            .is("ai_draft_reply", null)
            .order("occurred_at", { ascending: false })
            .limit(result.processed)

          for (const row of recent ?? []) {
            const message = row as {
              id: string
              thread_id: string
              organization_id: string
              body: string
            }
            const { data: thread } = await admin
              .from("conversation_threads")
              .select("participant_name, connected_account_id")
              .eq("id", message.thread_id)
              .maybeSingle()

            await processInboundAiAndMaybeReply({
              admin,
              organizationId: message.organization_id,
              threadId: message.thread_id,
              messageId: message.id,
              connectedAccountId:
                (thread as { connected_account_id?: string | null } | null)?.connected_account_id ??
                null,
              channel: "instagram",
              body: message.body,
              participantName:
                (thread as { participant_name?: string } | null)?.participant_name || "Customer",
            })
          }
        } catch (error) {
          console.warn("[tangent] Instagram webhook AI draft failed", error)
        }
      })
    }
  }

  return NextResponse.json({ ok: true })
}
