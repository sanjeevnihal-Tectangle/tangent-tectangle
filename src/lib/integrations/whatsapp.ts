import "server-only"

import {
  IntegrationError,
  type ExternalAccount,
  type OAuthTokens,
  type ProviderAdapter,
} from "@/lib/integrations/gateway"
import {
  formatWhatsappExternalId,
  parseWhatsappExternalId,
} from "@/lib/domain/messaging"
import { serverEnv } from "@/lib/env/server"

const META_GRAPH_VERSION = "v21.0"
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

export const WHATSAPP_SCOPES = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
  "business_management",
] as const

function requireMetaCredentials(): { appId: string; appSecret: string } {
  const env = serverEnv()
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new IntegrationError(
      "Meta credentials (META_APP_ID, META_APP_SECRET) are not configured.",
      "not_configured"
    )
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET }
}

async function graphGet<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  url.searchParams.set("access_token", accessToken)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(`WhatsApp Graph permission denied (${res.status})`, "permission_denied")
    }
    if (res.status === 429) {
      throw new IntegrationError("WhatsApp Graph rate limited", "rate_limited")
    }
    throw new IntegrationError(
      `WhatsApp Graph GET ${path} failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      "provider_error"
    )
  }
  return (await res.json()) as T
}

async function graphPost<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  url.searchParams.set("access_token", accessToken)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(`WhatsApp Graph permission denied (${res.status})`, "permission_denied")
    }
    throw new IntegrationError(
      `WhatsApp Graph POST ${path} failed (${res.status})${text ? `: ${text.slice(0, 280)}` : ""}`,
      "provider_error"
    )
  }
  return (await res.json()) as T
}

export interface MetaWhatsappTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: {
    type: string
    text?: string
    format?: string
    buttons?: { type: string; text: string; url?: string; phone_number?: string }[]
    example?: {
      body_text?: string[][]
      header_text?: string[]
      header_handle?: string[]
      header_url?: string[]
    }
  }[]
  rejected_reason?: string
}

export interface WhatsappTemplateDraft {
  name: string
  language: string
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
  headerText?: string
  /** When IMAGE / VIDEO / DOCUMENT, Meta needs a sample via Resumable Upload. */
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"
  /** Public HTTPS sample used for Meta review + default send-time media. */
  headerMediaUrl?: string
  /** Pre-uploaded Meta header_handle (skips URL upload when set). */
  headerMediaHandle?: string
  bodyText: string
  footerText?: string
  variableExamples: string[]
  buttons?: {
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
    text: string
    url?: string
    phoneNumber?: string
  }[]
}

const MEDIA_HEADER_MIME: Record<"IMAGE" | "VIDEO" | "DOCUMENT", string[]> = {
  IMAGE: ["image/jpeg", "image/jpg", "image/png"],
  VIDEO: ["video/mp4"],
  DOCUMENT: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
}

/** Upload a public media URL to Meta Resumable Upload API; returns header_handle for template create. */
export async function uploadMetaTemplateMediaSample(input: {
  accessToken: string
  mediaUrl: string
  format: "IMAGE" | "VIDEO" | "DOCUMENT"
}): Promise<string> {
  const { appId } = requireMetaCredentials()
  const mediaUrl = input.mediaUrl.trim()
  if (!/^https:\/\//i.test(mediaUrl)) {
    throw new IntegrationError(
      "Header media sample must be a public HTTPS URL for Meta template review.",
      "provider_error"
    )
  }

  const fileRes = await fetch(mediaUrl)
  if (!fileRes.ok) {
    throw new IntegrationError(
      `Could not download header media sample (${fileRes.status}). Host the file on a public HTTPS URL.`,
      "provider_error"
    )
  }
  const bytes = Buffer.from(await fileRes.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new IntegrationError("Header media sample file is empty.", "provider_error")
  }

  const contentTypeHeader = fileRes.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  const allowed = MEDIA_HEADER_MIME[input.format]
  let fileType = contentTypeHeader && allowed.includes(contentTypeHeader) ? contentTypeHeader : null
  if (!fileType) {
    if (input.format === "IMAGE") fileType = "image/jpeg"
    else if (input.format === "VIDEO") fileType = "video/mp4"
    else fileType = "application/pdf"
  }

  const sessionUrl = new URL(`${GRAPH}/${appId}/uploads`)
  sessionUrl.searchParams.set("file_length", String(bytes.byteLength))
  sessionUrl.searchParams.set("file_type", fileType)
  sessionUrl.searchParams.set("access_token", input.accessToken)

  const sessionRes = await fetch(sessionUrl, { method: "POST" })
  const sessionText = await sessionRes.text().catch(() => "")
  if (!sessionRes.ok) {
    throw new IntegrationError(
      `Meta upload session failed (${sessionRes.status})${sessionText ? `: ${sessionText.slice(0, 200)}` : ""}`,
      "provider_error"
    )
  }
  const session = JSON.parse(sessionText) as { id?: string }
  if (!session.id) {
    throw new IntegrationError("Meta upload session did not return an id", "provider_error")
  }

  const uploadRes = await fetch(`${GRAPH}/${session.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${input.accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  })
  const uploadText = await uploadRes.text().catch(() => "")
  if (!uploadRes.ok) {
    throw new IntegrationError(
      `Meta media upload failed (${uploadRes.status})${uploadText ? `: ${uploadText.slice(0, 200)}` : ""}`,
      "provider_error"
    )
  }
  const uploaded = JSON.parse(uploadText) as { h?: string }
  if (!uploaded.h) {
    throw new IntegrationError("Meta media upload did not return a header handle", "provider_error")
  }
  return uploaded.h
}

