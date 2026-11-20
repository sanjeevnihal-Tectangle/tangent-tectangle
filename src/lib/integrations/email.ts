import "server-only"

import {
  IntegrationError,
  type ExternalAccount,
  type OAuthTokens,
  type ProviderAdapter,
} from "@/lib/integrations/gateway"
import { serverEnv } from "@/lib/env/server"

export const RESEND_SCOPES = ["email.send"] as const

const RESEND_API = "https://api.resend.com"

export function resolveResendApiKey(accountToken: string | null): string {
  if (accountToken?.trim()) return accountToken.trim()
  const envKey = serverEnv().RESEND_API_KEY
  if (envKey) return envKey
  throw new IntegrationError(
    "Resend API key missing. Connect Resend under Integrations or set RESEND_API_KEY.",
    "not_configured"
  )
}

export function resolveResendFrom(accountExternalId: string, templateFrom?: string): string {
  const fromTemplate = templateFrom?.trim()
  if (fromTemplate) return fromTemplate
  if (accountExternalId.trim() && accountExternalId.includes("@")) return accountExternalId.trim()
  const envFrom = serverEnv().RESEND_FROM_EMAIL
  if (envFrom) return envFrom
  throw new IntegrationError(
    "Email From address missing. Set it on the connected account or RESEND_FROM_EMAIL.",
    "not_configured"
  )
}

export async function sendResendEmail(input: {
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
}): Promise<{ messageId: string }> {
  const to = input.to.trim()
  if (!to || !to.includes("@")) {
    throw new IntegrationError("Email recipient is missing or invalid", "provider_error")
  }

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [to],
      subject: input.subject,
      text: input.text,
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    id?: string
    message?: string
    name?: string
  }

  if (!res.ok) {
    throw new IntegrationError(
      `Resend send failed (${res.status})${body.message ? `: ${body.message}` : ""}`,
      res.status === 401 || res.status === 403 ? "permission_denied" : "provider_error"
    )
  }

  if (!body.id) {
    throw new IntegrationError("Resend did not return a message id", "provider_error")
  }
  return { messageId: body.id }
}

async function verifyResendApiKey(apiKey: string, fromAddress: string): Promise<ExternalAccount[]> {
  const res = await fetch(`${RESEND_API}/domains`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  })
  if (!res.ok) {
    throw new IntegrationError(
      `Resend key verification failed (${res.status})`,
      res.status === 401 || res.status === 403 ? "permission_denied" : "provider_error"
    )
  }
  return [
    {
      externalId: fromAddress || "resend",
      displayName: fromAddress ? `Resend · ${fromAddress}` : "Resend Email",
      kind: "channel",
    },
  ]
}

export function createResendAdapter(): ProviderAdapter {
  const requiredScopes = [...RESEND_SCOPES]
  return {
    id: "resend",
    requiredScopes,
    authorizationUrl() {
      throw new IntegrationError("Resend uses Direct Connect with an API key — OAuth is not available.", "not_configured")
    },
    async exchangeCode() {
      throw new IntegrationError("Resend uses Direct Connect with an API key — OAuth is not available.", "not_configured")
    },
    async refresh() {
      throw new IntegrationError("Resend API keys do not refresh via OAuth.", "not_configured")
    },
    async listAccounts(tokens: OAuthTokens) {
      const fromHint = tokens.scopes.find((s) => s.startsWith("from:"))?.slice(5) ?? "onboarding@resend.dev"
      return verifyResendApiKey(tokens.accessToken, fromHint)
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}
