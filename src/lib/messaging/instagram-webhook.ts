import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

type AdminClient = SupabaseClient

export type InstagramWebhookBody = {
  object?: string
  entry?: {
    id?: string
    time?: number
    messaging?: {
      sender?: { id?: string }
      recipient?: { id?: string }
      timestamp?: number
      message?: {
        mid?: string
        text?: string
        is_echo?: boolean
        attachments?: { type?: string }[]
      }
    }[]
    changes?: {
      field?: string
      value?: {
        id?: string
        text?: string
        from?: { id?: string; username?: string }
        media?: { id?: string; media_product_type?: string }
        comment_id?: string
      }
    }[]
  }[]
}

async function findOrgsForIgUser(
  admin: AdminClient,
  igUserId: string
): Promise<{ organizationId: string; connectedAccountId: string }[]> {
  const { data } = await admin
    .from("connected_accounts")
    .select("id, organization_id, external_account_id, status")
    .eq("provider", "instagram")
    .neq("status", "revoked")

  return ((data ?? []) as { id: string; organization_id: string; external_account_id: string }[])
    .filter((row) => row.external_account_id === igUserId)
    .map((row) => ({ organizationId: row.organization_id, connectedAccountId: row.id }))
}

async function upsertThreadAndMessage(input: {
  admin: AdminClient
  organizationId: string
  connectedAccountId: string
  externalThreadKey: string
  participantHandle: string
  participantName: string
  preview: string
  occurredAt: string
  inbound: boolean
  body: string
  providerMessageId: string
  metadata: Record<string, unknown>
  aiSummary?: string | null
}): Promise<void> {
  const { data: existing } = await input.admin
    .from("conversation_threads")
    .select("id, unread_count")
    .eq("organization_id", input.organizationId)
    .eq("channel", "instagram")
    .eq("external_thread_key", input.externalThreadKey)
    .maybeSingle()

  let threadId: string
  if (existing) {
    threadId = (existing as { id: string }).id
    const unread = Number((existing as { unread_count?: number }).unread_count ?? 0)
    await input.admin
      .from("conversation_threads")
      .update({
        connected_account_id: input.connectedAccountId,
        participant_handle: input.participantHandle,
        participant_name: input.participantName,
        status: "open",
        unread_count: input.inbound ? unread + 1 : unread,
        last_message_at: input.occurredAt,
        last_message_preview: input.preview,
        last_inbound_at: input.inbound ? input.occurredAt : undefined,
        ai_summary: input.aiSummary ?? undefined,
        metadata: input.metadata,
      })
      .eq("id", threadId)
  } else {
    const { data: created, error } = await input.admin
      .from("conversation_threads")
      .insert({
        organization_id: input.organizationId,
        channel: "instagram",
        connected_account_id: input.connectedAccountId,
        external_thread_key: input.externalThreadKey,
        participant_handle: input.participantHandle,
        participant_name: input.participantName,
        status: "open",
        unread_count: input.inbound ? 1 : 0,
        last_message_at: input.occurredAt,
        last_message_preview: input.preview,
        last_inbound_at: input.inbound ? input.occurredAt : null,
        ai_summary: input.aiSummary ?? null,
        metadata: input.metadata,
      })
      .select("id")
      .single()
    if (error || !created) return
    threadId = (created as { id: string }).id
  }

  if (input.providerMessageId) {
    const { data: dup } = await input.admin
      .from("conversation_messages")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("provider_message_id", input.providerMessageId)
      .maybeSingle()
    if (dup) return
  }

  await input.admin.from("conversation_messages").insert({
    organization_id: input.organizationId,
    thread_id: threadId,
    direction: input.inbound ? "inbound" : "outbound",
    sender_kind: input.inbound ? "contact" : "user",
    body: input.body,
    content_type: "text",
    provider_message_id: input.providerMessageId,
    status: input.inbound ? "received" : "sent",
    occurred_at: input.occurredAt,
    metadata: input.metadata,
  })
}

