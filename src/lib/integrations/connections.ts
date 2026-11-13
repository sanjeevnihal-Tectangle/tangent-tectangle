import type { ConnectedAccountView } from "@/lib/domain/social"

/**
 * Workspace connection status as the agents see it. Pure functions over the
 * connected accounts stored for the workspace (no tokens involved), shared by
 * the orchestrator (planning context + approval cards) and the executor.
 */

/** Platforms Tangent can publish to directly once a human approves. */
export const PUBLISHABLE_PLATFORMS = ["instagram", "facebook"] as const
export type PublishablePlatform = (typeof PUBLISHABLE_PLATFORMS)[number]

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  meta_ads: "Meta Ads",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  google_ads: "Google Ads",
  search_console: "Google Search Console",
  n8n: "n8n",
}

/** Scope each platform needs to publish. Other missing scopes (insights) don't block publishing. */
const PUBLISH_SCOPES: Record<PublishablePlatform, string> = {
  instagram: "instagram_content_publish",
  facebook: "pages_manage_posts",
}

export function isPublishablePlatform(value: string): value is PublishablePlatform {
  return (PUBLISHABLE_PLATFORMS as readonly string[]).includes(value)
}

/**
 * Maps free-text platform names from the planner ("Instagram", "IG", "FB page",
 * "Meta Ads") and stored provider ids ("meta" = Meta Ads in the database) to one
 * canonical provider id.
 */
export function canonicalProvider(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (!v) return null
  if (v === "meta" || v.includes("meta_ads") || v === "facebook_ads" || v === "instagram_ads") return "meta_ads"
  if (v === "ig" || v.startsWith("instagram")) return "instagram"
  if (v === "fb" || v.startsWith("facebook")) return "facebook"
  if (v.startsWith("youtube") || v === "yt") return "youtube"
  if (v.startsWith("linkedin")) return "linkedin"
  if (v.startsWith("tiktok")) return "tiktok"
  if (v.startsWith("google_ads") || v === "adwords") return "google_ads"
  if (v.includes("search_console")) return "search_console"
  if (v.startsWith("n8n")) return "n8n"
  return v
}

export function platformLabel(provider: string): string {
  return PLATFORM_LABELS[provider] ?? provider
}

export function isMcpAccount(account: Pick<ConnectedAccountView, "externalAccountId">): boolean {
  return account.externalAccountId.startsWith("mcp:")
}

export interface AccountReadiness {
  account: ConnectedAccountView
  provider: string
  /** True when Tangent can call the platform API with this account's stored token. */
  usable: boolean
  /** Why it can't be used, or a non-blocking warning. */
  issue: string | null
}

/** Whether one connected account can be used to publish, and why not. */
export function accountReadiness(account: ConnectedAccountView, now: Date = new Date()): AccountReadiness {
  const provider = canonicalProvider(account.provider) ?? account.provider
  if (isMcpAccount(account)) {
    return { account, provider, usable: false, issue: "Connected through an MCP server, which agents can't call yet. Connect it with OAuth or a direct token to publish." }
  }
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= now.getTime()) {
    return { account, provider, usable: false, issue: "The access token has expired. Reconnect this account on the Integrations page." }
  }
  switch (account.status) {
    case "active":
      return { account, provider, usable: true, issue: null }
    case "needs_reauth": {
      // OAuth saves accounts as needs_reauth when *any* requested scope is missing (often insights).
      // Publishing only needs the publish scope, so the account is still usable when that one was granted.
      const publishScope = isPublishablePlatform(provider) ? PUBLISH_SCOPES[provider] : null
      if (publishScope && account.scopes.includes(publishScope)) {
        return { account, provider, usable: true, issue: account.lastError }
      }
      return { account, provider, usable: false, issue: account.lastError ?? "Re-authorisation required on the Integrations page." }
    }
    case "revoked":
      return { account, provider, usable: false, issue: "Access was revoked. Reconnect on the Integrations page." }
    case "error":
      return { account, provider, usable: false, issue: account.lastError ?? "The connection reported an error." }
    default: {
      const unreachable: never = account.status
      throw new Error(`Unknown connection status ${String(unreachable)}`)
    }
  }
}

export interface PlatformConnection {
  provider: string
  label: string
  accounts: AccountReadiness[]
  /** First account Tangent can act through, if any. */
  usable: AccountReadiness | null
}

/** Groups the workspace's connected accounts by canonical platform. */
export function summarizeConnections(accounts: ConnectedAccountView[], now: Date = new Date()): PlatformConnection[] {
  const byProvider = new Map<string, AccountReadiness[]>()
  for (const account of accounts) {
    const readiness = accountReadiness(account, now)
    byProvider.set(readiness.provider, [...(byProvider.get(readiness.provider) ?? []), readiness])
  }
  return [...byProvider.entries()].map(([provider, list]) => ({
    provider,
    label: platformLabel(provider),
    accounts: list,
    usable: list.find((a) => a.usable) ?? null,
  }))
}

export function findPlatform(connections: PlatformConnection[], provider: string): PlatformConnection | null {
  return connections.find((c) => c.provider === provider) ?? null
}

/** Model-ready description of what is connected. Never includes tokens. */
export function connectionsContextText(connections: PlatformConnection[]): string {
  const lines = connections.map((c) => {
    const accounts = c.accounts
      .map((a) => `${a.account.displayName} (${a.usable ? "ready" : "not usable"}${a.issue ? `: ${a.issue}` : ""})`)
      .join("; ")
    const capability = isPublishablePlatform(c.provider)
      ? c.usable
        ? "Tangent can publish here after the user approves the post in the app."
        : "Connected, but Tangent cannot publish until this is fixed."
      : "Connected; Tangent cannot act on this platform automatically yet."
    return `- ${c.label}: ${accounts}. ${capability}`
  })
  return [
    "These are the live connection records for this workspace (from the Integrations page).",
    lines.length ? lines.join("\n") : "- No platforms are connected yet.",
    `Platforms Tangent can publish to after approval: ${PUBLISHABLE_PLATFORMS.map(platformLabel).join(", ")}.`,
  ].join("\n")
}
