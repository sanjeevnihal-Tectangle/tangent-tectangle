import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

const STATE_TTL_MS = 10 * 60 * 1000

const oauthStateSchema = z.object({
  organizationId: z.string().min(1),
  orgSlug: z.string().min(1),
  userId: z.string().min(1),
  providerId: z.string().min(1),
  issuedAt: z.number().int(),
  nonce: z.string().min(8),
})

export type OAuthStatePayload = z.infer<typeof oauthStateSchema>

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

/** Signs an OAuth state parameter bound to the workspace, user and provider. */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const signature = sign(encoded, secret)
  return `${encoded}.${signature}`
}

/** Verifies an OAuth state parameter and checks its 10-minute expiration window. */
export function verifyOAuthState(token: string, secret: string, nowMs = Date.now()): OAuthStatePayload | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [encoded, signature] = parts as [string, string]
  const expected = sign(encoded, secret)
  const sigBuf = Buffer.from(signature, "utf8")
  const expBuf = Buffer.from(expected, "utf8")
  if (sigBuf.byteLength !== expBuf.byteLength || !timingSafeEqual(sigBuf, expBuf)) {
    return null
  }
  try {
    const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown
    const parsed = oauthStateSchema.safeParse(raw)
    if (!parsed.success) return null
    if (nowMs - parsed.data.issuedAt > STATE_TTL_MS || parsed.data.issuedAt > nowMs + 60_000) {
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}
