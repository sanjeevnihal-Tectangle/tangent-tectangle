import "server-only"

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { AdAccountView } from "@/lib/domain/ads"
import type { ConnectedAccountView } from "@/lib/domain/social"

export interface StoredConnectedAccount extends ConnectedAccountView {
  organizationId: string
  accessTokenCiphertext: string | null
  refreshTokenCiphertext: string | null
  keyVersion: number
}

export interface StoredAdAccount extends AdAccountView {
  organizationId: string
}

interface LocalIntegrationStoreData {
  connectedAccounts: StoredConnectedAccount[]
  adAccounts: StoredAdAccount[]
}

const STORE_PATH = join(process.cwd(), ".tangent-integrations.json")

let memoryFallback: LocalIntegrationStoreData = {
  connectedAccounts: [],
  adAccounts: [],
}

function readStore(): LocalIntegrationStoreData {
  try {
    if (!existsSync(STORE_PATH)) return memoryFallback
    const raw = readFileSync(STORE_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<LocalIntegrationStoreData>
    return {
      connectedAccounts: Array.isArray(parsed.connectedAccounts)
        ? parsed.connectedAccounts
        : [],
      adAccounts: Array.isArray(parsed.adAccounts) ? parsed.adAccounts : [],
    }
  } catch {
    return memoryFallback
  }
}

function writeStore(data: LocalIntegrationStoreData): void {
  memoryFallback = data
  try {
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8")
  } catch {
    // Read-only filesystem fallback uses in-memory store.
  }
}

export function listLocalConnectedAccounts(organizationId: string): ConnectedAccountView[] {
  const store = readStore()
  return store.connectedAccounts
    .filter((a) => a.organizationId === organizationId)
    .map(({ organizationId: _org, accessTokenCiphertext: _at, refreshTokenCiphertext: _rt, keyVersion: _kv, ...view }) => view)
}

export function saveLocalConnectedAccount(
  organizationId: string,
  account: ConnectedAccountView,
  credentials?: {
    accessTokenCiphertext: string | null
    refreshTokenCiphertext: string | null
    keyVersion: number
  },
  adAccountLimits?: {
    dailySpendLimitInr: number | null
    monthlySpendLimitInr: number | null
  }
): ConnectedAccountView {
  const store = readStore()
  const existingIdx = store.connectedAccounts.findIndex(
    (a) =>
      a.organizationId === organizationId &&
      ((a.provider === account.provider && a.externalAccountId === account.externalAccountId) ||
        a.id === account.id)
  )

  const stored: StoredConnectedAccount = {
    ...account,
    id: existingIdx >= 0 ? store.connectedAccounts[existingIdx]!.id : account.id,
    organizationId,
    accessTokenCiphertext: credentials?.accessTokenCiphertext ?? null,
    refreshTokenCiphertext: credentials?.refreshTokenCiphertext ?? null,
    keyVersion: credentials?.keyVersion ?? 1,
  }

  if (existingIdx >= 0) {
    store.connectedAccounts[existingIdx] = stored
  } else {
    store.connectedAccounts.unshift(stored)
  }

  if (account.provider === "meta_ads" || account.provider === "meta" || account.provider === "google_ads") {
    const adProvider = account.provider === "meta" ? "meta_ads" : account.provider
    const existingAdIdx = store.adAccounts.findIndex(
      (ad) =>
        ad.organizationId === organizationId &&
        ad.provider === adProvider &&
        ad.externalAccountId === account.externalAccountId
    )
    const adEntry: StoredAdAccount = {
      id: existingAdIdx >= 0 ? store.adAccounts[existingAdIdx]!.id : `ad-${stored.id}`,
      organizationId,
      connectedAccountId: stored.id,
      provider: adProvider,
      externalAccountId: account.externalAccountId,
      name: account.displayName,
      currency: "INR",
      dailySpendLimitInr:
        adAccountLimits?.dailySpendLimitInr !== undefined
          ? adAccountLimits.dailySpendLimitInr
          : existingAdIdx >= 0
            ? store.adAccounts[existingAdIdx]!.dailySpendLimitInr
            : 2500,
      monthlySpendLimitInr:
        adAccountLimits?.monthlySpendLimitInr !== undefined
          ? adAccountLimits.monthlySpendLimitInr
          : existingAdIdx >= 0
            ? store.adAccounts[existingAdIdx]!.monthlySpendLimitInr
            : 50000,
      status: account.status === "active" ? "active" : "paused",
    }
    if (existingAdIdx >= 0) {
      store.adAccounts[existingAdIdx] = adEntry
    } else {
      store.adAccounts.push(adEntry)
    }
  }

  writeStore(store)
  const {
    organizationId: _org,
    accessTokenCiphertext: _at,
    refreshTokenCiphertext: _rt,
    keyVersion: _kv,
    ...view
  } = stored
  return view
}

export function removeLocalConnectedAccount(organizationId: string, accountId: string): void {
  const store = readStore()
  store.connectedAccounts = store.connectedAccounts.filter(
    (a) => !(a.organizationId === organizationId && a.id === accountId)
  )
  store.adAccounts = store.adAccounts.filter(
    (ad) => !(ad.organizationId === organizationId && ad.connectedAccountId === accountId)
  )
  writeStore(store)
}

export function listLocalAdAccounts(organizationId: string): AdAccountView[] {
  const store = readStore()
  return store.adAccounts
    .filter((ad) => ad.organizationId === organizationId)
    .map(({ organizationId: _org, ...view }) => view)
}

export function updateLocalAdAccountLimits(
  organizationId: string,
  adAccountId: string,
  limits: { dailySpendLimitInr: number | null; monthlySpendLimitInr: number | null }
): boolean {
  const store = readStore()
  const idx = store.adAccounts.findIndex(
    (ad) => ad.organizationId === organizationId && ad.id === adAccountId
  )
  if (idx < 0) return false
  store.adAccounts[idx] = {
    ...store.adAccounts[idx]!,
    dailySpendLimitInr: limits.dailySpendLimitInr,
    monthlySpendLimitInr: limits.monthlySpendLimitInr,
  }
  writeStore(store)
  return true
}

