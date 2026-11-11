import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export class CredentialCryptoError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "provider_error"
  ) {
    super(message)
    this.name = "CredentialCryptoError"
  }
}

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function parseKey(base64Key: string | undefined): Buffer {
  if (!base64Key) {
    throw new CredentialCryptoError("INTEGRATION_ENCRYPTION_KEY is not configured on the server", "not_configured")
  }
  const key = Buffer.from(base64Key, "base64")
  if (key.byteLength !== 32) {
    throw new CredentialCryptoError("INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64-encoded key", "not_configured")
  }
  return key
}

/**
 * Encrypts an OAuth token with AES-256-GCM before storing in
 * `private.integration_credentials`. Format: `v<keyVersion>:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 */
export function encryptToken(plaintext: string, base64Key: string | undefined, keyVersion = 1): string {
  const key = parseKey(base64Key)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${keyVersion}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

/** Decrypts an AES-256-GCM token produced by `encryptToken`. */
export function decryptToken(payload: string, base64Key: string | undefined): { plaintext: string; keyVersion: number } {
  const key = parseKey(base64Key)
  const parts = payload.split(":")
  if (parts.length !== 4 || !parts[0]?.startsWith("v")) {
    throw new CredentialCryptoError("Malformed encrypted credential payload", "provider_error")
  }
  const keyVersion = Number(parts[0].slice(1))
  const iv = Buffer.from(parts[1]!, "base64")
  const tag = Buffer.from(parts[2]!, "base64")
  const ciphertext = Buffer.from(parts[3]!, "base64")
  if (iv.byteLength !== IV_LENGTH || tag.byteLength !== AUTH_TAG_LENGTH) {
    throw new CredentialCryptoError("Invalid IV or auth tag in encrypted credential", "provider_error")
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return { plaintext: decrypted.toString("utf8"), keyVersion }
  } catch {
    throw new CredentialCryptoError("Failed to authenticate or decrypt credential", "provider_error")
  }
}