function buildMetaComponents(draft: WhatsappTemplateDraft): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = []

  const headerFormat = draft.headerFormat ?? (draft.headerText ? "TEXT" : undefined)
  if (headerFormat === "TEXT" && draft.headerText?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: draft.headerText.trim() })
  } else if (
    headerFormat === "IMAGE" ||
    headerFormat === "VIDEO" ||
    headerFormat === "DOCUMENT"
  ) {
    const handle = draft.headerMediaHandle?.trim()
    if (!handle) {
      throw new IntegrationError(
        `Meta requires a sample ${headerFormat} for template review. Provide a public HTTPS media URL before Submit to Meta.`,
        "provider_error"
      )
    }
    components.push({
      type: "HEADER",
      format: headerFormat,
      example: { header_handle: [handle] },
    })
  }

  const body: Record<string, unknown> = { type: "BODY", text: draft.bodyText }
  if (draft.variableExamples.length > 0) {
    body.example = { body_text: [draft.variableExamples] }
  }
  components.push(body)

  if (draft.footerText) {
    components.push({ type: "FOOTER", text: draft.footerText })
  }

  if (draft.buttons && draft.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) => {
        if (b.type === "URL") {
          const url = b.url?.trim()
          if (!url) {
            throw new IntegrationError("URL buttons need a link (https://…)", "provider_error")
          }
          return { type: "URL", text: b.text, url }
        }
        if (b.type === "PHONE_NUMBER") {
          const phone = b.phoneNumber?.trim()
          if (!phone) {
            throw new IntegrationError("Call buttons need a phone number in E.164", "provider_error")
          }
          return { type: "PHONE_NUMBER", text: b.text, phone_number: phone }
        }
        return { type: "QUICK_REPLY", text: b.text }
      }),
    })
  }

  return components
}

type WaPhone = {
  id: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
}

async function listPhonesForWaba(
  accessToken: string,
  wabaId: string,
  wabaName?: string
): Promise<ExternalAccount[]> {
  const phones = await graphGet<{ data?: WaPhone[] }>(`/${wabaId}/phone_numbers`, accessToken, {
    fields: "id,display_phone_number,verified_name,quality_rating",
  }).catch(() => ({ data: [] as WaPhone[] }))

  return (phones.data ?? []).map((phone) => {
    const label = [phone.verified_name || wabaName || "WhatsApp", phone.display_phone_number]
      .filter(Boolean)
      .join(" · ")
    return {
      externalId: formatWhatsappExternalId(wabaId, phone.id),
      displayName: label || phone.id,
      kind: "phone_number" as const,
    }
  })
}

