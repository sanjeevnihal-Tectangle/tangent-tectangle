import "server-only"

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { ApprovalError, canTransition, hashPayload, transition, type ApprovalRequest } from "@/lib/approvals/engine"
import type { AgentRunLog, AuditEntry, AuditRecord, WorkspaceRepository } from "@/lib/data/types"
import { decisionToStatus, type ApprovalView } from "@/lib/domain/approvals"
import type { Product } from "@/lib/domain/product"
import type { BrandProfile } from "@/lib/domain/brand"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"
import type { Campaign } from "@/lib/domain/campaigns"
import type { ContentItem } from "@/lib/domain/content"
import type { Conversation } from "@/lib/domain/conversations"
import type { CreativeProject } from "@/lib/domain/creative"
import {
  defaultMessagingSettings,
  type Audience,
  type Contact,
  type ContactImportBatch,
  type ConversationMessage,
  type ConversationThread,
  type MessageAutomation,
  type MessageBroadcast,
  type MessageEvent,
  type MessageTemplate,
  type MessagingSettings,
  type Product,
} from "@/lib/domain/messaging"
import { DEMO_APPROVALS, DEMO_CONVERSATIONS } from "@/lib/demo/seed-ai"
import { DEMO_MEMBERS } from "@/lib/demo/workspace"
import {
  DEMO_BRAND_PROFILES,
  DEMO_BUSINESS_PROFILE,
  DEMO_INTELLIGENCE,
} from "@/lib/demo/seed-business"
import {
  getLocalConnectedAccountCredential,
  listLocalAdAccounts,
  listLocalConnectedAccounts,
  removeLocalConnectedAccount,
  saveLocalConnectedAccount,
  updateLocalAdAccountLimits,
} from "@/lib/integrations/local-store"

type StoredApproval = ApprovalView & {
  payload: Record<string, unknown>
  payloadHash: string
  connectedAccountId?: string | null
  previousVersionId?: string | null
}

interface DemoStoreData {
  version: 1
  businessProfile: BusinessProfile | null
  intelligence: MarketingIntelligence | null
  brandProfiles: BrandProfile[]
  conversations: Conversation[]
  approvals: StoredApproval[]
  campaigns?: Campaign[]
  products?: Product[]
  contacts?: Contact[]
  audiences?: Audience[]
  contactImportBatches?: ContactImportBatch[]
  messageTemplates?: MessageTemplate[]
  broadcasts?: MessageBroadcast[]
  messageEvents?: MessageEvent[]
  messagingSettings?: MessagingSettings
  automations?: MessageAutomation[]
  conversationThreads?: ConversationThread[]
  conversationMessages?: ConversationMessage[]
  audit: AuditRecord[]
  runs?: AgentRunLog[]
  creativeProjects?: CreativeProject[]
  products?: Product[]
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

