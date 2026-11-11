import "server-only"

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { hashPayload, transition, type ApprovalRequest } from "@/lib/approvals/engine"
import type { AgentRunLog, AuditEntry, AuditRecord, WorkspaceRepository } from "@/lib/data/types"
import { decisionToStatus, type ApprovalView } from "@/lib/domain/approvals"
import type { BrandProfile } from "@/lib/domain/brand"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"
import type { Campaign } from "@/lib/domain/campaigns"
import type { ContentItem } from "@/lib/domain/content"
import type { Conversation } from "@/lib/domain/conversations"
import type { CreativeProject } from "@/lib/domain/creative"
import { DEMO_APPROVALS, DEMO_CONVERSATIONS } from "@/lib/demo/seed-ai"
import { DEMO_MEMBERS } from "@/lib/demo/workspace"
import {
  DEMO_BRAND_PROFILES,
  DEMO_BUSINESS_PROFILE,
  DEMO_INTELLIGENCE,
} from "@/lib/demo/seed-business"
import {
  listLocalAdAccounts,
  listLocalConnectedAccounts,
  removeLocalConnectedAccount,
  saveLocalConnectedAccount,
  updateLocalAdAccountLimits,
} from "@/lib/integrations/local-store"

type StoredApproval = ApprovalView & { payload: Record<string, unknown>; payloadHash: string }

interface DemoStoreData {
  version: 1
  businessProfile: BusinessProfile | null
  intelligence: MarketingIntelligence | null
  brandProfiles: BrandProfile[]
  conversations: Conversation[]
  approvals: StoredApproval[]
  campaigns?: Campaign[]
  audit: AuditRecord[]
  runs?: AgentRunLog[]
  creativeProjects?: CreativeProject[]
  contentItems?: ContentItem[]
  usage: { key: string; quantity: number; at: string }[]
}

const STORE_FILE = path.join(process.cwd(), ".tangent-demo", "store.json")

let memory: DemoStoreData | null = null
let persistence: "demo-file" | "demo-memory" = "demo-file"
let queue: Promise<unknown> = Promise.resolve()

async function seed(): Promise<DemoStoreData> {
  const approvals = await Promise.all(
    DEMO_APPROVALS.map(async (approval) => ({
      ...approval,
      payloadHash: await hashPayload(approval.payload),
    }))
  )
  return {
    version: 1,
    businessProfile: structuredClone(DEMO_BUSINESS_PROFILE),
    intelligence: structuredClone(DEMO_INTELLIGENCE),
    brandProfiles: structuredClone(DEMO_BRAND_PROFILES),
    conversations: structuredClone(DEMO_CONVERSATIONS),
    approvals,
    audit: [],
    usage: [],
  }
}

async function load(): Promise<DemoStoreData> {
  if (memory) return memory
  try {
    memory = JSON.parse(await readFile(STORE_FILE, "utf8")) as DemoStoreData
  } catch {
    memory = await seed()
  }
  return memory
}

async function persist(data: DemoStoreData): Promise<void> {
  memory = data
  if (persistence === "demo-memory") return
  try {
    await mkdir(path.dirname(STORE_FILE), { recursive: true })
    const temp = `${STORE_FILE}.tmp`
    await writeFile(temp, JSON.stringify(data, null, 2), "utf8")
    await rename(temp, STORE_FILE)
  } catch (error) {
    // Read-only filesystems (e.g. serverless): keep demo edits in memory only.
    persistence = "demo-memory"
    console.warn("[tangent] demo store is in-memory only:", error)
  }
}