async function collectWabasFromBusiness(
  accessToken: string,
  businessId: string
): Promise<{ id: string; name?: string }[]> {
  const owned = await graphGet<{ data?: { id: string; name?: string }[] }>(
    `/${businessId}/owned_whatsapp_business_accounts`,
    accessToken,
    { fields: "id,name" }
  ).catch(() => ({ data: [] as { id: string; name?: string }[] }))

  const client = await graphGet<{ data?: { id: string; name?: string }[] }>(
    `/${businessId}/client_whatsapp_business_accounts`,
    accessToken,
    { fields: "id,name" }
  ).catch(() => ({ data: [] as { id: string; name?: string }[] }))

  const byId = new Map<string, { id: string; name?: string }>()
  for (const w of [...(owned.data ?? []), ...(client.data ?? [])]) byId.set(w.id, w)
  return [...byId.values()]
}

export async function listWhatsappPhoneAccounts(accessToken: string): Promise<ExternalAccount[]> {
  const accounts: ExternalAccount[] = []
  const seen = new Set<string>()

  const businesses = await graphGet<{ data?: { id: string; name?: string }[] }>(
    "/me/businesses",
    accessToken,
    { fields: "id,name" }
  ).catch(() => ({ data: [] as { id: string; name?: string }[] }))

  for (const business of businesses.data ?? []) {
    const wabas = await collectWabasFromBusiness(accessToken, business.id)
    for (const waba of wabas) {
      const phones = await listPhonesForWaba(accessToken, waba.id, waba.name)
      for (const phone of phones) {
        if (seen.has(phone.externalId)) continue
        seen.add(phone.externalId)
        accounts.push(phone)
      }
    }
  }

  // System User tokens often skip /me/businesses — try assigned WABAs on the token user.
  if (accounts.length === 0) {
    const assigned = await graphGet<{ data?: { id: string; name?: string }[] }>(
      "/me/assigned_whatsapp_business_accounts",
      accessToken,
      { fields: "id,name" }
    ).catch(() => ({ data: [] as { id: string; name?: string }[] }))

    for (const waba of assigned.data ?? []) {
      const phones = await listPhonesForWaba(accessToken, waba.id, waba.name)
      for (const phone of phones) {
        if (seen.has(phone.externalId)) continue
        seen.add(phone.externalId)
        accounts.push(phone)
      }
    }
  }

  return accounts
}

/**
 * Resolve WABA + phone number ids from a connected-account external id.
 * Accepts `wabaId:phoneNumberId`, a bare WABA id, or a bare phone-number id.
 */
export async function resolveWhatsappAccountIds(
  accessToken: string,
  externalAccountId: string
): Promise<{ wabaId: string; phoneNumberId: string; externalId: string }> {
  const parsed = parseWhatsappExternalId(externalAccountId)
  if (parsed) {
    return {
      wabaId: parsed.wabaId,
      phoneNumberId: parsed.phoneNumberId,
      externalId: externalAccountId,
    }
  }

  const bare = externalAccountId.trim()
  if (!bare) {
    throw new IntegrationError(
      "WhatsApp external id is empty. Reconnect with wabaId:phoneNumberId.",
      "not_configured"
    )
  }

  // 1) Bare id is often the WABA id from Meta API Setup — probe phone_numbers / templates.
  const asWabaPhones = await listPhonesForWaba(accessToken, bare)
  if (asWabaPhones.length > 0) {
    const first = asWabaPhones[0]!
    const resolved = parseWhatsappExternalId(first.externalId)!
    return {
      wabaId: resolved.wabaId,
      phoneNumberId: resolved.phoneNumberId,
      externalId: first.externalId,
    }
  }

  const templatesProbe = await graphGet<{ data?: unknown[] }>(
    `/${bare}/message_templates`,
    accessToken,
    { fields: "id", limit: "1" }
  ).catch(() => null)
  if (templatesProbe) {
    // Valid WABA with no phone numbers listed (or phone list denied) — still usable for sync.
    return {
      wabaId: bare,
      phoneNumberId: bare,
      externalId: formatWhatsappExternalId(bare, bare),
    }
  }

  // 2) Discover via businesses / assigned WABAs and match phone or WABA id.
  const discovered = await listWhatsappPhoneAccounts(accessToken)
  const match =
    discovered.find((a) => a.externalId === bare) ??
    discovered.find((a) => a.externalId.endsWith(`:${bare}`)) ??
    discovered.find((a) => a.externalId.startsWith(`${bare}:`)) ??
    (discovered.length === 1 ? discovered[0] : undefined)

  if (!match) {
    throw new IntegrationError(
      "Could not resolve WABA for this WhatsApp account. In Integrations → Attach token / reconnect, set External ID to wabaId:phoneNumberId from Meta → WhatsApp → API Setup (both IDs are shown there).",
      "provider_error"
    )
  }

  const resolved = parseWhatsappExternalId(match.externalId)
  if (!resolved) {
    throw new IntegrationError("Resolved WhatsApp account id was invalid", "provider_error")
  }
  return {
    wabaId: resolved.wabaId,
    phoneNumberId: resolved.phoneNumberId,
    externalId: match.externalId,
  }
}

