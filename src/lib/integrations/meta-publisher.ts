import "server-only"

import { IntegrationError } from "@/lib/integrations/gateway"

/**
 * Publishing through the Meta Graph API (Instagram professional accounts and
 * Facebook Pages). Server-only: tokens are passed in by the executor after
 * decryption and are only ever sent to graph.facebook.com in request bodies.
 */

export const META_GRAPH_VERSION = "v21.0"
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface PublishResult {
  externalPostId: string
  permalink: string | null
}

interface MetaErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    error_user_title?: string
    error_user_msg?: string
  }
}

/** Turns a Graph API error body into a user-safe IntegrationError with the right code. */
export function metaError(status: number, body: unknown, action: string): IntegrationError {
  const err = (body as MetaErrorBody | null)?.error
  const detail = err?.error_user_msg || err?.message || `HTTP ${status}`
  const code = err?.code
  const suffix = code ? ` (Meta error ${code}${err?.error_subcode ? `/${err.error_subcode}` : ""})` : ""
  const message = `${action} failed: ${detail}${suffix}`
  if (code === 190 || code === 102 || code === 463 || code === 467) {
    return new IntegrationError(`${message}. The access token is no longer valid — reconnect the account on the Integrations page.`, "token_expired")
  }
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300) || status === 403) {
    return new IntegrationError(`${message}. The connection is missing a permission needed to publish — reconnect and grant it.`, "permission_denied")
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    return new IntegrationError(`${message}. Meta is rate limiting this account; try again later.`, "rate_limited")
  }
  return new IntegrationError(message, "provider_error")
}

