import "server-only"

import {
  IntegrationError,
  type ExternalAccount,
  type OAuthTokens,
  type ProviderAdapter,
} from "@/lib/integrations/gateway"
import { serverEnv } from "@/lib/env/server"

export const MSG91_SCOPES = ["sms.send", "sms.dlt"] as const

const FLOW_URL = "https://control.msg91.com/api/v5/flow/"
const SENDSMS_URL = "https://api.msg91.com/api/v2/sendsms"
const BALANCE_URL = "https://control.msg91.com/api/v5/balance/"

export function resolveMsg91AuthKey(accountToken: string | null): string {
  if (accountToken?.trim()) return accountToken.trim()
  const envKey = serverEnv().MSG91_AUTH_KEY
  if (envKey) return envKey
  throw new IntegrationError(
    "MSG91 auth key missing. Connect MSG91 under Integrations or set MSG91_AUTH_KEY.",
    "not_configured"
  )
}

export function resolveMsg91SenderId(accountExternalId: string, templateSenderId?: string): string {
  const fromTemplate = templateSenderId?.trim()
  if (fromTemplate) return fromTemplate
  if (accountExternalId.trim()) return accountExternalId.trim()
  const envSender = serverEnv().MSG91_SENDER_ID
  if (envSender) return envSender
  throw new IntegrationError(
    "MSG91 sender ID missing. Set it on the connected account (external id) or MSG91_SENDER_ID.",
    "not_configured"
  )
}

/** India DLT Flow API — preferred for marketing SMS. */
export async function sendMsg91FlowSms(input: {
  authKey: string
  dltTemplateId: string
  toE164: string
  /** VAR1, VAR2… values in order */
  variables: string[]
}): Promise<{ messageId: string }> {
  const mobiles = input.toE164.replace(/\D/g, "")
  if (!mobiles) {
    throw new IntegrationError("SMS recipient phone is empty", "provider_error")
  }

  const recipient: Record<string, string> = { mobiles }
  input.variables.forEach((value, index) => {
    recipient[`VAR${index + 1}`] = value
  })

  const res = await fetch(FLOW_URL, {
    method: "POST",
    headers: {
      authkey: input.authKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      template_id: input.dltTemplateId,
      short_url: "0",
      recipients: [recipient],
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    type?: string
    message?: string | string[]
    request_id?: string
  }

  if (!res.ok || body.type === "error") {
    const detail = Array.isArray(body.message) ? body.message.join("; ") : body.message
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(`MSG91 auth failed${detail ? `: ${detail}` : ""}`, "permission_denied")
    }
    throw new IntegrationError(
      `MSG91 Flow send failed (${res.status})${detail ? `: ${detail}` : ""}`,
      "provider_error"
    )
  }

  const messageId =
    body.request_id ??
    (typeof body.message === "string" ? body.message : null) ??
    `msg91-flow-${Date.now()}`
  return { messageId }
}

/** Free-form SMS (testing / non-DLT). Prefer Flow for India marketing. */
export async function sendMsg91PlainSms(input: {
  authKey: string
  senderId: string
  toE164: string
  message: string
}): Promise<{ messageId: string }> {
  const mobiles = input.toE164.replace(/\D/g, "")
  if (!mobiles) {
    throw new IntegrationError("SMS recipient phone is empty", "provider_error")
  }

  const res = await fetch(SENDSMS_URL, {
    method: "POST",
    headers: {
      authkey: input.authKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: input.senderId,
      route: "4",
      country: "91",
      sms: [{ message: input.message, to: [mobiles] }],
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    type?: string
    message?: string
    request_id?: string
  }

  if (!res.ok || body.type === "error") {
    throw new IntegrationError(
      `MSG91 SMS send failed (${res.status})${body.message ? `: ${body.message}` : ""}`,
      res.status === 401 || res.status === 403 ? "permission_denied" : "provider_error"
    )
  }

  return { messageId: body.request_id ?? body.message ?? `msg91-${Date.now()}` }
}

async function verifyMsg91AuthKey(authKey: string, senderId: string): Promise<ExternalAccount[]> {
  const url = new URL(BALANCE_URL)
  url.searchParams.set("country_code", "91")
  const res = await fetch(url, {
    headers: { authkey: authKey, Accept: "application/json" },
  })
  if (!res.ok) {
    throw new IntegrationError(
      `MSG91 key verification failed (${res.status})`,
      res.status === 401 || res.status === 403 ? "permission_denied" : "provider_error"
    )
  }
  return [
    {
      externalId: senderId || "MSG91",
      displayName: senderId ? `MSG91 · ${senderId}` : "MSG91 SMS",
      kind: "channel",
    },
  ]
}

export function createMsg91Adapter(): ProviderAdapter {
  const requiredScopes = [...MSG91_SCOPES]
  return {
    id: "msg91",
    requiredScopes,
    authorizationUrl() {
      throw new IntegrationError("MSG91 uses Direct Connect with an Authkey — OAuth is not available.", "not_configured")
    },
    async exchangeCode() {
      throw new IntegrationError("MSG91 uses Direct Connect with an Authkey — OAuth is not available.", "not_configured")
    },
    async refresh() {
      throw new IntegrationError("MSG91 Authkeys do not refresh via OAuth.", "not_configured")
    },
    async listAccounts(tokens: OAuthTokens) {
      const senderHint = tokens.scopes.find((s) => s.startsWith("sender:"))?.slice(7) ?? "TANGNT"
      return verifyMsg91AuthKey(tokens.accessToken, senderHint)
    },
    async missingPermissions(tokens) {
      return requiredScopes.filter((scope) => !tokens.scopes.includes(scope))
    },
  }
}
