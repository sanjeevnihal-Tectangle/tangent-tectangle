import "server-only"

import type { WorkspaceRepository } from "@/lib/data/types"
import type { ConversationMessage, ConversationThread } from "@/lib/domain/messaging"
import { IntegrationError } from "@/lib/integrations/gateway"

const META_GRAPH_VERSION = "v21.0"
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

async function graphGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${META_GRAPH}${path}`)
  url.searchParams.set("access_token", accessToken)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url)
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
      `Instagram Graph GET ${path} failed (${res.status}): ${detail}`,
      "provider_error"
    )
  }
  return JSON.parse(text) as T
}

type PageWithIg = {
  id: string
  name?: string
  access_token?: string
  instagram_business_account?: { id: string; username?: string }
}

export async function resolvePageForInstagram(input: {
  accessToken: string
  igUserId: string
}): Promise<{ pageId: string; pageToken: string; igUsername?: string }> {
  // 1) User/System token /me/accounts often returns page tokens.
  const meAccounts = await graphGet<{ data?: PageWithIg[] }>("/me/accounts", input.accessToken, {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
  }).catch(() => ({ data: [] as PageWithIg[] }))

  const fromMe = (meAccounts.data ?? []).find(
    (p) => p.instagram_business_account?.id === input.igUserId && p.access_token
  )
  if (fromMe?.access_token) {
    return {
      pageId: fromMe.id,
      pageToken: fromMe.access_token,
      igUsername: fromMe.instagram_business_account?.username,
    }
  }

  // 2) Business-owned pages (System User).
  const businesses = await graphGet<{ data?: { id: string }[] }>("/me/businesses", input.accessToken, {
    fields: "id",
    limit: "50",
  }).catch(() => ({ data: [] as { id: string }[] }))

  for (const business of businesses.data ?? []) {
    for (const edge of ["owned_pages", "client_pages"] as const) {
      const pages = await graphGet<{ data?: PageWithIg[] }>(
        `/${business.id}/${edge}`,
        input.accessToken,
        {
          fields: "id,name,access_token,instagram_business_account{id,username}",
          limit: "100",
        }
      ).catch(() => ({ data: [] as PageWithIg[] }))

      const match = (pages.data ?? []).find(
        (p) => p.instagram_business_account?.id === input.igUserId
      )
      if (match) {
        // Prefer page token; fall back to system user token.
        let pageToken = match.access_token
        if (!pageToken) {
          const page = await graphGet<{ access_token?: string }>(`/${match.id}`, input.accessToken, {
            fields: "access_token",
          }).catch(() => ({ access_token: undefined }))
          pageToken = page.access_token
        }
        if (pageToken) {
          return {
            pageId: match.id,
            pageToken,
            igUsername: match.instagram_business_account?.username,
          }
        }
      }
    }
  }

  // 3) Last resort: ask IG node for linked page (may require extra perms).
  const ig = await graphGet<{
    id?: string
    username?: string
    connected_facebook_page?: { id: string }
  }>(`/${input.igUserId}`, input.accessToken, {
    fields: "id,username,connected_facebook_page",
  }).catch(() => null)

  if (ig?.connected_facebook_page?.id) {
    const page = await graphGet<{ id?: string; access_token?: string }>(
      `/${ig.connected_facebook_page.id}`,
      input.accessToken,
      { fields: "id,access_token" }
    ).catch(() => null)
    if (page?.access_token) {
      return { pageId: page.id!, pageToken: page.access_token, igUsername: ig.username }
    }
  }

  throw new IntegrationError(
    "Could not resolve a Facebook Page token for this Instagram account. In Meta → System users → Generate token, enable instagram_manage_messages, pages_messaging, pages_manage_metadata, pages_show_list, and business_management. Ensure the Page linked to @tectangle_ is assigned to the System User.",
    "permission_denied"
  )
}

type GraphMessage = {
  id: string
  message?: string
  created_time?: string
  from?: { id?: string; username?: string; name?: string; email?: string }
}

type GraphConversation = {
  id: string
  updated_time?: string
  participants?: {
    data?: { id?: string; username?: string; name?: string }[]
  }
  messages?: { data?: GraphMessage[] }
}

type GraphComment = {
  id: string
  text?: string
  username?: string
  timestamp?: string
  from?: { id?: string; username?: string }
}

export type InstagramSyncResult = {
  conversations: number
  messages: number
  comments: number
  threads: ConversationThread[]
  /** Newly inserted inbound DM messages (for intake / AI on localhost poll). */
  newInbound: { id: string; threadId: string; body: string; participantName: string }[]
}

export async function syncInstagramInbox(input: {
  repository: WorkspaceRepository
  organizationId: string
  connectedAccountId: string
  igUserId: string
  accessToken: string
  ourIgUsername?: string
}): Promise<InstagramSyncResult> {
  const resolved = await resolvePageForInstagram({
    accessToken: input.accessToken,
    igUserId: input.igUserId,
  })

  const ourIgId = input.igUserId
  const conversations = await graphGet<{ data?: GraphConversation[] }>(
    `/${resolved.pageId}/conversations`,
    resolved.pageToken,
    {
      platform: "instagram",
      fields:
        "id,updated_time,participants{id,username,name},messages.limit(30){id,message,created_time,from}",
      limit: "25",
    }
  )

  let messageCount = 0
  let conversationCount = 0
  const touchedThreads: ConversationThread[] = []
  const newInbound: InstagramSyncResult["newInbound"] = []

  for (const convo of conversations.data ?? []) {
    const participants = convo.participants?.data ?? []
    const other =
      participants.find((p) => p.id && p.id !== ourIgId) ??
      participants.find((p) => p.username && p.username !== input.ourIgUsername) ??
      participants[0]
    if (!other?.id) continue

    const msgs = [...(convo.messages?.data ?? [])].sort((a, b) =>
      String(a.created_time ?? "").localeCompare(String(b.created_time ?? ""))
    )
    if (msgs.length === 0) continue

    conversationCount += 1
    const last = msgs[msgs.length - 1]!
    const preview = (last.message || "(media)").slice(0, 160)
    const lastAt = last.created_time ? new Date(last.created_time).toISOString() : new Date().toISOString()

    const thread = await input.repository.upsertConversationThread({
      channel: "instagram",
      connectedAccountId: input.connectedAccountId,
      contactId: null,
      externalThreadKey: `ig_dm:${convo.id}`,
      // Store Instagram-scoped user id so session replies can address the recipient.
      participantHandle: other.id,
      participantName: other.username
        ? `@${other.username}`
        : other.name || other.id,
      status: "open",
      lastMessageAt: lastAt,
      lastMessagePreview: preview,
      lastInboundAt: msgs.some((m) => m.from?.id && m.from.id !== ourIgId) ? lastAt : null,
      unreadCountDelta: msgs.filter((m) => m.from?.id && m.from.id !== ourIgId).length,
      metadata: {
        conversationId: convo.id,
        pageId: resolved.pageId,
        participantIgId: other.id,
        kind: "dm",
      },
    })
    touchedThreads.push(thread)

    for (const msg of msgs) {
      const fromId = msg.from?.id
      const inbound = Boolean(fromId && fromId !== ourIgId)
      const body = (msg.message || "").trim() || "(media / non-text message)"
      const occurredAt = msg.created_time
        ? new Date(msg.created_time).toISOString()
        : new Date().toISOString()
      const saved = await input.repository.upsertConversationMessage({
        threadId: thread.id,
        direction: inbound ? "inbound" : "outbound",
        senderKind: inbound ? "contact" : "user",
        body,
        contentType: "text",
        providerMessageId: msg.id,
        status: inbound ? "received" : "sent",
        occurredAt,
        metadata: { from: msg.from ?? null, kind: "dm" },
      })
      if (saved?.created) {
        messageCount += 1
        if (inbound) {
          newInbound.push({
            id: saved.message.id,
            threadId: thread.id,
            body: saved.message.body,
            participantName: thread.participantName || thread.participantHandle || "Customer",
          })
        }
      }
    }
  }

  // Recent media comments (public engagement).
  let commentCount = 0
  const media = await graphGet<{
    data?: { id: string; caption?: string; comments?: { data?: GraphComment[] } }[]
  }>(`/${ourIgId}/media`, input.accessToken, {
    fields: "id,caption,comments.limit(20){id,text,username,timestamp,from}",
    limit: "15",
  }).catch(() => ({ data: [] as { id: string; caption?: string; comments?: { data?: GraphComment[] } }[] }))

  for (const post of media.data ?? []) {
    const comments = post.comments?.data ?? []
    if (comments.length === 0) continue

    const sorted = [...comments].sort((a, b) =>
      String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? ""))
    )
    const last = sorted[sorted.length - 1]!
    const lastAt = last.timestamp ? new Date(last.timestamp).toISOString() : new Date().toISOString()
    const handle = last.username || last.from?.username || last.from?.id || "commenter"

    const thread = await input.repository.upsertConversationThread({
      channel: "instagram",
      connectedAccountId: input.connectedAccountId,
      contactId: null,
      externalThreadKey: `ig_comments:${post.id}`,
      participantHandle: `@${String(handle).replace(/^@/, "")}`,
      participantName: `Comments on post ${post.id.slice(-6)}`,
      status: "open",
      lastMessageAt: lastAt,
      lastMessagePreview: (last.text || "(comment)").slice(0, 160),
      lastInboundAt: lastAt,
      unreadCountDelta: sorted.length,
      metadata: {
        mediaId: post.id,
        caption: (post.caption || "").slice(0, 200),
        kind: "comments",
      },
      aiSummary: post.caption ? `Post: ${post.caption.slice(0, 120)}` : null,
    })
    touchedThreads.push(thread)

    for (const comment of sorted) {
      const body = (comment.text || "").trim() || "(empty comment)"
      const occurredAt = comment.timestamp
        ? new Date(comment.timestamp).toISOString()
        : new Date().toISOString()
      const who = comment.username || comment.from?.username || comment.from?.id || "user"
      const saved = await input.repository.upsertConversationMessage({
        threadId: thread.id,
        direction: "inbound",
        senderKind: "contact",
        body: `@${String(who).replace(/^@/, "")}: ${body}`,
        contentType: "text",
        providerMessageId: comment.id,
        status: "received",
        occurredAt,
        metadata: { kind: "comment", mediaId: post.id, from: comment.from ?? null },
      })
      if (saved?.created) {
        messageCount += 1
        commentCount += 1
      }
    }
  }

  return {
    conversations: conversationCount,
    messages: messageCount,
    comments: commentCount,
    threads: touchedThreads,
    newInbound,
  }
}
