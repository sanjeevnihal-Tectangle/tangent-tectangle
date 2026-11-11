"use server"

import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ConnectedAccountView } from "@/lib/domain/social"
import { resetServerEnvCache, serverEnv } from "@/lib/env/server"
import { encryptToken } from "@/lib/integrations/crypto"
import { getAdapter, IntegrationError } from "@/lib/integrations/gateway"
import { INTEGRATION_GUIDES } from "@/lib/integrations/guides"
import { invalidateWorkspaceCache, resolveWorkspace } from "@/lib/workspace/server"

export type IntegrationActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

const ALLOWED_ENV_KEYS = new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "N8N_BASE_URL",
  "N8N_API_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
])

function upsertEnvVarsOnDisk(updates: Record<string, string>): void {
  const envPath = join(process.cwd(), ".env")
  let lines: string[] = []
  try {
    if (existsSync(envPath)) {
      lines = readFileSync(envPath, "utf8").split(/\r?\n/)
    }
  } catch {
    lines = []
  }

  for (const [key, rawValue] of Object.entries(updates)) {
    if (!ALLOWED_ENV_KEYS.has(key)) continue
    const cleanValue = rawValue.replace(/[\r\n]/g, "").trim()
    if (!cleanValue) continue

    process.env[key] = cleanValue
    const prefix = `${key}=`
    const existingIdx = lines.findIndex((line) => line.trim().startsWith(prefix))
    if (existingIdx >= 0) {
      lines[existingIdx] = `${key}=${cleanValue}`
    } else {
      lines.push(`${key}=${cleanValue}`)
    }
  }

  resetServerEnvCache()

  try {
    writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8")
  } catch {
    // In read-only serverless environments, process.env update remains active in memory.
  }
}

function getOrCreateEncryptionKey(): string {
  const current = serverEnv().INTEGRATION_ENCRYPTION_KEY
  if (current && Buffer.from(current, "base64").byteLength === 32) {
    return current
  }
  const generated = randomBytes(32).toString("base64")
  upsertEnvVarsOnDisk({ INTEGRATION_ENCRYPTION_KEY: generated })
  return generated
}

function revalidateIntegrationPaths(slug: string): void {
  invalidateWorkspaceCache(undefined, slug)
  revalidatePath(`/w/${slug}/integrations`)
  revalidatePath(`/w/${slug}/social`)
  revalidatePath(`/w/${slug}/ads`)
  revalidatePath(`/w/${slug}/seo`)
  revalidatePath(`/w/${slug}/analytics`)
  revalidatePath(`/w/${slug}/planner`)
}

export async function ensureEncryptionKeyAction(
  workspaceSlug: string
): Promise<IntegrationActionResult<{ configured: boolean }>> {
  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("integrations.manage")) {
    return { ok: false, error: "Only workspace owners and admins can configure encryption keys." }
  }

  getOrCreateEncryptionKey()

  await repository.recordAudit({
    action: "integration.encryption_key_generated",
    entityType: "integration",
    entityId: "INTEGRATION_ENCRYPTION_KEY",
    summary: "Generated 32-byte AES-256-GCM integration encryption key",
    actor: { type: "user", id: context.user.id },
  })

  revalidateIntegrationPaths(context.workspace.slug)
  return { ok: true, data: { configured: true } }
}

const saveCredentialsSchema = z.object({
  providerId: z.string().min(1),
  values: z.record(z.string(), z.string()),
})

export async function saveIntegrationCredentials(
  workspaceSlug: string,
  input: z.input<typeof saveCredentialsSchema>
): Promise<IntegrationActionResult<{ savedKeys: string[] }>> {
  const parsed = saveCredentialsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid credential payload." }
  }

  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("integrations.manage")) {
    return { ok: false, error: "Your role cannot configure integration credentials." }
  }

  const guide = INTEGRATION_GUIDES[parsed.data.providerId]
  if (!guide) {
    return { ok: false, error: "Unknown integration provider." }
  }

  const updates: Record<string, string> = {}
  const savedKeys: string[] = []
  for (const field of guide.envFields) {
    const val = parsed.data.values[field.key]?.trim()
    if (val) {
      updates[field.key] = val
      savedKeys.push(field.key)
    }
  }

  if (savedKeys.length === 0) {
    return { ok: false, error: "Enter at least one credential value to save." }
  }

  // Ensure AES-256-GCM key is ready whenever OAuth credentials are configured
  getOrCreateEncryptionKey()
  upsertEnvVarsOnDisk(updates)

  await repository.recordAudit({
    action: "integration.credentials_configured",
    entityType: "integration_provider",
    entityId: parsed.data.providerId,
    summary: `Configured server credentials for ${parsed.data.providerId} (${savedKeys.join(", ")})`,
    actor: { type: "user", id: context.user.id },
    metadata: { providerId: parsed.data.providerId, keys: savedKeys },
  })

  revalidateIntegrationPaths(context.workspace.slug)
  return { ok: true, data: { savedKeys } }
}

const connectAccountSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().trim().min(2, "Enter an account or page name").max(160),
  externalAccountId: z.string().trim().min(2, "Enter the external account ID, handle or property URL").max(200),
  accessToken: z.string().trim().max(4000).optional(),
  verifyWithApi: z.boolean().optional(),
  dailySpendLimitInr: z.number().int().min(0).max(10_000_000).nullable().optional(),
  monthlySpendLimitInr: z.number().int().min(0).max(100_000_000).nullable().optional(),
})

export async function connectIntegrationAccount(
  workspaceSlug: string,
  input: z.input<typeof connectAccountSchema>
): Promise<IntegrationActionResult<ConnectedAccountView>> {
  const parsed = connectAccountSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the account details and try again.",
    }
  }

  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("integrations.manage")) {
    return { ok: false, error: "Your role cannot connect integration accounts." }
  }

  const {
    providerId,
    displayName,
    externalAccountId,
    accessToken,
    verifyWithApi,
    dailySpendLimitInr,
    monthlySpendLimitInr,
  } = parsed.data

  const guide = INTEGRATION_GUIDES[providerId]
  if (!guide || !guide.directConnect) {
    return { ok: false, error: "This provider does not use per-workspace account connections." }
  }

  let resolvedName = displayName
  let resolvedExternalId = externalAccountId
  const scopes = guide.requiredScopes

  if (verifyWithApi && accessToken) {
    try {
      const adapter = getAdapter(providerId)
      const discovered = await adapter.listAccounts({
        accessToken,
        refreshToken: null,
        expiresAt: null,
        scopes,
      })
      if (discovered.length > 0) {
        const match =
          discovered.find((a) => a.externalId === externalAccountId) ?? discovered[0]!
        resolvedExternalId = match.externalId
        resolvedName = match.displayName || displayName
      }
    } catch (error) {
      const message =
        error instanceof IntegrationError
          ? error.message
          : "Live token verification failed against the provider API."
      return { ok: false, error: message }
    }
  }

  let accessTokenCiphertext: string | null = null
  if (accessToken) {
    const encKey = getOrCreateEncryptionKey()
    accessTokenCiphertext = encryptToken(accessToken, encKey, 1)
  }

  const saved = await repository.saveConnectedAccount({
    provider: providerId,
    externalAccountId: resolvedExternalId,
    displayName: resolvedName,
    scopes,
    status: "active",
    tokenExpiresAt: null,
    lastError: null,
    accessTokenCiphertext,
    refreshTokenCiphertext: null,
    keyVersion: 1,
    dailySpendLimitInr: dailySpendLimitInr ?? null,
    monthlySpendLimitInr: monthlySpendLimitInr ?? null,
  })

  await repository.recordAudit({
    action: "integration.account_connected",
    entityType: "connected_account",
    entityId: saved.id,
    summary: `Connected ${providerId} account "${saved.displayName}" (${saved.externalAccountId})`,
    actor: { type: "user", id: context.user.id },
    metadata: {
      provider: providerId,
      externalAccountId: saved.externalAccountId,
      verifiedLive: Boolean(verifyWithApi && accessToken),
      hasEncryptedToken: Boolean(accessTokenCiphertext),
    },
  })

  revalidateIntegrationPaths(context.workspace.slug)
  return { ok: true, data: saved }
}

