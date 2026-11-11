import "server-only"

import { serverEnv } from "@/lib/env/server"
import {
  IntegrationError,
  type ExternalAccount,
  type OAuthTokens,
  type ProviderAdapter,
} from "@/lib/integrations/gateway"

const META_GRAPH_VERSION = "v21.0"

function requireMetaCredentials(): { appId: string; appSecret: string } {
  const env = serverEnv()
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new IntegrationError("Meta credentials (META_APP_ID, META_APP_SECRET) are not configured.", "not_configured")
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET }
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
      const data = (await res.json()) as { access_token?: string; expires_in?: number }
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

      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`)
      url.searchParams.set("fields", "id,name,instagram_business_account{id,username,name}")
      url.searchParams.set("access_token", tokens.accessToken)
      const res = await fetch(url)
      if (!res.ok) throw new IntegrationError("Could not list Meta Pages", "provider_error")
      const body = (await res.json()) as {
        data?: {
          id: string
          name: string
          instagram_business_account?: { id: string; username?: string; name?: string }
        }[]
      }
      const pages = body.data ?? []
      if (id === "instagram") {
        return pages
          .filter((p) => p.instagram_business_account?.id)
          .map((p) => ({
            externalId: p.instagram_business_account!.id,
            displayName: p.instagram_business_account!.username
              ? `@${p.instagram_business_account!.username}`
              : p.instagram_business_account!.name ?? p.name,
            kind: "instagram_business",
          }))
      }
      return pages.map((p) => ({
        externalId: p.id,
        displayName: p.name,
        kind: "page",
      }))
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
    "instagram_content_publish",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
  ]),
  facebook: createMetaAdapter("facebook", [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "read_insights",
  ]),
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