/** Persist Instagram Messaging + comments webhook events into the shared inbox. */
export async function processInstagramWebhook(
  admin: AdminClient,
  body: InstagramWebhookBody
): Promise<{ processed: number }> {
  if (body.object !== "instagram") return { processed: 0 }
  let processed = 0

  for (const entry of body.entry ?? []) {
    const igUserId = entry.id?.trim()
    if (!igUserId) continue
    const orgs = await findOrgsForIgUser(admin, igUserId)
    if (orgs.length === 0) continue

    for (const event of entry.messaging ?? []) {
      const mid = event.message?.mid
      if (!mid) continue
      const isEcho = Boolean(event.message?.is_echo)
      const text =
        (event.message?.text || "").trim() ||
        (event.message?.attachments?.length ? "(media attachment)" : "(empty message)")
      const senderId = event.sender?.id || "unknown"
      const recipientId = event.recipient?.id || igUserId
      const customerId = isEcho ? recipientId : senderId
      const occurredAt = event.timestamp
        ? new Date(event.timestamp).toISOString()
        : new Date().toISOString()

      for (const org of orgs) {
        await upsertThreadAndMessage({
          admin,
          organizationId: org.organizationId,
          connectedAccountId: org.connectedAccountId,
          externalThreadKey: `ig_dm_user:${customerId}`,
          participantHandle: customerId,
          participantName: customerId,
          preview: text.slice(0, 160),
          occurredAt,
          inbound: !isEcho,
          body: text,
          providerMessageId: mid,
          metadata: {
            kind: "dm",
            senderId,
            recipientId,
            source: "webhook",
          },
        })
        processed += 1
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "live_comments") continue
      const value = change.value
      if (!value) continue
      const commentId = value.id || value.comment_id
      if (!commentId) continue
      const text = (value.text || "").trim() || "(empty comment)"
      const username = value.from?.username || value.from?.id || "commenter"
      const mediaId = value.media?.id || "unknown"
      const occurredAt = new Date().toISOString()

      for (const org of orgs) {
        await upsertThreadAndMessage({
          admin,
          organizationId: org.organizationId,
          connectedAccountId: org.connectedAccountId,
          externalThreadKey: `ig_comments:${mediaId}`,
          participantHandle: `@${String(username).replace(/^@/, "")}`,
          participantName: `Comments on post ${mediaId.slice(-6)}`,
          preview: text.slice(0, 160),
          occurredAt,
          inbound: true,
          body: `@${String(username).replace(/^@/, "")}: ${text}`,
          providerMessageId: commentId,
          metadata: {
            kind: "comment",
            mediaId,
            from: value.from ?? null,
            source: "webhook",
          },
          aiSummary: `Live comment on media ${mediaId}`,
        })
        processed += 1
      }
    }
  }

  return { processed }
}

/** Subscribe the IG professional account so Meta pushes live messaging/comment webhooks. */
export async function subscribeInstagramLiveWebhooks(input: {
  accessToken: string
  igUserId: string
  pageId?: string
  pageAccessToken?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fields = ["messages", "messaging_postbacks", "messaging_seen", "comments", "live_comments"].join(
    ","
  )

  // Preferred: Instagram subscribed_apps (graph.facebook.com also accepts for linked IG).
  const igUrl = new URL(
    `https://graph.facebook.com/v21.0/${input.igUserId}/subscribed_apps`
  )
  igUrl.searchParams.set("subscribed_fields", fields)
  igUrl.searchParams.set("access_token", input.accessToken)

  const igRes = await fetch(igUrl, { method: "POST" })
  const igText = await igRes.text().catch(() => "")
  if (igRes.ok) {
    try {
      const parsed = JSON.parse(igText) as { success?: boolean }
      if (parsed.success !== false) return { ok: true }
    } catch {
      return { ok: true }
    }
  }

  // Fallback: Page subscribed_apps (messages + feed) when Page token is available.
  if (input.pageId && input.pageAccessToken) {
    const pageUrl = new URL(
      `https://graph.facebook.com/v21.0/${input.pageId}/subscribed_apps`
    )
    pageUrl.searchParams.set("subscribed_fields", "messages,feed,mention")
    pageUrl.searchParams.set("access_token", input.pageAccessToken)
    const pageRes = await fetch(pageUrl, { method: "POST" })
    if (pageRes.ok) return { ok: true }
    const pageText = await pageRes.text().catch(() => "")
    return {
      ok: false,
      error: `Could not subscribe Instagram live webhooks (${igRes.status}/${pageRes.status}): ${(igText || pageText).slice(0, 240)}`,
    }
  }

  return {
    ok: false,
    error: `Could not subscribe Instagram live webhooks (${igRes.status}): ${igText.slice(0, 280)}. In Meta App → Webhooks, add Callback URL to /api/integrations/meta/webhook, verify token, subscribe Instagram fields: messages, comments.`,
  }
}
