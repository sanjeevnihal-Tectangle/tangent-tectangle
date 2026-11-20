import type { ApprovalRequest, ApprovalStatus, ExternalActionType, FinancialImpact } from "@/lib/approvals/engine"
import type { Role } from "@/lib/auth/permissions"
import type { AdAccountView } from "@/lib/domain/ads"
import type { AnalyticsEventRecord } from "@/lib/domain/analytics"
import type { ApprovalDecision, ApprovalView } from "@/lib/domain/approvals"
import type { BrandProfile } from "@/lib/domain/brand"
import type { Product } from "@/lib/domain/product"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"
import type { Campaign } from "@/lib/domain/campaigns"
import type { ContentItem } from "@/lib/domain/content"
import type {
  Audience,
  Contact,
  ContactImportBatch,
  ConversationMessage,
  ConversationThread,
  MessageAutomation,
  MessageBroadcast,
  MessageEvent,
  MessageTemplate,
  MessagingSettings,
  Product as BusinessProduct,
} from "@/lib/domain/messaging"
import type { CreativeProject, CreativeProjectSummary } from "@/lib/domain/creative"
import type { MediaAsset, NewMediaAsset } from "@/lib/domain/media"
import type { ConnectedAccountView, PublishingJobView } from "@/lib/domain/social"
import type {
  Conversation,
  ConversationSummary,
  StoredMessage,
} from "@/lib/domain/conversations"

export interface SaveConnectedAccountInput {
  provider: string
  externalAccountId: string
  displayName: string
  scopes: string[]
  status: ConnectedAccountView["status"]
  tokenExpiresAt?: string | null
  lastError?: string | null
  accessTokenCiphertext?: string | null
  refreshTokenCiphertext?: string | null
  keyVersion?: number
  dailySpendLimitInr?: number | null
  monthlySpendLimitInr?: number | null
}

/** Encrypted token record from the credential vault. Decrypt only in server executors. */
export interface ConnectedAccountCredential {
  accessTokenCiphertext: string
  refreshTokenCiphertext: string | null
  keyVersion: number
}

/** Outcome of an approved publish, stored as a content item + publishing job. */
export interface PublishingRecordInput {
  approvalRequestId: string
  connectedAccountId: string
  contentItem: ContentItem
  status: "succeeded" | "failed"
  externalPostId: string | null
  lastError: string | null
}

export interface NewApprovalRequestInput {
  actionType: ExternalActionType
  title: string
  connectedAccountId?: string | null
  payload: Record<string, unknown>
  financialImpact?: FinancialImpact | null
  requestedByAgent?: string | null
  previousVersionId?: string | null
}

export interface AuditEntry {
  action: string
  entityType: string
  entityId: string | null
  summary: string
  actor: { type: "user" | "agent" | "system"; id: string | null }
  metadata?: Record<string, unknown>
}

export interface MemberView {
  id: string
  name: string
  email: string
  role: Role
  status: "active" | "invited"
}

export interface AuditRecord extends AuditEntry {
  id: string
  createdAt: string
}

/** Execution log for one orchestrator run (agent_runs + agent_tasks). */
export interface AgentRunLog {
  runId: string
  conversationId: string
  status: "completed" | "failed"
  intent: string | null
  taskType: string | null
  model: string | null
  usage: { inputTokens: number; outputTokens: number }
  error: { code: string; message: string } | null
  startedAt: string
  completedAt: string
  tasks: {
    sequence: number
    agentId: string
    title: string
    instruction: string
    status: "completed" | "failed"
    output: unknown
    error: string | null
  }[]
}

/**
 * Workspace-scoped persistence. Implementations: Supabase (live, RLS enforced
 * with the user's session) and the local demo store.
 */
export interface WorkspaceRepository {
  readonly persistence: "supabase" | "demo-file" | "demo-memory"

  getBusinessProfile(): Promise<BusinessProfile | null>
  saveBusinessProfile(profile: BusinessProfile): Promise<void>
  getIntelligence(): Promise<MarketingIntelligence | null>
  saveIntelligence(intelligence: MarketingIntelligence): Promise<void>