export async function listMetaMessageTemplates(
  accessToken: string,
  wabaId: string
): Promise<MetaWhatsappTemplate[]> {
  const body = await graphGet<{ data?: MetaWhatsappTemplate[] }>(
    `/${wabaId}/message_templates`,
    accessToken,
    { fields: "id,name,language,status,category,components,rejected_reason", limit: "100" }
  )
  return body.data ?? []
}

export async function submitMetaMessageTemplate(
  accessToken: string,
  wabaId: string,
  draft: WhatsappTemplateDraft
): Promise<{ id: string; status: string }> {
  const result = await graphPost<{ id?: string; status?: string }>(
    `/${wabaId}/message_templates`,
    accessToken,
    {
      name: draft.name,
      language: draft.language,
      category: draft.category,
      components: buildMetaComponents(draft),
    }
  )
  if (!result.id) {
    throw new IntegrationError("Meta did not return a template id", "provider_error")
  }
  return { id: result.id, status: result.status ?? "PENDING" }
}

export async function sendWhatsappTemplateMessage(input: {
  accessToken: string
  phoneNumberId: string
  toE164: string
  templateName: string
  language: string
  bodyParameters: string[]
  /**
   * Placeholder keys from the template body ({{1}} or {{account}}).
   * Named (non-numeric) placeholders require Meta `parameter_name` on each body param.
   */
  bodyParameterNames?: string[]
  /** Required when the Meta template header format is IMAGE / VIDEO / DOCUMENT. */
  headerMedia?: {
    format: "IMAGE" | "VIDEO" | "DOCUMENT"
    /** Public HTTPS URL, or Meta media id when link is omitted. */
    link?: string
    mediaId?: string
  }
}): Promise<{ messageId: string }> {
  const components: Record<string, unknown>[] = []

  if (input.headerMedia) {
    const mediaType = input.headerMedia.format.toLowerCase() as "image" | "video" | "document"
    const mediaPayload: Record<string, string> = {}
    if (input.headerMedia.mediaId?.trim()) {
      mediaPayload.id = input.headerMedia.mediaId.trim()
    } else if (input.headerMedia.link?.trim()) {
      mediaPayload.link = input.headerMedia.link.trim()
    } else {
      throw new IntegrationError(
        `This template requires a ${input.headerMedia.format} header. Provide a public HTTPS media URL.`,
        "provider_error"
      )
    }
    components.push({
      type: "header",
      parameters: [{ type: mediaType, [mediaType]: mediaPayload }],
    })
  }

  if (input.bodyParameters.length > 0) {
    const names = input.bodyParameterNames ?? []
    const usesNamedParams = names.some((name) => name.length > 0 && !/^\d+$/.test(name))

    components.push({
      type: "body",
      parameters: input.bodyParameters.map((text, index) => {
        const value = text?.trim()
        if (!value) {
          throw new IntegrationError(
            `WhatsApp body parameter ${names[index] ? `{{${names[index]}}}` : `#${index + 1}`} is empty`,
            "provider_error"
          )
        }
        const param: Record<string, string> = { type: "text", text: value }
        if (usesNamedParams) {
          const parameterName = names[index]?.trim()
          if (!parameterName) {
            throw new IntegrationError(
              `WhatsApp named parameter missing for body value #${index + 1}`,
              "provider_error"
            )
          }
          param.parameter_name = parameterName
        }
        return param
      }),
    })
  }

  const result = await graphPost<{ messages?: { id?: string }[] }>(
    `/${input.phoneNumberId}/messages`,
    input.accessToken,
    {
      messaging_product: "whatsapp",
      to: input.toE164.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(components.length > 0 ? { components } : {}),
      },
    }
  )

  const messageId = result.messages?.[0]?.id
  if (!messageId) {
    throw new IntegrationError("Meta did not return a message id", "provider_error")
  }
  return { messageId }
}

