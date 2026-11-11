import "server-only"

import { serverEnv, type ServerEnv } from "@/lib/env/server"
import {
  INTEGRATION_PROVIDERS,
  type IntegrationStatusView,
} from "@/lib/integrations/providers"

/**
 * Integration Gateway contract. Every external platform is implemented as an
 * adapter behind this interface; the core app never calls provider APIs
 * directly and never exposes tokens to the browser. Adapters ship with their
 * module phase (see docs/INTEGRATIONS.md).
 */
export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string[]
}

export interface ExternalAccount {
  externalId: string
  displayName: string
  kind: "page" | "instagram_business" | "channel" | "ad_account" | "property"
}

export interface ProviderAdapter {
  readonly id: string
  readonly requiredScopes: string[]
  authorizationUrl(input: { state: string; redirectUri: string }): string
  exchangeCode(input: { code: string; redirectUri: string }): Promise<OAuthTokens>
  refresh(refreshToken: string): Promise<OAuthTokens>
  listAccounts(tokens: OAuthTokens): Promise<ExternalAccount[]>
  /** Returns the scopes that are required but were not granted. */
  missingPermissions(tokens: OAuthTokens): Promise<string[]>
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "permission_denied" | "rate_limited" | "token_expired" | "provider_error"
  ) {
    super(message)
    this.name = "IntegrationError"
  }
}

import { BUILTIN_ADAPTERS } from "@/lib/integrations/adapters"

/** Registered OAuth adapters for social, search and advertising platforms. */
const ADAPTERS: Record<string, ProviderAdapter> = BUILTIN_ADAPTERS

export function getAdapter(providerId: string): ProviderAdapter {
  const adapter = ADAPTERS[providerId]
  if (!adapter) {
    throw new IntegrationError(`The ${providerId} connector is not available yet`, "not_configured")
  }
  return adapter
}

/** Computes honest integration status from server configuration. */
export function integrationStatuses(): IntegrationStatusView[] {
  const env = serverEnv()
  return INTEGRATION_PROVIDERS.map((provider) => {
    const missingEnvVars = provider.envVars.filter((name) => !env[name as keyof ServerEnv])
    const hasCredentials = missingEnvVars.length === 0
    const adapterLive = provider.serverOnly || provider.id in ADAPTERS
    return {
      ...provider,
      missingEnvVars,
      status: !hasCredentials ? "not_configured" : adapterLive ? "credentials_set" : "awaiting_connector",
    }
  })
}
