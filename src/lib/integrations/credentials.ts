import "server-only"

import { decryptToken } from "@/lib/integrations/crypto"
import { loadCredentialCiphertext } from "@/lib/integrations/credential-store"
import { serverEnv } from "@/lib/env/server"

/**
 * Decrypts the access token for a connected account.
 * Loads ciphertext via SECURITY DEFINER RPC (or local fallback), never from the browser.
 */
export async function loadAccessToken(input: {
  organizationId: string
  connectedAccountId: string
}): Promise<string | null> {
  const env = serverEnv()
  if (!env.INTEGRATION_ENCRYPTION_KEY) return null

  const ciphertext = await loadCredentialCiphertext(input)
  if (!ciphertext) return null
  return decryptToken(ciphertext, env.INTEGRATION_ENCRYPTION_KEY).plaintext
}
