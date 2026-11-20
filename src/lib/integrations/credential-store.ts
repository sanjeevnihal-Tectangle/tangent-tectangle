import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import {
  getLocalCredentialCiphertext,
  saveLocalConnectedAccount,
} from "@/lib/integrations/local-store"
import type { ConnectedAccountView } from "@/lib/domain/social"

function adminClient(): SupabaseClient | null {
  const env = serverEnv()
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Persist encrypted tokens via public RPC (works without exposing `private` schema). */
export async function storeCredentialCiphertext(input: {
  connectedAccountId: string
  accessTokenCiphertext: string
  refreshTokenCiphertext?: string | null
  keyVersion?: number
  /** Always dual-written locally so sync works even if Supabase private schema is not exposed. */
  localAccount?: ConnectedAccountView & { organizationId: string }
}): Promise<{ stored: "rpc" | "local" | "both" }> {
  let rpcOk = false
  const admin = adminClient()
  if (admin) {
    const { error } = await admin.rpc("store_integration_credential", {
      p_connected_account_id: input.connectedAccountId,
      p_access_token_ciphertext: input.accessTokenCiphertext,
      p_refresh_token_ciphertext: input.refreshTokenCiphertext ?? null,
      p_key_version: input.keyVersion ?? 1,
    })
    if (!error) {
      rpcOk = true
    } else {
      console.error("[tangent] store_integration_credential RPC failed", error.message)
    }
  }

  if (input.localAccount) {
    saveLocalConnectedAccount(
      input.localAccount.organizationId,
      { ...input.localAccount, id: input.connectedAccountId },
      {
        accessTokenCiphertext: input.accessTokenCiphertext,
        refreshTokenCiphertext: input.refreshTokenCiphertext ?? null,
        keyVersion: input.keyVersion ?? 1,
      }
    )
    return { stored: rpcOk ? "both" : "local" }
  }

  if (rpcOk) return { stored: "rpc" }

  throw new Error(
    "Could not store encrypted credentials. Run supabase/migrations/20261119000400_integration_credential_rpcs.sql in the Supabase SQL Editor, then reconnect with your System User token."
  )
}

export async function loadCredentialCiphertext(input: {
  organizationId: string
  connectedAccountId: string
}): Promise<string | null> {
  const admin = adminClient()
  if (admin) {
    const { data, error } = await admin.rpc("get_integration_credential", {
      p_connected_account_id: input.connectedAccountId,
    })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      const ciphertext =
        row && typeof row === "object" && "access_token_ciphertext" in row
          ? (row as { access_token_ciphertext?: string }).access_token_ciphertext
          : null
      if (ciphertext) return ciphertext
    } else if (error.code !== "PGRST202") {
      // PGRST202 = function not found yet; fall through to local.
      console.error("[tangent] get_integration_credential RPC failed", error.message)
    }
  }

  return getLocalCredentialCiphertext(input.organizationId, input.connectedAccountId)
}