export async function disconnectIntegrationAccount(
  workspaceSlug: string,
  accountId: string
): Promise<IntegrationActionResult<{ id: string }>> {
  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("integrations.manage")) {
    return { ok: false, error: "Your role cannot disconnect integration accounts." }
  }

  await repository.disconnectConnectedAccount(accountId)

  await repository.recordAudit({
    action: "integration.account_disconnected",
    entityType: "connected_account",
    entityId: accountId,
    summary: `Disconnected integration account ${accountId}`,
    actor: { type: "user", id: context.user.id },
  })

  revalidateIntegrationPaths(context.workspace.slug)
  return { ok: true, data: { id: accountId } }
}

const connectMcpSchema = z.object({
  providerId: z.string().min(1),
  serverLabel: z.string().trim().min(2, "Enter a label for this MCP connection").max(160),
  transport: z.enum(["sse", "streamable_http", "stdio"]),
  endpointOrCommand: z
    .string()
    .trim()
    .min(3, "Enter the MCP Server URL (SSE / HTTP) or npx command")
    .max(500),
  authToken: z.string().trim().max(4000).optional(),
  verifyEndpoint: z.boolean().optional(),
  dailySpendLimitInr: z.number().int().min(0).max(10_000_000).nullable().optional(),
  monthlySpendLimitInr: z.number().int().min(0).max(100_000_000).nullable().optional(),
})

export async function connectMcpIntegration(
  workspaceSlug: string,
  input: z.input<typeof connectMcpSchema>
): Promise<IntegrationActionResult<ConnectedAccountView>> {
  const parsed = connectMcpSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the MCP server details and try again.",
    }
  }

  const { context, repository } = await resolveWorkspace(workspaceSlug)
  if (!context.permissions.includes("integrations.manage")) {
    return { ok: false, error: "Your role cannot configure MCP servers." }
  }

  const {
    providerId,
    serverLabel,
    transport,
    endpointOrCommand,
    authToken,
    verifyEndpoint,
    dailySpendLimitInr,
    monthlySpendLimitInr,
  } = parsed.data

  const guide = INTEGRATION_GUIDES[providerId]
  if (!guide) {
    return { ok: false, error: "Unknown integration provider." }
  }

  if (transport !== "stdio") {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(endpointOrCommand)
    } catch {
      return {
        ok: false,
        error: "Enter a valid https:// or http:// URL for Remote SSE / Streamable HTTP transport.",
      }
    }

    if (verifyEndpoint) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4500)
      try {
        const headers: Record<string, string> = {
          Accept: "text/event-stream, application/json",
        }
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`
        }
        const res = await fetch(parsedUrl.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        })
        if (res.status >= 500) {
          return {
            ok: false,
            error: `MCP server responded with HTTP ${res.status}. Verify the server is running.`,
          }
        }
      } catch {
        return {
          ok: false,
          error: `Could not reach MCP endpoint (${parsedUrl.origin}). Check that the server is running or uncheck live ping verification.`,
        }
      } finally {
        clearTimeout(timer)
      }
    }
  }

  let accessTokenCiphertext: string | null = null
  if (authToken) {
    const encKey = getOrCreateEncryptionKey()
    accessTokenCiphertext = encryptToken(authToken, encKey, 1)
  }

  const externalId = `mcp:${transport}:${endpointOrCommand}`
  const scopes = [`mcp:${transport}`, ...guide.mcp.availableTools]

  const saved = await repository.saveConnectedAccount({
    provider: providerId,
    externalAccountId: externalId,
    displayName: `${serverLabel} (MCP)`,
    scopes,
    status: "active",
    tokenExpiresAt: null,
    lastError: null,
    accessTokenCiphertext,
    refreshTokenCiphertext: null,
    keyVersion: 1,
    dailySpendLimitInr: guide.directConnect?.isAdAccount
      ? (dailySpendLimitInr ?? 2500)
      : null,
    monthlySpendLimitInr: guide.directConnect?.isAdAccount
      ? (monthlySpendLimitInr ?? 50000)
      : null,
  })

  await repository.recordAudit({
    action: "integration.mcp_connected",
    entityType: "connected_account",
    entityId: saved.id,
    summary: `Connected ${providerId} via MCP (${transport}: ${endpointOrCommand})`,
    actor: { type: "user", id: context.user.id },
    metadata: {
      provider: providerId,
      transport,
      endpointOrCommand,
      toolsCount: guide.mcp.availableTools.length,
      hasEncryptedToken: Boolean(accessTokenCiphertext),
    },
  })

  revalidateIntegrationPaths(context.workspace.slug)
  return { ok: true, data: saved }
}