async function graphCall<T>(
  fetchImpl: FetchLike,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  action: string
): Promise<T> {
  let res: Response
  try {
    if (method === "GET") {
      // GET needs query params; the token is still never logged by Tangent.
      const url = new URL(`${GRAPH}/${path}`)
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      res = await fetchImpl(url.toString(), { method: "GET", cache: "no-store" })
    } else {
      res = await fetchImpl(`${GRAPH}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
        cache: "no-store",
      })
    }
  } catch {
    throw new IntegrationError(`${action} failed: could not reach Meta.`, "provider_error")
  }
  const body = (await res.json().catch(() => null)) as unknown
  if (!res.ok || (body as MetaErrorBody | null)?.error) throw metaError(res.status, body, action)
  return body as T
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The publishing API needs the numeric Instagram professional account id. Accounts
 * connected with a direct token are often saved with the handle ("tectangle_" or
 * "@tectangle_"), so resolve it through the Pages the token can see.
 */
export async function resolveInstagramUserId(input: {
  idOrHandle: string
  accessToken: string
  fetchImpl?: FetchLike
}): Promise<string> {
  const value = input.idOrHandle.trim()
  if (/^\d+$/.test(value)) return value
  const handle = value.replace(/^@/, "").toLowerCase()
  const fetchImpl = input.fetchImpl ?? fetch
  type IgAccount = { id?: string; username?: string }
  const candidates: IgAccount[] = []
  try {
    // User token: every Page the user manages, with its linked Instagram account.
    const pages = await graphCall<{ data?: { instagram_business_account?: IgAccount }[] }>(
      fetchImpl,
      "GET",
      "me/accounts",
      { fields: "instagram_business_account{id,username}", access_token: input.accessToken },
      "Finding the Instagram account"
    )
    for (const page of pages.data ?? []) if (page.instagram_business_account) candidates.push(page.instagram_business_account)
  } catch (error) {
    if (error instanceof IntegrationError && error.code === "token_expired") throw error
    // Page tokens can't list /me/accounts; fall through to the Page itself.
  }
  if (candidates.length === 0) {
    try {
      const page = await graphCall<{ instagram_business_account?: IgAccount }>(
        fetchImpl,
        "GET",
        "me",
        { fields: "instagram_business_account{id,username}", access_token: input.accessToken },
        "Finding the Instagram account"
      )
      if (page.instagram_business_account) candidates.push(page.instagram_business_account)
    } catch (error) {
      if (error instanceof IntegrationError && error.code === "token_expired") throw error
    }
  }
  const match = candidates.find((c) => c.username?.toLowerCase() === handle) ?? (candidates.length === 1 ? candidates[0] : undefined)
  if (!match?.id) {
    throw new IntegrationError(
      `Could not find an Instagram professional account "@${handle}" linked to a Facebook Page for this token. Make sure @${handle} is a Business or Creator account linked to your Page, then reconnect Instagram with "Add / Connect" (OAuth).`,
      "permission_denied"
    )
  }
  return match.id
}

/**
 * Instagram content publishing: create a media container from a public JPEG
 * URL, wait until Meta has processed it, then publish it.
 */
export async function publishInstagramImage(input: {
  igUserId: string
  accessToken: string
  imageUrl: string
  caption: string
  fetchImpl?: FetchLike
  pollIntervalMs?: number
  maxPolls?: number
}): Promise<PublishResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const pollIntervalMs = input.pollIntervalMs ?? 2000
  const maxPolls = input.maxPolls ?? 15

  const container = await graphCall<{ id?: string }>(
    fetchImpl,
    "POST",
    `${encodeURIComponent(input.igUserId)}/media`,
    { image_url: input.imageUrl, caption: input.caption, access_token: input.accessToken },
    "Creating the Instagram media container"
  )
  if (!container.id) throw new IntegrationError("Instagram did not return a media container id.", "provider_error")

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const status = await graphCall<{ status_code?: string; status?: string }>(
      fetchImpl,
      "GET",
      encodeURIComponent(container.id),
      { fields: "status_code,status", access_token: input.accessToken },
      "Checking the Instagram media status"
    )
    if (status.status_code === "FINISHED") break
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new IntegrationError(
        `Instagram could not process the image (${status.status_code}${status.status ? `: ${status.status}` : ""}). Instagram needs a JPEG between 4:5 and 1.91:1.`,
        "provider_error"
      )
    }
    if (attempt === maxPolls - 1) {
      throw new IntegrationError("Instagram is still processing the image. Try approving again in a minute.", "provider_error")
    }
    await sleep(pollIntervalMs)
  }

  const published = await graphCall<{ id?: string }>(
    fetchImpl,
    "POST",
    `${encodeURIComponent(input.igUserId)}/media_publish`,
    { creation_id: container.id, access_token: input.accessToken },
    "Publishing to Instagram"
  )
  if (!published.id) throw new IntegrationError("Instagram did not return the published media id.", "provider_error")

  let permalink: string | null = null
  try {
    const media = await graphCall<{ permalink?: string }>(
      fetchImpl,
      "GET",
      encodeURIComponent(published.id),
      { fields: "permalink", access_token: input.accessToken },
      "Loading the Instagram permalink"
    )
    permalink = media.permalink ?? null
  } catch {
    // The post is live; a missing permalink is not a failure.
  }
  return { externalPostId: published.id, permalink }
}

/** Exchanges a user token for the Page's own token (needed to post as the Page). Falls back to the stored token. */
async function pageAccessToken(fetchImpl: FetchLike, pageId: string, accessToken: string): Promise<string> {
  try {
    const page = await graphCall<{ access_token?: string }>(
      fetchImpl,
      "GET",
      encodeURIComponent(pageId),
      { fields: "access_token", access_token: accessToken },
      "Loading the Page access token"
    )
    return page.access_token ?? accessToken
  } catch (error) {
    if (error instanceof IntegrationError && error.code === "token_expired") throw error
    // A token that is already a Page token can't read `access_token`; use it as-is.
    return accessToken
  }
}

/** Publishes a photo post (or a text post when there is no image) to a Facebook Page. */
export async function publishFacebookPost(input: {
  pageId: string
  accessToken: string
  caption: string
  imageUrl: string | null
  fetchImpl?: FetchLike
}): Promise<PublishResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const token = await pageAccessToken(fetchImpl, input.pageId, input.accessToken)
  const pagePath = encodeURIComponent(input.pageId)

  if (input.imageUrl) {
    const photo = await graphCall<{ id?: string; post_id?: string }>(
      fetchImpl,
      "POST",
      `${pagePath}/photos`,
      { url: input.imageUrl, message: input.caption, published: "true", access_token: token },
      "Publishing the photo to Facebook"
    )
    const postId = photo.post_id ?? photo.id
    if (!postId) throw new IntegrationError("Facebook did not return a post id.", "provider_error")
    return { externalPostId: postId, permalink: `https://www.facebook.com/${postId}` }
  }

  const post = await graphCall<{ id?: string }>(
    fetchImpl,
    "POST",
    `${pagePath}/feed`,
    { message: input.caption, access_token: token },
    "Publishing to Facebook"
  )
  if (!post.id) throw new IntegrationError("Facebook did not return a post id.", "provider_error")
  return { externalPostId: post.id, permalink: `https://www.facebook.com/${post.id}` }
}
