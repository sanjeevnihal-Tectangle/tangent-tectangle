import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import { getAdapter, IntegrationError } from "@/lib/integrations/gateway"
import { signOAuthState } from "@/lib/integrations/oauth-state"
import { workspaceHref } from "@/lib/navigation"
import { resolveWorkspace } from "@/lib/workspace/server"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params
  const orgSlug = request.nextUrl.searchParams.get("workspace") ?? "demo"
  const integrationsUrl = new URL(workspaceHref(orgSlug, "integrations"), publicEnv.NEXT_PUBLIC_APP_URL)

  try {
    const { context: ws } = await resolveWorkspace(orgSlug)
    if (!ws.permissions.includes("integrations.manage")) {
      integrationsUrl.searchParams.set("error", "Your role cannot manage integrations.")
      return NextResponse.redirect(integrationsUrl)
    }

    const env = serverEnv()
    if (!env.INTEGRATION_ENCRYPTION_KEY) {
      integrationsUrl.searchParams.set(
        "error",
        "INTEGRATION_ENCRYPTION_KEY is not configured. Add a 32-byte base64 key in .env.local before connecting OAuth accounts."
      )
      return NextResponse.redirect(integrationsUrl)
    }

    const adapter = getAdapter(provider)
    const redirectUri = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/integrations/${provider}/callback`
    const state = signOAuthState(
      {
        organizationId: ws.workspace.id,
        orgSlug: ws.workspace.slug,
        userId: ws.user.id,
        providerId: provider,
        issuedAt: Date.now(),
        nonce: randomBytes(12).toString("base64url"),
      },
      env.INTEGRATION_ENCRYPTION_KEY
    )

    const authUrl = adapter.authorizationUrl({ state, redirectUri })
    return NextResponse.redirect(authUrl)
  } catch (error) {
    const message =
      error instanceof IntegrationError
        ? error.message
        : "Could not start the OAuth flow."
    integrationsUrl.searchParams.set("error", message)
    return NextResponse.redirect(integrationsUrl)
  }
}

