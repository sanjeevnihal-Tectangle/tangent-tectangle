import { NextResponse, type NextRequest } from "next/server"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import { encryptToken } from "@/lib/integrations/crypto"
import { getAdapter, IntegrationError } from "@/lib/integrations/gateway"
import { verifyOAuthState } from "@/lib/integrations/oauth-state"
import { workspaceHref } from "@/lib/navigation"
import { invalidateWorkspaceCache, resolveWorkspace } from "@/lib/workspace/server"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params
  const code = request.nextUrl.searchParams.get("code")
  const stateParam = request.nextUrl.searchParams.get("state")
  const providerError = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error")

  const env = serverEnv()
  const verified =
    stateParam && env.INTEGRATION_ENCRYPTION_KEY
      ? verifyOAuthState(stateParam, env.INTEGRATION_ENCRYPTION_KEY)
      : null

  const orgSlug = verified?.orgSlug ?? "demo"
  const integrationsUrl = new URL(workspaceHref(orgSlug, "integrations"), publicEnv.NEXT_PUBLIC_APP_URL)

  if (providerError) {
    integrationsUrl.searchParams.set("error", `Authorisation was cancelled or denied: ${providerError}`)
    return NextResponse.redirect(integrationsUrl)
  }

  if (!verified || verified.providerId !== provider || !code || !env.INTEGRATION_ENCRYPTION_KEY) {
    integrationsUrl.searchParams.set("error", "Invalid or expired OAuth state. Please try connecting again.")
    return NextResponse.redirect(integrationsUrl)
  }

  try {
    const { context: ws, repository } = await resolveWorkspace(verified.orgSlug)
    if (ws.user.id !== verified.userId || !ws.permissions.includes("integrations.manage")) {
      integrationsUrl.searchParams.set("error", "Session mismatch or insufficient permissions.")
      return NextResponse.redirect(integrationsUrl)
    }

    const adapter = getAdapter(provider)
    const redirectUri = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/integrations/${provider}/callback`
    const tokens = await adapter.exchangeCode({ code, redirectUri })
    const missing = await adapter.missingPermissions(tokens)
    const accounts = await adapter.listAccounts(tokens)

    if (accounts.length === 0) {
      integrationsUrl.searchParams.set("error", `No eligible ${provider} accounts were found for this login.`)
      return NextResponse.redirect(integrationsUrl)
    }

    const accessCiphertext = encryptToken(tokens.accessToken, env.INTEGRATION_ENCRYPTION_KEY, 1)
    const refreshCiphertext = tokens.refreshToken
      ? encryptToken(tokens.refreshToken, env.INTEGRATION_ENCRYPTION_KEY, 1)
      : null

    for (const account of accounts) {
      await repository.saveConnectedAccount({
        provider,
        externalAccountId: account.externalId,
        displayName: account.displayName,
        scopes: tokens.scopes,
        status: missing.length > 0 ? "needs_reauth" : "active",
        tokenExpiresAt: tokens.expiresAt ? tokens.expiresAt.toISOString() : null,
        lastError: missing.length > 0 ? `Missing scopes: ${missing.join(", ")}` : null,
        accessTokenCiphertext: accessCiphertext,
        refreshTokenCiphertext: refreshCiphertext,
        keyVersion: 1,
      })
    }

    await repository.recordAudit({
      action: "integration.connected",
      entityType: "connected_account",
      entityId: accounts[0]?.externalId ?? null,
      summary: `Connected ${accounts.length} ${provider} account(s)`,
      actor: { type: "user", id: ws.user.id },
      metadata: { provider, missingScopes: missing },
    })

    invalidateWorkspaceCache(ws.user.id, verified.orgSlug)
    integrationsUrl.searchParams.set("connected", provider)
    return NextResponse.redirect(integrationsUrl)
  } catch (error) {
    const message =
      error instanceof IntegrationError
        ? error.message
        : "Could not complete OAuth account connection."
    integrationsUrl.searchParams.set("error", message)
    return NextResponse.redirect(integrationsUrl)
  }
}