    async listProducts() {
      return [...((await load()).products ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    },
    async saveProduct(product) {
      return mutate((data) => {
        const saved = { ...product, updatedAt: new Date().toISOString() }
        const list = data.products ?? []
        const index = list.findIndex((p) => p.id === saved.id)
        if (index >= 0) list[index] = saved
        else list.push(saved)
        data.products = list
        return saved
      })
    },
    async deleteProduct(id) {
      await mutate((data) => {
        data.products = (data.products ?? []).filter((p) => p.id !== id)
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
          connectedAccountId: input.connectedAccountId ?? null,
          previousVersionId: input.previousVersionId ?? null,
        }
        data.approvals.unshift(stored)
        return toView(stored)
      })
    },
    async getApprovalExecutable(id) {
      const stored = (await load()).approvals.find((a) => a.id === id)
      if (!stored) return null
      return {
        id: stored.id,
        status: stored.status,
        payload: stored.payload,
        payloadHash: stored.payloadHash,
      }
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

    async getNextApprovalVersionId(id) {
      return (await load()).approvals.find((a) => a.previousVersionId === id)?.id ?? null
    },
    async getApprovalRequest(id) {
      const stored = (await load()).approvals.find((a) => a.id === id)
      if (!stored) return null
      return {
        id: stored.id,
        version: stored.version,
        previousVersionId: null,
        actionType: stored.actionType,
        connectedAccountId: stored.connectedAccountId ?? null,
        payload: stored.payload,
        payloadHash: stored.payloadHash,
        financialImpact: stored.financialImpact,
        requestedByAgent: stored.requestedByAgent,
        status: stored.status,
        decidedBy: null,
        decidedAt: null,
        decisionNote: stored.decisionNote,
      }
    },
    async setApprovalExecutionStatus(id, from, to) {
      if (!canTransition(from, to)) {
        throw new ApprovalError(`Cannot move approval from "${from}" to "${to}"`, "invalid_transition")
      }
      return mutate((data) => {
        const index = data.approvals.findIndex((a) => a.id === id)
        const stored = data.approvals[index]
        if (!stored || stored.status !== from) return false
        data.approvals[index] = { ...stored, status: to }
        return true
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

    async messagingSchemaReady() {
      return true
    },

    async listProducts() {
      const { products = [] } = await load()
      return [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async saveProduct(product) {
      return mutate((data) => {
        const saved = { ...product, updatedAt: new Date().toISOString() }
        data.products = [saved, ...(data.products ?? []).filter((p) => p.id !== product.id)]
        return saved
      })
    },
    async deleteProduct(id) {
      await mutate((data) => {
        data.products = (data.products ?? []).filter((p) => p.id !== id)
      })
    },

    async listContacts(options) {
      const limit = options?.limit ?? 500
      const { contacts = [] } = await load()
      return [...contacts]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
    },
    async saveContact(contact) {
      return mutate((data) => {
        const saved = { ...contact, updatedAt: new Date().toISOString() }
        data.contacts = [saved, ...(data.contacts ?? []).filter((c) => c.id !== contact.id)]
        return saved
      })
    },
    async deleteContact(id) {
      await mutate((data) => {
        data.contacts = (data.contacts ?? []).filter((c) => c.id !== id)
        data.audiences = (data.audiences ?? []).map((a) => ({
          ...a,
          memberIds: a.memberIds.filter((mid) => mid !== id),
          estimatedSize: a.memberIds.filter((mid) => mid !== id).length,
        }))
      })
    },
    async upsertContacts(contacts) {
      return mutate((data) => {
        const now = new Date().toISOString()
        const existing = data.contacts ?? []
        const byPhone = new Map(
          existing.filter((c) => c.phoneE164).map((c) => [c.phoneE164!, c] as const)
        )
        const byEmail = new Map(
          existing
            .filter((c) => c.email)
            .map((c) => [c.email!.toLowerCase(), c] as const)
        )
        const saved: Contact[] = []
        for (const contact of contacts) {
          const match =
            (contact.phoneE164 ? byPhone.get(contact.phoneE164) : undefined) ??
            (contact.email ? byEmail.get(contact.email.toLowerCase()) : undefined)
          const merged: Contact = {
            ...(match ?? contact),
            ...contact,
            id: match?.id ?? contact.id,
            updatedAt: now,
          }
          saved.push(merged)
          if (merged.phoneE164) byPhone.set(merged.phoneE164, merged)
          if (merged.email) byEmail.set(merged.email.toLowerCase(), merged)
        }
        const savedIds = new Set(saved.map((c) => c.id))
        data.contacts = [...saved, ...existing.filter((c) => !savedIds.has(c.id))]
        return saved
      })
    },

    async listAudiences() {
      const { audiences = [] } = await load()
      return [...audiences].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async saveAudience(audience) {
      return mutate((data) => {
        const saved = {
          ...audience,
          estimatedSize: audience.memberIds.length,
          refreshedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        data.audiences = [saved, ...(data.audiences ?? []).filter((a) => a.id !== audience.id)]
        return saved
      })
    },
    async deleteAudience(id) {
      await mutate((data) => {
        data.audiences = (data.audiences ?? []).filter((a) => a.id !== id)
      })
    },

    async listContactImportBatches() {
      const { contactImportBatches = [] } = await load()
      return [...contactImportBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async saveContactImportBatch(batch) {
      return mutate((data) => {
        const saved = { ...batch, updatedAt: new Date().toISOString() }
        data.contactImportBatches = [
          saved,
          ...(data.contactImportBatches ?? []).filter((b) => b.id !== batch.id),
        ]
        return saved
      })
    },

    async listMessageTemplates() {
      const { messageTemplates = [] } = await load()
      return [...messageTemplates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async saveMessageTemplate(template) {
      return mutate((data) => {
        const saved = { ...template, updatedAt: new Date().toISOString() }
        data.messageTemplates = [
          saved,
          ...(data.messageTemplates ?? []).filter((t) => t.id !== template.id),
        ]
        return saved
      })
    },
    async deleteMessageTemplate(id) {
      await mutate((data) => {
        data.messageTemplates = (data.messageTemplates ?? []).filter((t) => t.id !== id)
      })
    },

    async listBroadcasts() {
      const { broadcasts = [] } = await load()
      return [...broadcasts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async getBroadcast(id) {
      return (await load()).broadcasts?.find((b) => b.id === id) ?? null
    },
    async saveBroadcast(broadcast) {
      return mutate((data) => {
        const saved = { ...broadcast, updatedAt: new Date().toISOString() }
        data.broadcasts = [saved, ...(data.broadcasts ?? []).filter((b) => b.id !== broadcast.id)]
        return saved
      })
    },
    async deleteBroadcast(id) {
      await mutate((data) => {
        data.broadcasts = (data.broadcasts ?? []).filter((b) => b.id !== id)
        data.messageEvents = (data.messageEvents ?? []).filter((e) => e.broadcastId !== id)
      })
    },
    async listMessageEvents(broadcastId) {
      const { messageEvents = [] } = await load()
      return messageEvents.filter((e) => e.broadcastId === broadcastId)
    },
    async saveMessageEvents(events) {
      await mutate((data) => {
        const ids = new Set(events.map((e) => e.id))
        data.messageEvents = [
          ...events,
          ...(data.messageEvents ?? []).filter((e) => !ids.has(e.id)),
        ]
      })
    },

    async getMessagingSettings() {
      return (await load()).messagingSettings ?? defaultMessagingSettings()
    },
    async saveMessagingSettings(settings) {
      return mutate((data) => {
        const saved = { ...settings, updatedAt: new Date().toISOString() }
        data.messagingSettings = saved
        return saved
      })
    },
    async listAutomations() {
      const { automations = [] } = await load()
      return [...automations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async saveAutomation(automation) {
      return mutate((data) => {
        const saved = { ...automation, updatedAt: new Date().toISOString() }
        data.automations = [saved, ...(data.automations ?? []).filter((a) => a.id !== automation.id)]
        return saved
      })
    },
    async deleteAutomation(id) {
      await mutate((data) => {
        data.automations = (data.automations ?? []).filter((a) => a.id !== id)
      })
    },

    async listConversationThreads(options) {
      const { conversationThreads = [] } = await load()
      return [...conversationThreads]
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
        .slice(0, options?.limit ?? 80)
    },
    async listConversationMessages(threadId) {
      const { conversationMessages = [] } = await load()
      return conversationMessages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    },
    async markConversationThreadRead(threadId) {
      return mutate((data) => {
        const thread = (data.conversationThreads ?? []).find((t) => t.id === threadId)
        if (!thread) return null
        const saved = { ...thread, unreadCount: 0, updatedAt: new Date().toISOString() }
        data.conversationThreads = (data.conversationThreads ?? []).map((t) =>
          t.id === threadId ? saved : t
        )
        return saved
      })
    },
    async upsertConversationThread(input) {
      return mutate((data) => {
        const now = new Date().toISOString()
        const existing = (data.conversationThreads ?? []).find(
          (t) => t.channel === input.channel && t.externalThreadKey === input.externalThreadKey
        )
        if (existing) {
          const saved: ConversationThread = {
            ...existing,
            connectedAccountId: input.connectedAccountId,
            contactId: input.contactId,
            participantHandle: input.participantHandle,
            participantName: input.participantName,
            status: input.status,
            lastMessageAt: input.lastMessageAt,
            lastMessagePreview: input.lastMessagePreview,
            lastInboundAt: input.lastInboundAt,
            aiSummary: input.aiSummary ?? existing.aiSummary,
            updatedAt: now,
          }
          data.conversationThreads = (data.conversationThreads ?? []).map((t) =>
            t.id === existing.id ? saved : t
          )
          return saved
        }
        const saved: ConversationThread = {
          id: crypto.randomUUID(),
          channel: input.channel,
          connectedAccountId: input.connectedAccountId,
          contactId: input.contactId,
          externalThreadKey: input.externalThreadKey,
          participantHandle: input.participantHandle,
          participantName: input.participantName,
          status: input.status,
          unreadCount: Math.max(0, input.unreadCountDelta ?? 0),
          lastMessageAt: input.lastMessageAt,
          lastMessagePreview: input.lastMessagePreview,
          lastInboundAt: input.lastInboundAt,
          aiSummary: input.aiSummary ?? null,
          updatedAt: now,
        }
        data.conversationThreads = [saved, ...(data.conversationThreads ?? [])]
        return saved
      })
    },
    async upsertConversationMessage(input) {
      return mutate((data) => {
        if (input.providerMessageId) {
          const existing = (data.conversationMessages ?? []).find(
            (m) => m.providerMessageId === input.providerMessageId
          )
          if (existing) return existing
        }
        const message: ConversationMessage = {
          id: crypto.randomUUID(),
          threadId: input.threadId,
          direction: input.direction,
          senderKind: input.senderKind,
          body: input.body,
          contentType: input.contentType,
          providerMessageId: input.providerMessageId,
          status: input.status,
          aiIntent: null,
          aiSentiment: null,
          aiConfidence: null,
          aiDraftReply: null,
          aiShouldAutoReply: false,
          occurredAt: input.occurredAt,
        }
        data.conversationMessages = [...(data.conversationMessages ?? []), message]
        return message
      })
    },
    async saveConversationOutbound(input) {
      return mutate((data) => {
        const now = new Date().toISOString()
        const message: ConversationMessage = {
          id: crypto.randomUUID(),
          threadId: input.threadId,
          direction: "outbound",
          senderKind: input.senderKind,
          body: input.body.trim(),
          contentType: "text",
          providerMessageId: input.providerMessageId,
          status: "sent",
          aiIntent: null,
          aiSentiment: null,
          aiConfidence: null,
          aiDraftReply: null,
          aiShouldAutoReply: false,
          occurredAt: now,
        }
        data.conversationMessages = [...(data.conversationMessages ?? []), message]
        data.conversationThreads = (data.conversationThreads ?? []).map((t) =>
          t.id === input.threadId
            ? {
                ...t,
                lastMessageAt: now,
                lastMessagePreview: input.body.trim().slice(0, 160),
                updatedAt: now,
              }
            : t
        )
        return message
      })
    },
    async updateConversationMessageAi(messageId, patch) {
      await mutate((data) => {
        data.conversationMessages = (data.conversationMessages ?? []).map((m) =>
          m.id === messageId ? { ...m, ...patch } : m
        )
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
    async getConnectedAccountCredential(id) {
      return getLocalConnectedAccountCredential("demo", id)
    },
    async listPublishingJobs() {
      return []
    },
    async recordPublishing(input) {
      await mutate((data) => {
        const saved = { ...input.contentItem, updatedAt: new Date().toISOString() }
        data.contentItems = [saved, ...(data.contentItems ?? []).filter((i) => i.id !== saved.id)]
      })
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