  listBrandProfiles(): Promise<BrandProfile[]>
  saveBrandProfile(profile: BrandProfile): Promise<BrandProfile>
  deleteBrandProfile(id: string): Promise<void>

  /** Product & service catalogue (each item can use its own brand kit). */
  listProducts(): Promise<Product[]>
  saveProduct(product: Product): Promise<Product>
  deleteProduct(id: string): Promise<void>

  listConversations(): Promise<ConversationSummary[]>
  getConversation(id: string): Promise<Conversation | null>
  createConversation(title: string): Promise<ConversationSummary>
  appendMessage(conversationId: string, message: StoredMessage): Promise<void>

  listApprovals(): Promise<ApprovalView[]>
  createApprovalRequest(input: NewApprovalRequestInput): Promise<ApprovalView>
  decideApproval(
    id: string,
    decision: ApprovalDecision,
    note: string | null,
    actorId: string
  ): Promise<ApprovalView>
  /** Payload + hash for assertExecutable (not exposed in ApprovalView). */
  getApprovalExecutable(id: string): Promise<{
    id: string
    status: ApprovalStatus
    payload: Record<string, unknown>
    payloadHash: string
  } | null>

  /** Full approval request (with the exact payload) for executors. */
  getApprovalRequest(id: string): Promise<ApprovalRequest<Record<string, unknown>> | null>
  /** Id of the version that replaced this approval (when it was superseded), or null. */
  getNextApprovalVersionId(id: string): Promise<string | null>
  /**
   * Execution bookkeeping (approved → executing → executed | failed). Compare-and-set on
   * `from`, so two clicks can never execute the same approval twice. Returns false when the
   * status had already changed.
   */
  setApprovalExecutionStatus(id: string, from: ApprovalStatus, to: ApprovalStatus): Promise<boolean>

  listCampaigns(): Promise<Campaign[]>
  getCampaign(id: string): Promise<Campaign | null>
  saveCampaign(campaign: Campaign): Promise<Campaign>
  deleteCampaign(id: string): Promise<void>

  /** False when messaging migrations have not been applied yet. */
  messagingSchemaReady(): Promise<boolean>
  /** Messaging catalogue (`business_products`), distinct from brand-kit `listProducts`. */
  listBusinessProducts(): Promise<BusinessProduct[]>
  saveBusinessProduct(product: BusinessProduct): Promise<BusinessProduct>
  deleteBusinessProduct(id: string): Promise<void>

  listContacts(options?: { limit?: number }): Promise<Contact[]>
  saveContact(contact: Contact): Promise<Contact>
  deleteContact(id: string): Promise<void>
  upsertContacts(contacts: Contact[]): Promise<Contact[]>

  listAudiences(): Promise<Audience[]>
  saveAudience(audience: Audience): Promise<Audience>
  deleteAudience(id: string): Promise<void>

  listContactImportBatches(): Promise<ContactImportBatch[]>
  saveContactImportBatch(batch: ContactImportBatch): Promise<ContactImportBatch>

  listMessageTemplates(): Promise<MessageTemplate[]>
  saveMessageTemplate(template: MessageTemplate): Promise<MessageTemplate>
  deleteMessageTemplate(id: string): Promise<void>

  listBroadcasts(): Promise<MessageBroadcast[]>
  getBroadcast(id: string): Promise<MessageBroadcast | null>
  saveBroadcast(broadcast: MessageBroadcast): Promise<MessageBroadcast>
  deleteBroadcast(id: string): Promise<void>
  listMessageEvents(broadcastId: string): Promise<MessageEvent[]>
  saveMessageEvents(events: MessageEvent[]): Promise<void>

  getMessagingSettings(): Promise<MessagingSettings>
  saveMessagingSettings(settings: MessagingSettings): Promise<MessagingSettings>

