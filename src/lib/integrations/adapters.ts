import "server-only"

import { serverEnv } from "@/lib/env/server"
import {
  IntegrationError,
  type ExternalAccount,
  type OAuthTokens,
  type ProviderAdapter,
} from "@/lib/integrations/gateway"
import { createResendAdapter } from "@/lib/integrations/email"
import { createMsg91Adapter } from "@/lib/integrations/sms"
import { createWhatsappAdapter } from "@/lib/integrations/whatsapp"

const META_GRAPH_VERSION = "v21.0"
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`

function requireMetaCredentials(): { appId: string; appSecret: string } {
  const env = serverEnv()
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new IntegrationError("Meta credentials (META_APP_ID, META_APP_SECRET) are not configured.", "not_configured")
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET }
}

async function metaGraphGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const url = new URL(`${META_GRAPH}${path}`)
  url.searchParams.set("access_token", accessToken)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url)
  const text = await res.text().catch(() => "")
  if (!res.ok) return { ok: false, status: res.status, body: text.slice(0, 400) }
  try {
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return { ok: false, status: res.status, body: text.slice(0, 400) }
  }
}

function metaGraphErrorMessage(prefix: string, status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: number; error_user_msg?: string }
    }
    const detail =
      parsed.error?.error_user_msg ||
      parsed.error?.message ||
      (body ? body.slice(0, 180) : "")
    return detail
      ? `${prefix} (${status}): ${detail}`
      : `${prefix} (${status})`
  } catch {
    return body ? `${prefix} (${status}): ${body.slice(0, 180)}` : `${prefix} (${status})`
  }
}

type MetaPageRow = {
  id: string
  name: string
  instagram_business_account?: { id: string; username?: string; name?: string }
}

function pagesToExternalAccounts(
  pages: MetaPageRow[],
  id: "instagram" | "facebook"
): ExternalAccount[] {
  if (id === "instagram") {
    return pages
      .filter((p) => p.instagram_business_account?.id)
      .map((p) => ({
        externalId: p.instagram_business_account!.id,
        displayName: p.instagram_business_account!.username
          ? `@${p.instagram_business_account!.username}`
          : p.instagram_business_account!.name ?? p.name,
        kind: "instagram_business" as const,
      }))
  }
  return pages.map((p) => ({
    externalId: p.id,
    displayName: p.name,
    kind: "page" as const,
  }))
}

/** System User tokens often cannot call /me/accounts — also probe Business-owned pages. */
async function listMetaPagesForToken(accessToken: string): Promise<{
  pages: MetaPageRow[]
  errors: string[]
}> {
  const errors: string[] = []
  const byId = new Map<string, MetaPageRow>()

  const merge = (rows: MetaPageRow[]) => {
    for (const row of rows) byId.set(row.id, row)
  }

  const meAccounts = await metaGraphGet<{ data?: MetaPageRow[] }>("/me/accounts", accessToken, {
    fields: "id,name,instagram_business_account{id,username,name}",
    limit: "100",
  })
  if (meAccounts.ok) {
    merge(meAccounts.data.data ?? [])
  } else {
    errors.push(metaGraphErrorMessage("me/accounts", meAccounts.status, meAccounts.body))
  }

  const businesses = await metaGraphGet<{ data?: { id: string; name?: string }[] }>(
    "/me/businesses",
    accessToken,
    { fields: "id,name", limit: "50" }
  )
  if (businesses.ok) {
    for (const business of businesses.data.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"] as const) {
        const pages = await metaGraphGet<{ data?: MetaPageRow[] }>(
          `/${business.id}/${edge}`,
          accessToken,
          {
            fields: "id,name,instagram_business_account{id,username,name}",
            limit: "100",
          }
        )
        if (pages.ok) merge(pages.data.data ?? [])
        else errors.push(metaGraphErrorMessage(`${edge}`, pages.status, pages.body))
      }
    }
  } else {
    errors.push(metaGraphErrorMessage("me/businesses", businesses.status, businesses.body))
  }

  return { pages: [...byId.values()], errors }
}

type MetaVerifyResult =
  | { ok: true; account: ExternalAccount }
  | { ok: false; error: string }

async function listBusinessInstagramAccounts(accessToken: string): Promise<{
  accounts: ExternalAccount[]
  errors: string[]
}> {
  const errors: string[] = []
  const byId = new Map<string, ExternalAccount>()
  const businesses = await metaGraphGet<{ data?: { id: string }[] }>("/me/businesses", accessToken, {
    fields: "id",
    limit: "50",
  })
  if (!businesses.ok) {
    errors.push(metaGraphErrorMessage("me/businesses", businesses.status, businesses.body))
    return { accounts: [], errors }
  }

  for (const business of businesses.data.data ?? []) {
    for (const edge of ["owned_instagram_accounts", "client_instagram_accounts", "instagram_accounts"] as const) {
      const ig = await metaGraphGet<{
        data?: { id: string; username?: string; name?: string }[]
      }>(`/${business.id}/${edge}`, accessToken, {
        fields: "id,username,name",
        limit: "100",
      })
      if (!ig.ok) {
        // Many portfolios only expose one of these edges — ignore 400s quietly.
        if (ig.status !== 400 && ig.status !== 404) {
          errors.push(metaGraphErrorMessage(edge, ig.status, ig.body))
        }
        continue
      }
      for (const row of ig.data.data ?? []) {
        byId.set(row.id, {
          externalId: row.id,
          displayName: row.username ? `@${row.username}` : row.name ?? row.id,
          kind: "instagram_business",
        })
      }
    }
  }

  return { accounts: [...byId.values()], errors }
}

/** Verify a known IG user id / Page id without needing /me/accounts (System User friendly). */
export async function verifyMetaConnectedAsset(input: {
  provider: "instagram" | "facebook"
  accessToken: string
  externalAccountId: string
}): Promise<MetaVerifyResult> {
  const id = input.externalAccountId.trim()
  if (!id) return { ok: false, error: "Missing external account id." }

  if (input.provider === "instagram") {
    const ig = await metaGraphGet<{ id?: string; username?: string; name?: string }>(
      `/${id}`,
      input.accessToken,
      { fields: "id,username,name" }
    )
    if (ig.ok && ig.data.id) {
      return {
        ok: true,
        account: {
          externalId: ig.data.id,
          displayName: ig.data.username
            ? `@${ig.data.username}`
            : ig.data.name ?? ig.data.id,
          kind: "instagram_business",
        },
      }
    }

    const fromBusiness = await listBusinessInstagramAccounts(input.accessToken)
    const match = fromBusiness.accounts.find((a) => a.externalId === id)
    if (match) return { ok: true, account: match }

    const { pages } = await listMetaPagesForToken(input.accessToken)
    const fromPage = pages.find((p) => p.instagram_business_account?.id === id)
    if (fromPage?.instagram_business_account) {
      const iba = fromPage.instagram_business_account
      return {
        ok: true,
        account: {
          externalId: iba.id,
          displayName: iba.username ? `@${iba.username}` : iba.name ?? fromPage.name,
          kind: "instagram_business",
        },
      }
    }

    const detail = !ig.ok
      ? metaGraphErrorMessage("Instagram user", ig.status, ig.body)
      : "Token cannot read this Instagram Business account."
    return {
      ok: false,
      error: `${detail} In Meta → System users → Generate token, select app tectangle_comms and enable Instagram + Pages permissions (instagram_basic / instagram_business_basic, pages_show_list, business_management). Assets assigned to the System User is not enough — permissions must be checked on the token.`,
    }
  }

  const page = await metaGraphGet<{
    id?: string
    name?: string
    instagram_business_account?: { id: string }
  }>(`/${id}`, input.accessToken, {
    fields: "id,name,instagram_business_account{id}",
  })
  if (page.ok && page.data.id) {
    return {
      ok: true,
      account: {
        externalId: page.data.id,
        displayName: page.data.name ?? page.data.id,
        kind: "page",
      },
    }
  }
  const detail = !page.ok
    ? metaGraphErrorMessage("Facebook Page", page.status, page.body)
    : "Token cannot read this Facebook Page."
  return { ok: false, error: detail }
}

function requireGoogleCredentials(): { clientId: string; clientSecret: string } {
  const env = serverEnv()
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new IntegrationError("Google credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) are not configured.", "not_configured")
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
}

function requireLinkedInCredentials(): { clientId: string; clientSecret: string } {
  const env = serverEnv()
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new IntegrationError("LinkedIn credentials (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET) are not configured.", "not_configured")
  }
  return { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET }
}

function requireTikTokCredentials(): { clientKey: string; clientSecret: string } {
  const env = serverEnv()
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    throw new IntegrationError("TikTok credentials (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET) are not configured.", "not_configured")
  }
  return { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET }
}

function createMetaAdapter(
  id: "instagram" | "facebook" | "meta_ads",
  requiredScopes: string[]
): ProviderAdapter {
  return {
    id,
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
      const tokenUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
      tokenUrl.searchParams.set("client_id", appId)
      tokenUrl.searchParams.set("client_secret", appSecret)
      tokenUrl.searchParams.set("redirect_uri", redirectUri)
      tokenUrl.searchParams.set("code", code)

      const res = await fetch(tokenUrl, { method: "GET" })
      if (!res.ok) {
        throw new IntegrationError(`Meta token exchange failed (${res.status})`, "provider_error")
      }
      const shortLived = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!shortLived.access_token) {
        throw new IntegrationError("Meta did not return an access token", "provider_error")
      }

      // The code exchange returns a short-lived (1–2 hour) user token. Swap it for a
      // long-lived (~60 day) token so approved posts can still be published later;
      // Page tokens derived from it don't expire.
      let data: { access_token?: string; expires_in?: number } = shortLived
      const longUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
      longUrl.searchParams.set("grant_type", "fb_exchange_token")
      longUrl.searchParams.set("client_id", appId)
      longUrl.searchParams.set("client_secret", appSecret)
      longUrl.searchParams.set("fb_exchange_token", shortLived.access_token)
      try {
        const longRes = await fetch(longUrl)
        if (longRes.ok) {
          const longLived = (await longRes.json()) as { access_token?: string; expires_in?: number }
          if (longLived.access_token) data = longLived
        }
      } catch {
        // Keep the short-lived token; the account shows its expiry and can be reconnected.
      }
      if (!data.access_token) {
        throw new IntegrationError("Meta did not return an access token", "provider_error")
      }

      const permsUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`)
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
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
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
    async listAccounts(tokens: OAuthTokens): Promise<ExternalAccount[]> {
      if (id === "meta_ads") {
        const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`)
        url.searchParams.set("fields", "id,name,account_id")
        url.searchParams.set("access_token", tokens.accessToken)
        const res = await fetch(url)
        if (!res.ok) throw new IntegrationError("Could not list Meta ad accounts", "provider_error")
        const body = (await res.json()) as { data?: { id: string; name?: string; account_id?: string }[] }
        return (body.data ?? []).map((acc) => ({
          externalId: acc.account_id || acc.id,
          displayName: acc.name || acc.id,
          kind: "ad_account",
        }))
      }

<<<<<<< HEAD
      if (id === "instagram" && /^IG/.test(tokens.accessToken.trim())) {
        // "Instagram API with Instagram Login" token: one professional account, on graph.instagram.com.
        const meUrl = new URL(`https://graph.instagram.com/${META_GRAPH_VERSION}/me`)
        meUrl.searchParams.set("fields", "user_id,username")
        meUrl.searchParams.set("access_token", tokens.accessToken)
        const meRes = await fetch(meUrl)
        const me = (await meRes.json().catch(() => null)) as
          | { user_id?: string; id?: string; username?: string; error?: { message?: string } }
          | null
        if (!meRes.ok || !me || me.error) {
          throw new IntegrationError(
            `Instagram rejected the token${me?.error?.message ? `: ${me.error.message}` : ""}. Generate a new token for the account and try again.`,
            "provider_error"
          )
        }
        const igId = me.user_id ?? me.id
        if (!igId) throw new IntegrationError("Instagram did not return the account id for this token.", "provider_error")
        return [{ externalId: igId, displayName: me.username ? `@${me.username}` : igId, kind: "instagram_business" }]
      }

      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`)
      url.searchParams.set("fields", "id,name,instagram_business_account{id,username,name}")
      url.searchParams.set("access_token", tokens.accessToken)
      const res = await fetch(url)
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new IntegrationError(
          `Could not list Meta Pages${err?.error?.message ? `: ${err.error.message}` : ""}. The token needs pages_show_list (and instagram_basic for Instagram).`,
          "provider_error"
        )
      }
      const body = (await res.json()) as {
        data?: {
          id: string
          name: string
          instagram_business_account?: { id: string; username?: string; name?: string }
        }[]
=======
      const { pages, errors } = await listMetaPagesForToken(tokens.accessToken)
      let accounts = pagesToExternalAccounts(pages, id)

      if (id === "instagram" && accounts.length === 0) {
        const igDirect = await listBusinessInstagramAccounts(tokens.accessToken)
        accounts = igDirect.accounts
        errors.push(...igDirect.errors)
>>>>>>> ba34416 (Social Media Integrations and Whatsapp automation)
      }

      if (accounts.length > 0) return accounts

      const hint =
        id === "instagram"
          ? " Generate a System User token for app tectangle_comms with Instagram + Pages permissions checked (instagram_basic or instagram_business_basic, pages_show_list, business_management)."
          : " Token needs pages_show_list / business_management, or assign Pages to the System User in Meta Business Suite."
      throw new IntegrationError(
        (errors[0] ? errors[0] : "Could not list Meta Pages") + hint,
        "provider_error"
      )
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}

function createGoogleAdapter(
  id: "youtube" | "google_ads" | "search_console",
  requiredScopes: string[]
): ProviderAdapter {
  return {
    id,
    requiredScopes,
    authorizationUrl({ state, redirectUri }) {
      const { clientId } = requireGoogleCredentials()
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      url.searchParams.set("client_id", clientId)
      url.searchParams.set("redirect_uri", redirectUri)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("access_type", "offline")
      url.searchParams.set("prompt", "consent")
      url.searchParams.set("scope", requiredScopes.join(" "))
      url.searchParams.set("state", state)
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const { clientId, clientSecret } = requireGoogleCredentials()
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      })
      if (!res.ok) throw new IntegrationError(`Google token exchange failed (${res.status})`, "provider_error")
      const data = (await res.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }
      if (!data.access_token) throw new IntegrationError("Google did not return an access token", "provider_error")
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: data.scope ? data.scope.split(" ") : [],
      }
    },
    async refresh(refreshToken) {
      const { clientId, clientSecret } = requireGoogleCredentials()
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      })
      if (!res.ok) throw new IntegrationError("Google token refresh failed", "token_expired")
      const data = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string }
      if (!data.access_token) throw new IntegrationError("Google refresh returned no token", "token_expired")
      return {
        accessToken: data.access_token,
        refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: data.scope ? data.scope.split(" ") : requiredScopes,
      }
    },
    async listAccounts(tokens: OAuthTokens): Promise<ExternalAccount[]> {
      if (id === "youtube") {
        const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (!res.ok) throw new IntegrationError("Could not list YouTube channels", "provider_error")
        const body = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] }
        return (body.items ?? []).map((ch) => ({
          externalId: ch.id,
          displayName: ch.snippet?.title ?? ch.id,
          kind: "channel",
        }))
      }
      if (id === "search_console") {
        const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (!res.ok) throw new IntegrationError("Could not list Search Console properties", "provider_error")
        const body = (await res.json()) as { siteEntry?: { siteUrl: string }[] }
        return (body.siteEntry ?? []).map((site) => ({
          externalId: site.siteUrl,
          displayName: site.siteUrl,
          kind: "property",
        }))
      }
      return []
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}

function createLinkedInAdapter(requiredScopes: string[]): ProviderAdapter {
  return {
    id: "linkedin",
    requiredScopes,
    authorizationUrl({ state, redirectUri }) {
      const { clientId } = requireLinkedInCredentials()
      const url = new URL("https://www.linkedin.com/oauth/v2/authorization")
      url.searchParams.set("response_type", "code")
      url.searchParams.set("client_id", clientId)
      url.searchParams.set("redirect_uri", redirectUri)
      url.searchParams.set("state", state)
      url.searchParams.set("scope", requiredScopes.join(" "))
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const { clientId, clientSecret } = requireLinkedInCredentials()
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })
      if (!res.ok) throw new IntegrationError(`LinkedIn token exchange failed (${res.status})`, "provider_error")
      const data = (await res.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }
      if (!data.access_token) throw new IntegrationError("LinkedIn did not return an access token", "provider_error")
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: data.scope ? data.scope.split(/[\s,]+/) : requiredScopes,
      }
    },
    async refresh(refreshToken) {
      const { clientId, clientSecret } = requireLinkedInCredentials()
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })
      if (!res.ok) throw new IntegrationError("LinkedIn token refresh failed", "token_expired")
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) throw new IntegrationError("LinkedIn refresh returned no token", "token_expired")
      return {
        accessToken: data.access_token,
        refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: requiredScopes,
      }
    },
    async listAccounts(tokens) {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (!res.ok) throw new IntegrationError("Could not load LinkedIn profile", "provider_error")
      const profile = (await res.json()) as { sub?: string; name?: string }
      if (!profile.sub) return []
      return [
        {
          externalId: profile.sub,
          displayName: profile.name ?? `LinkedIn (${profile.sub})`,
          kind: "page",
        },
      ]
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}

function createTikTokAdapter(requiredScopes: string[]): ProviderAdapter {
  return {
    id: "tiktok",
    requiredScopes,
    authorizationUrl({ state, redirectUri }) {
      const { clientKey } = requireTikTokCredentials()
      const url = new URL("https://www.tiktok.com/v2/auth/authorize/")
      url.searchParams.set("client_key", clientKey)
      url.searchParams.set("scope", requiredScopes.join(","))
      url.searchParams.set("response_type", "code")
      url.searchParams.set("redirect_uri", redirectUri)
      url.searchParams.set("state", state)
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const { clientKey, clientSecret } = requireTikTokCredentials()
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      })
      if (!res.ok) throw new IntegrationError(`TikTok token exchange failed (${res.status})`, "provider_error")
      const data = (await res.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }
      if (!data.access_token) throw new IntegrationError("TikTok did not return an access token", "provider_error")
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: data.scope ? data.scope.split(",") : requiredScopes,
      }
    },
    async refresh(refreshToken) {
      const { clientKey, clientSecret } = requireTikTokCredentials()
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      })
      if (!res.ok) throw new IntegrationError("TikTok token refresh failed", "token_expired")
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
      if (!data.access_token) throw new IntegrationError("TikTok refresh returned no token", "token_expired")
      return {
        accessToken: data.access_token,
        refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        scopes: requiredScopes,
      }
    },
    async listAccounts(tokens) {
      const res = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      )
      if (!res.ok) throw new IntegrationError("Could not load TikTok account info", "provider_error")
      const body = (await res.json()) as {
        data?: { user?: { open_id?: string; display_name?: string; username?: string } }
      }
      const user = body.data?.user
      if (!user?.open_id) return []
      return [
        {
          externalId: user.open_id,
          displayName: user.username ? `@${user.username}` : user.display_name ?? user.open_id,
          kind: "channel",
        },
      ]
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}

export const BUILTIN_ADAPTERS: Record<string, ProviderAdapter> = {
  instagram: createMetaAdapter("instagram", [
    "instagram_basic",
    "instagram_business_basic",
    "instagram_content_publish",
    "instagram_business_content_publish",
    "instagram_manage_insights",
    "instagram_business_manage_insights",
    "instagram_manage_messages",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_read_engagement",
    "pages_messaging",
    "pages_manage_metadata",
    "business_management",
  ]),
  facebook: createMetaAdapter("facebook", [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "read_insights",
  ]),
  whatsapp: createWhatsappAdapter(),
  msg91: createMsg91Adapter(),
  resend: createResendAdapter(),
  meta_ads: createMetaAdapter("meta_ads", ["ads_management", "ads_read", "business_management"]),
  youtube: createGoogleAdapter("youtube", [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ]),
  google_ads: createGoogleAdapter("google_ads", ["https://www.googleapis.com/auth/adwords"]),
  search_console: createGoogleAdapter("search_console", [
    "https://www.googleapis.com/auth/webmasters.readonly",
  ]),
  linkedin: createLinkedInAdapter(["openid", "profile", "w_member_social"]),
  tiktok: createTikTokAdapter(["user.info.basic", "video.publish", "video.upload"]),
}