/** Free-form text inside the 24h customer service window (not for marketing outside session). */
export async function sendWhatsappTextMessage(input: {
  accessToken: string
  phoneNumberId: string
  toE164: string
  body: string
}): Promise<{ messageId: string }> {
  const text = input.body.trim()
  if (!text) {
    throw new IntegrationError("Reply body is empty", "provider_error")
  }
  const result = await graphPost<{ messages?: { id?: string }[] }>(
    `/${input.phoneNumberId}/messages`,
    input.accessToken,
    {
      messaging_product: "whatsapp",
      to: input.toE164.replace(/^\+/, ""),
      type: "text",
      text: { preview_url: false, body: text.slice(0, 4096) },
    }
  )
  const messageId = result.messages?.[0]?.id
  if (!messageId) {
    throw new IntegrationError("Meta did not return a message id", "provider_error")
  }
  return { messageId }
}

export function createWhatsappAdapter(): ProviderAdapter {
  const requiredScopes = [...WHATSAPP_SCOPES]
  return {
    id: "whatsapp",
    requiredScopes,
    authorizationUrl({ state, redirectUri }) {
      const { appId } = requireMetaCredentials()
      const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`)
      url.searchParams.set("client_id", appId)
      url.searchParams.set("redirect_uri", redirectUri)
      url.searchParams.set("state", state)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("scope", requiredScopes.join(","))
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const { appId, appSecret } = requireMetaCredentials()
      const tokenUrl = new URL(`${GRAPH}/oauth/access_token`)
      tokenUrl.searchParams.set("client_id", appId)
      tokenUrl.searchParams.set("client_secret", appSecret)
      tokenUrl.searchParams.set("redirect_uri", redirectUri)
      tokenUrl.searchParams.set("code", code)

      const res = await fetch(tokenUrl)
      if (!res.ok) {
        throw new IntegrationError(`Meta token exchange failed (${res.status})`, "provider_error")
      }
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) {
        throw new IntegrationError("Meta did not return an access token", "provider_error")
      }

      const permsUrl = new URL(`${GRAPH}/me/permissions`)
      permsUrl.searchParams.set("access_token", data.access_token)
      const permsRes = await fetch(permsUrl)
      const permsJson = permsRes.ok
        ? ((await permsRes.json()) as { data?: { permission: string; status: string }[] })
        : { data: [] }
      const scopes = (permsJson.data ?? [])
        .filter((p) => p.status === "granted")
        .map((p) => p.permission)

      return {
        accessToken: data.access_token,
        refreshToken: null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes,
      }
    },
    async refresh(refreshToken) {
      const { appId, appSecret } = requireMetaCredentials()
      const url = new URL(`${GRAPH}/oauth/access_token`)
      url.searchParams.set("grant_type", "fb_exchange_token")
      url.searchParams.set("client_id", appId)
      url.searchParams.set("client_secret", appSecret)
      url.searchParams.set("fb_exchange_token", refreshToken)
      const res = await fetch(url)
      if (!res.ok) throw new IntegrationError("Meta token refresh failed", "token_expired")
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) throw new IntegrationError("Meta refresh returned no token", "token_expired")
      return {
        accessToken: data.access_token,
        refreshToken: data.access_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: requiredScopes,
      }
    },
    async listAccounts(tokens: OAuthTokens) {
      return listWhatsappPhoneAccounts(tokens.accessToken)
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}

export function mapMetaTemplateStatus(status: string): "pending_meta" | "approved" | "rejected" | "paused" {
  const upper = status.toUpperCase()
  switch (upper) {
    case "APPROVED":
      return "approved"
    case "REJECTED":
      return "rejected"
    case "PAUSED":
    case "DISABLED":
      return "paused"
    case "PENDING":
    case "IN_APPEAL":
    default:
      return "pending_meta"
  }
}

export function mapMetaTemplateCategory(category: string): "marketing" | "utility" | "authentication" {
  const upper = category.toUpperCase()
  switch (upper) {
    case "UTILITY":
      return "utility"
    case "AUTHENTICATION":
      return "authentication"
    case "MARKETING":
    default:
      return "marketing"
  }
}