  listAutomations(): Promise<MessageAutomation[]>
  saveAutomation(automation: MessageAutomation): Promise<MessageAutomation>
  deleteAutomation(id: string): Promise<void>

  listConversationThreads(options?: { limit?: number }): Promise<ConversationThread[]>
  listConversationMessages(threadId: string): Promise<ConversationMessage[]>
  markConversationThreadRead(threadId: string): Promise<ConversationThread | null>
  saveConversationOutbound(input: {
    threadId: string
    body: string
    providerMessageId: string | null
    senderKind: "user" | "agent" | "auto"
  }): Promise<ConversationMessage | null>
  upsertConversationThread(input: {
    channel: ConversationThread["channel"]
    connectedAccountId: string | null
    contactId: string | null
    externalThreadKey: string
    participantHandle: string
    participantName: string
    status: ConversationThread["status"]
    lastMessageAt: string | null
    lastMessagePreview: string
    lastInboundAt: string | null
    unreadCountDelta?: number
    aiSummary?: string | null
    metadata?: Record<string, unknown>
  }): Promise<ConversationThread>
  upsertConversationMessage(input: {
    threadId: string
    direction: ConversationMessage["direction"]
    senderKind: ConversationMessage["senderKind"]
    body: string
    contentType: string
    providerMessageId: string | null
    status: string
    occurredAt: string
    metadata?: Record<string, unknown>
  }): Promise<ConversationMessage | null>
  updateConversationMessageAi(
    messageId: string,
    patch: Partial<
      Pick<
        ConversationMessage,
        "aiIntent" | "aiSentiment" | "aiConfidence" | "aiDraftReply" | "aiShouldAutoReply"
      >
    >
  ): Promise<void>

  listConnectedAccounts(): Promise<ConnectedAccountView[]>
  saveConnectedAccount(input: SaveConnectedAccountInput): Promise<ConnectedAccountView>
  disconnectConnectedAccount(id: string): Promise<void>
  /** Encrypted credentials for one connected account (server executors only). */
  getConnectedAccountCredential(id: string): Promise<ConnectedAccountCredential | null>
  listPublishingJobs(): Promise<PublishingJobView[]>
  recordPublishing(input: PublishingRecordInput): Promise<void>

  listAdAccounts(): Promise<AdAccountView[]>
  updateAdAccountLimits(
    id: string,
    limits: { dailySpendLimitInr: number | null; monthlySpendLimitInr: number | null }
  ): Promise<void>

  listAnalyticsEvents(range: { from: string; to: string }): Promise<AnalyticsEventRecord[]>

  listAssets(options: { search?: string; limit: number }): Promise<MediaAsset[]>
  uploadAsset(asset: NewMediaAsset): Promise<MediaAsset>
  deleteAsset(id: string): Promise<void>
  /** Signed URLs for the given asset ids (missing ids are omitted). */
  resolveAssetUrls(ids: string[]): Promise<Record<string, string>>

  listCreativeProjects(): Promise<CreativeProjectSummary[]>
  getCreativeProject(id: string): Promise<CreativeProject | null>
  saveCreativeProject(project: CreativeProject): Promise<CreativeProject>
  deleteCreativeProject(id: string): Promise<void>

  /** Content items scheduled in [from, to) plus all unscheduled items. */
  listContentItems(range: { from: string; to: string }): Promise<ContentItem[]>
  getContentItem(id: string): Promise<ContentItem | null>
  saveContentItem(item: ContentItem): Promise<ContentItem>
  deleteContentItem(id: string): Promise<void>

  listMembers(): Promise<MemberView[]>
  /** Stores an invitation (hash only). Throws in demo mode. */
  createInvitation(email: string, role: Role, tokenHash: string): Promise<void>

  recordAgentRun(run: AgentRunLog): Promise<void>
  recordAudit(entry: AuditEntry): Promise<void>
  listAudit(limit: number): Promise<AuditRecord[]>
  recordUsage(key: string, quantity: number, metadata?: Record<string, unknown>): Promise<void>
}