/** Serialises read-modify-write operations on the demo store. */
function mutate<T>(fn: (data: DemoStoreData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await load()
    const result = await fn(data)
    await persist(data)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

function toView({ payload: _payload, payloadHash: _hash, ...view }: StoredApproval): ApprovalView {
  return view
}

export function createDemoRepository(): WorkspaceRepository {
  return {
    get persistence() {
      return persistence
    },

    async getBusinessProfile() {
      return (await load()).businessProfile
    },
    async saveBusinessProfile(profile) {
      await mutate((data) => {
        data.businessProfile = profile
      })
    },
    async getIntelligence() {
      return (await load()).intelligence
    },
    async saveIntelligence(intelligence) {
      await mutate((data) => {
        data.intelligence = intelligence
      })
    },

    async listBrandProfiles() {
      return (await load()).brandProfiles
    },
    async saveBrandProfile(profile) {
      return mutate((data) => {
        const saved = { ...profile, updatedAt: new Date().toISOString() }
        if (saved.isDefault) {
          data.brandProfiles = data.brandProfiles.map((p) => ({ ...p, isDefault: false }))
        }
        const index = data.brandProfiles.findIndex((p) => p.id === saved.id)
        if (index >= 0) data.brandProfiles[index] = saved
        else data.brandProfiles.push(saved)
        if (!data.brandProfiles.some((p) => p.isDefault) && data.brandProfiles[0]) {
          data.brandProfiles[0].isDefault = true
        }
        return saved
      })
    },
    async deleteBrandProfile(id) {
      await mutate((data) => {
        data.brandProfiles = data.brandProfiles.filter((p) => p.id !== id)
        if (!data.brandProfiles.some((p) => p.isDefault) && data.brandProfiles[0]) {
          data.brandProfiles[0].isDefault = true
        }
      })
    },

    async listConversations() {
      const { conversations } = await load()
      return conversations
        .map(({ messages: _messages, ...summary }) => summary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async getConversation(id) {
      return (await load()).conversations.find((c) => c.id === id) ?? null
    },
    async createConversation(title) {
      return mutate((data) => {
        const conversation: Conversation = {
          id: crypto.randomUUID(),
          title,
          updatedAt: new Date().toISOString(),
          isSample: false,
          messages: [],
        }
        data.conversations.push(conversation)
        const { messages: _messages, ...summary } = conversation
        return summary
      })
    },
    async appendMessage(conversationId, message) {
      await mutate((data) => {
        const conversation = data.conversations.find((c) => c.id === conversationId)
        if (!conversation) throw new Error("Conversation not found")
        conversation.messages.push(message)
        conversation.updatedAt = message.createdAt
      })
    },

    async listApprovals() {
      return (await load()).approvals.filter((a) => a.status !== "superseded").map(toView)
    },
    async createApprovalRequest(input) {
      return mutate(async (data) => {
        let version = 1
        if (input.previousVersionId) {
          const prevIndex = data.approvals.findIndex((a) => a.id === input.previousVersionId)
          if (prevIndex >= 0 && data.approvals[prevIndex]) {
            version = data.approvals[prevIndex].version + 1
            data.approvals[prevIndex] = { ...data.approvals[prevIndex], status: "superseded" }
          }
        }
        const payloadHash = await hashPayload(input.payload)
        const stored: StoredApproval = {
          id: crypto.randomUUID(),
          version,
          actionType: input.actionType,
          title: input.title,
          account: null,
          details: Object.entries(input.payload).map(([label, value]) => ({
            label,
            value: typeof value === "string" ? value : JSON.stringify(value),
          })),
          financialImpact: input.financialImpact ?? null,
          requestedByAgent: input.requestedByAgent ?? "User",
          requestedAt: new Date().toISOString(),
          status: "pending",
          decisionNote: null,
          isSample: false,
          payload: input.payload,
          payloadHash,
        }
        data.approvals.unshift(stored)
        return toView(stored)
      })
    },
    async decideApproval(id, decision, note, actorId) {
      return mutate((data) => {
        const index = data.approvals.findIndex((a) => a.id === id)
        const stored = data.approvals[index]
        if (!stored) throw new Error("Approval request not found")
        const request: ApprovalRequest<Record<string, unknown>> = {
          id: stored.id,
          version: stored.version,
          previousVersionId: null,
          actionType: stored.actionType,
          connectedAccountId: null,
          payload: stored.payload,
          payloadHash: stored.payloadHash,
          financialImpact: stored.financialImpact,
          requestedByAgent: stored.requestedByAgent,
          status: stored.status,
          decidedBy: null,
          decidedAt: null,
          decisionNote: stored.decisionNote,
        }
        const next = transition(request, decisionToStatus(decision), {
          by: actorId,
          at: new Date().toISOString(),
          note: note ?? undefined,
        })
        const updated: StoredApproval = {
          ...stored,
          status: next.status,
          decisionNote: next.decisionNote,
        }
        data.approvals[index] = updated
        return toView(updated)
      })
    },

    async listCampaigns() {
      const { campaigns = [] } = await load()
      return [...campaigns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async getCampaign(id) {
      return (await load()).campaigns?.find((c) => c.id === id) ?? null
    },
    async saveCampaign(campaign) {
      return mutate((data) => {
        const saved = { ...campaign, updatedAt: new Date().toISOString() }
        data.campaigns = [saved, ...(data.campaigns ?? []).filter((c) => c.id !== campaign.id)]
        return saved
      })
    },
    async deleteCampaign(id) {
      await mutate((data) => {
        data.campaigns = (data.campaigns ?? []).filter((c) => c.id !== id)
      })
    },

    async listConnectedAccounts() {
      return listLocalConnectedAccounts("demo")
    },
    async saveConnectedAccount(input) {
      const now = new Date().toISOString()
      return saveLocalConnectedAccount(
        "demo",
        {
          id: crypto.randomUUID(),
          provider: input.provider,
          externalAccountId: input.externalAccountId,
          displayName: input.displayName,
          scopes: input.scopes,
          status: input.status,
          tokenExpiresAt: input.tokenExpiresAt ?? null,
          lastSyncedAt: now,
          lastError: input.lastError ?? null,
          updatedAt: now,
        },
        {
          accessTokenCiphertext: input.accessTokenCiphertext ?? null,
          refreshTokenCiphertext: input.refreshTokenCiphertext ?? null,
          keyVersion: input.keyVersion ?? 1,
        },
        {
          dailySpendLimitInr: input.dailySpendLimitInr ?? null,
          monthlySpendLimitInr: input.monthlySpendLimitInr ?? null,
        }
      )
    },
    async disconnectConnectedAccount(id) {
      removeLocalConnectedAccount("demo", id)
    },
    async listPublishingJobs() {
      return []
    },
    async listAdAccounts() {
      return listLocalAdAccounts("demo")
    },
    async updateAdAccountLimits(id, limits) {
      updateLocalAdAccountLimits("demo", id, limits)
    },
    async listAnalyticsEvents() {
      return []
    },

    async listAssets() {
      return []
    },
    async uploadAsset() {
      throw new Error("Uploading assets requires Supabase Storage. Connect Supabase to use the Asset Library.")
    },
    async deleteAsset() {
      throw new Error("Assets require Supabase Storage.")
    },
    async resolveAssetUrls() {
      return {}
    },

    async listCreativeProjects() {
      const { creativeProjects = [] } = await load()
      return [...creativeProjects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ document, brief: _brief, ...summary }) => ({ ...summary, preview: { ...document, pages: document.pages.slice(0, 1) } }))
    },
    async getCreativeProject(id) {
      return (await load()).creativeProjects?.find((p) => p.id === id) ?? null
    },
    async saveCreativeProject(project) {
      return mutate((data) => {
        const saved = { ...project, updatedAt: new Date().toISOString() }
        data.creativeProjects = [saved, ...(data.creativeProjects ?? []).filter((p) => p.id !== project.id)]
        return saved
      })
    },
    async deleteCreativeProject(id) {
      await mutate((data) => {
        data.creativeProjects = (data.creativeProjects ?? []).filter((p) => p.id !== id)
      })
    },

    async listContentItems({ from, to }) {
      const { contentItems = [] } = await load()
      return contentItems.filter((item) => !item.scheduledFor || (item.scheduledFor >= from && item.scheduledFor < to))
    },
    async getContentItem(id) {
      return (await load()).contentItems?.find((i) => i.id === id) ?? null
    },
    async saveContentItem(item) {
      return mutate((data) => {
        const saved = { ...item, updatedAt: new Date().toISOString() }
        data.contentItems = [saved, ...(data.contentItems ?? []).filter((i) => i.id !== item.id)]
        return saved
      })
    },
    async deleteContentItem(id) {
      await mutate((data) => {
        data.contentItems = (data.contentItems ?? []).filter((i) => i.id !== id)
      })
    },

    async listMembers() {
      return DEMO_MEMBERS
    },
    async createInvitation() {
      throw new Error("Invitations require Supabase. Configure it to invite your team.")
    },

    async recordAgentRun(run) {
      await mutate((data) => {
        data.runs = [run, ...(data.runs ?? [])].slice(0, 200)
      })
    },
    async recordAudit(entry: AuditEntry) {
      await mutate((data) => {
        data.audit.unshift({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
        data.audit = data.audit.slice(0, 500)
      })
    },
    async listAudit(limit) {
      return (await load()).audit.slice(0, limit)
    },
    async recordUsage(key, quantity) {
      await mutate((data) => {
        data.usage.push({ key, quantity, at: new Date().toISOString() })
      })
    },
  }
}
