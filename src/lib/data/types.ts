import type { ExternalActionType, FinancialImpact } from "@/lib/approvals/engine"
import type { Role } from "@/lib/auth/permissions"
import type { AdAccountView } from "@/lib/domain/ads"
import type { AnalyticsEventRecord } from "@/lib/domain/analytics"
import type { ApprovalDecision, ApprovalView } from "@/lib/domain/approvals"
import type { BrandProfile } from "@/lib/domain/brand"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"
import type { Campaign } from "@/lib/domain/campaigns"
import type { ContentItem } from "@/lib/domain/content"
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

  listCampaigns(): Promise<Campaign[]>
  getCampaign(id: string): Promise<Campaign | null>
  saveCampaign(campaign: Campaign): Promise<Campaign>
  deleteCampaign(id: string): Promise<void>

  listConnectedAccounts(): Promise<ConnectedAccountView[]>
  saveConnectedAccount(input: SaveConnectedAccountInput): Promise<ConnectedAccountView>
  disconnectConnectedAccount(id: string): Promise<void>
  listPublishingJobs(): Promise<PublishingJobView[]>

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
