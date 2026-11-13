import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { ApprovalError, canTransition, hashPayload, transition, type ApprovalRequest, type ApprovalStatus, type ExternalActionType, type FinancialImpact } from "@/lib/approvals/engine"
import type { Role } from "@/lib/auth/permissions"
import type { AuditRecord, MemberView, WorkspaceRepository } from "@/lib/data/types"
import type { AdAccountView } from "@/lib/domain/ads"
import type { AnalyticsEventRecord } from "@/lib/domain/analytics"
import { decisionToStatus, type ApprovalView } from "@/lib/domain/approvals"
import { brandProfileSchema, type BrandProfile } from "@/lib/domain/brand"
import { productSchema, type Product } from "@/lib/domain/product"
import {
  businessProfileSchema,
  marketingIntelligenceContentSchema,
  type BusinessProfile,
  type MarketingIntelligence,
} from "@/lib/domain/business"
import { campaignSchema, type Campaign } from "@/lib/domain/campaigns"
import { contentItemSchema, type ContentItem } from "@/lib/domain/content"
import type { StoredMessage } from "@/lib/domain/conversations"
import { creativeProjectSchema, type CreativeProject } from "@/lib/domain/creative"
import { extensionFor, type MediaAsset } from "@/lib/domain/media"
import type { ConnectedAccountView, ConnectionStatus, PublishingJobStatus, PublishingJobView } from "@/lib/domain/social"
import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import {
  getLocalConnectedAccountCredential,
  listLocalAdAccounts,
  listLocalConnectedAccounts,
  removeLocalConnectedAccount,
  saveLocalConnectedAccount,
  updateLocalAdAccountLimits,
} from "@/lib/integrations/local-store"

class RepositoryError extends Error {
  constructor(operation: string, cause: { message: string; code?: string }) {
    super(`${operation} failed: ${cause.message}`)
    this.name = "RepositoryError"
  }
}

function check<T>(operation: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new RepositoryError(operation, result.error)
  return result.data
}

interface BrandRow {
  id: string
  name: string
  is_default: boolean
  logo_asset_id: string | null
  colors: unknown
  typography: unknown
  voice: unknown
  messaging: unknown
  approved_copy: string[]
  prohibited_messaging: string[]
  visual_references: string[]
  guidelines: string
  visual_style?: unknown
  updated_at: string
}

interface ProductRow {
  id: string
  name: string
  kind: string
  category: string
  description: string
  price: string
  audience: string
  benefits: string[]
  features: string[]
  url: string
  brand_profile_id: string | null
  image_asset_ids: string[]
  is_active: boolean
  updated_at: string
}

function productFromRow(row: ProductRow): Product | null {
  const parsed = productSchema.safeParse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category,
    description: row.description,
    price: row.price,
    audience: row.audience,
    benefits: row.benefits ?? [],
    features: row.features ?? [],
    url: row.url,
    brandProfileId: row.brand_profile_id,
    imageAssetIds: row.image_asset_ids ?? [],
    isActive: row.is_active,
    updatedAt: row.updated_at,
  })
  return parsed.success ? parsed.data : null
}

/** True when a table or column from a migration that hasn't been run yet is missing. */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|could not find/i.test(error.message ?? "")
}

function brandFromRow(row: BrandRow): BrandProfile {
  return brandProfileSchema.parse({
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    logoAssetId: row.logo_asset_id,
    logoUrl: null,
    colors: row.colors,
    typography: row.typography,
    voice: row.voice,
    messaging: row.messaging,
    approvedCopy: row.approved_copy,
    prohibitedMessaging: row.prohibited_messaging,
    visualReferences: row.visual_references,
    guidelines: row.guidelines,
    visualStyle: row.visual_style ?? {},
    updatedAt: row.updated_at,
  })
}

interface ApprovalRow {
  id: string
  version: number
  action_type: ExternalActionType
  title: string
  payload: Record<string, unknown>
  payload_hash: string
  financial_impact: FinancialImpact | null
  requested_by_agent: string | null
  status: ApprovalStatus
  decision_note: string | null
  created_at: string
  connected_accounts: { provider: string; display_name: string; status: string } | null
}

function approvalFromRow(row: ApprovalRow): ApprovalView {
  return {
    id: row.id,
    version: row.version,
    actionType: row.action_type,
    title: row.title,
    account: row.connected_accounts
      ? {
          provider: row.connected_accounts.provider,
          name: row.connected_accounts.display_name,
          connected: row.connected_accounts.status === "active",
        }
      : null,
    details: Object.entries(row.payload).map(([label, value]) => ({
      label,
      value: typeof value === "string" ? value : JSON.stringify(value),
    })),
    financialImpact: row.financial_impact,
    requestedByAgent: row.requested_by_agent ?? "User",
    requestedAt: row.created_at,
    status: row.status,
    decisionNote: row.decision_note,
    isSample: false,
  }
}

const MEDIA_BUCKET = "media"
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60

interface AssetRow {
  id: string
  name: string
  kind: MediaAsset["kind"]
  source: MediaAsset["source"]
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  tags: string[]
  generation: MediaAsset["generation"]
  storage_path: string
  created_at: string
}

const ASSET_COLUMNS = "id, name, kind, source, mime_type, size_bytes, width, height, tags, generation, storage_path, created_at"

function assetFromRow(row: AssetRow, url: string | null): MediaAsset {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    tags: row.tags,
    url,
    generation: row.generation,
    createdAt: row.created_at,
  }
}

interface CreativeRow {
  id: string
  name: string
  objective: string
  platform: string
  format: string
  brand_profile_id: string | null
  status: "draft" | "final"
  document: unknown
  brief: unknown
  updated_at: string
}

function creativeFromRow(row: CreativeRow): CreativeProject | null {
  const parsed = creativeProjectSchema.safeParse({
    id: row.id,
    name: row.name,
    objective: row.objective,
    platform: row.platform,
    formatId: row.format,
    brandProfileId: row.brand_profile_id,
    status: row.status,
    document: row.document,
    brief: row.brief,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    console.warn(`[tangent] skipping invalid creative project ${row.id}`, parsed.error.issues[0])
    return null
  }
  return parsed.data
}

interface ContentRow {
  id: string
  title: string
  platform: string
  format: string
  caption: string
  hashtags: string[]
  scheduled_for: string | null
  status: ContentItem["status"]
  creative_project_id: string | null
  media_asset_ids: string[]
  review_note: string | null
  updated_at: string
}

const CONTENT_COLUMNS =
  "id, title, platform, format, caption, hashtags, scheduled_for, status, creative_project_id, media_asset_ids, review_note, updated_at"

function contentFromRow(row: ContentRow): ContentItem | null {
  const parsed = contentItemSchema.safeParse({
    id: row.id,
    title: row.title,
    platform: row.platform,
    format: row.format,
    caption: row.caption,
    hashtags: row.hashtags,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null,
    status: row.status,
    creativeProjectId: row.creative_project_id,
    mediaAssetIds: row.media_asset_ids,
    reviewNote: row.review_note,
    updatedAt: row.updated_at,
  })
  return parsed.success ? parsed.data : null
}

const APPROVAL_COLUMNS =
  "id, version, action_type, title, payload, payload_hash, financial_impact, requested_by_agent, status, decision_note, created_at, connected_accounts(provider, display_name, status)"

interface CampaignRow {
  id: string
  name: string
  objective: string
  audience: string
  channels: string[]
  start_date: string | null
  end_date: string | null
  budget_paise: number | string
  landing_page_url: string | null
  conversion_goal: string | null
  kpis: unknown
  status: Campaign["status"]
  brand_profile_id: string | null
  updated_at: string
}

const CAMPAIGN_COLUMNS =
  "id, name, objective, audience, channels, start_date, end_date, budget_paise, landing_page_url, conversion_goal, kpis, status, brand_profile_id, updated_at"

function campaignFromRow(row: CampaignRow): Campaign | null {
  const parsed = campaignSchema.safeParse({
    id: row.id,
    name: row.name,
    objective: row.objective,
    audience: row.audience ?? "",
    channels: row.channels ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    budgetInr: Math.round(Number(row.budget_paise) / 100),
    landingPageUrl: row.landing_page_url ?? "",
    conversionGoal: row.conversion_goal ?? "",
    kpis: Array.isArray(row.kpis) ? row.kpis : [],
    status: row.status,
    brandProfileId: row.brand_profile_id,
    updatedAt: row.updated_at,
  })
  return parsed.success ? parsed.data : null
}

export function createSupabaseRepository(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string
): WorkspaceRepository {
  const media = () => supabase.storage.from(MEDIA_BUCKET)

  /**
   * Service-role client for the few writes RLS reserves for the execution engine
   * (approval execution states, publishing jobs, published content, the credential
   * vault). Server-only; every query is still scoped to this workspace's organization id.
   */
  function adminClient(): SupabaseClient | null {
    const env = serverEnv()
    if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
    return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  function requireAdmin(operation: string): SupabaseClient {
    const admin = adminClient()
    if (!admin) {
      throw new RepositoryError(operation, { message: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server" })
    }
    return admin
  }

  async function signPaths(paths: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(paths)]
    if (unique.length === 0) return new Map()
    const { data, error } = await media().createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)
    if (error) throw new RepositoryError("Sign media URLs", error)
    const urls = new Map<string, string>()
    for (const entry of data) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
    }
    return urls
  }

  async function assetsFromRows(rows: AssetRow[]): Promise<MediaAsset[]> {
    const urls = await signPaths(rows.map((r) => r.storage_path))
    return rows.map((row) => assetFromRow(row, urls.get(row.storage_path) ?? null))
  }

  async function withLogoUrls(brands: BrandProfile[]): Promise<BrandProfile[]> {
    const ids = brands.map((b) => b.logoAssetId).filter((id): id is string => Boolean(id))
    if (ids.length === 0) return brands
    const rows = check(
      "Load brand logos",
      await supabase.from("media_assets").select("id, storage_path").in("id", ids)
    ) as { id: string; storage_path: string }[]
    const urls = await signPaths(rows.map((r) => r.storage_path))
    const byId = new Map(rows.map((r) => [r.id, urls.get(r.storage_path) ?? null]))
    return brands.map((b) => ({ ...b, logoUrl: b.logoAssetId ? byId.get(b.logoAssetId) ?? null : null }))
  }

  /** Update-then-insert so created_by is only set when a row is first created. */
  async function upsertOwned(table: string, id: string, values: Record<string, unknown>, operation: string) {
    const updated = check(
      operation,
      await supabase.from(table).update(values).eq("organization_id", organizationId).eq("id", id).select("id")
    ) as { id: string }[]
    if (updated.length > 0) return
    check(operation, await supabase.from(table).insert({ id, organization_id: organizationId, created_by: userId, ...values }))
  }

  return {
    persistence: "supabase",

    async getBusinessProfile() {
      const row = check(
        "Load business profile",
        await supabase.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle()
      )
      if (!row) return null
      return businessProfileSchema.parse({
        name: row.name,
        industry: row.industry,
        website: row.website ?? "",
        city: row.city,
        region: row.region ?? "",
        country: row.country,
        description: row.description,
        productsAndServices: row.products_and_services,
        targetAudience: row.target_audience,
        customerSegments: row.customer_segments,
        businessModel: row.business_model,
        competitors: row.competitors,
        objectives: row.objectives,
        monthlyBudgetInr: row.monthly_budget_inr,
        preferredChannels: row.preferred_channels,
      })
    },

    async saveBusinessProfile(profile: BusinessProfile) {
      check(
        "Save business profile",
        await supabase.from("business_profiles").upsert(
          {
            organization_id: organizationId,
            name: profile.name,
            industry: profile.industry,
            website: profile.website || null,
            city: profile.city,
            region: profile.region || null,
            country: profile.country,
            description: profile.description,
            products_and_services: profile.productsAndServices,
            target_audience: profile.targetAudience,
            customer_segments: profile.customerSegments,
            business_model: profile.businessModel,
            competitors: profile.competitors,
            objectives: profile.objectives,
            monthly_budget_inr: profile.monthlyBudgetInr,
            preferred_channels: profile.preferredChannels,
            updated_by: userId,
          },
          { onConflict: "organization_id" }
        )
      )
    },

    async getIntelligence() {
      const row = check(
        "Load intelligence",
        await supabase
          .from("business_profiles")
          .select("intelligence, intelligence_section_status, intelligence_generated_at, intelligence_generated_by")
          .eq("organization_id", organizationId)
          .maybeSingle()
      )
      if (!row?.intelligence) return null
      return {
        content: marketingIntelligenceContentSchema.parse(row.intelligence),
        sectionStatus: row.intelligence_section_status ?? {},
        generatedAt: row.intelligence_generated_at,
        generatedBy: row.intelligence_generated_by ?? "Marketing Strategist",
        isSample: false,
      } satisfies MarketingIntelligence
    },

    async saveIntelligence(intelligence) {
      check(
        "Save intelligence",
        await supabase
          .from("business_profiles")
          .update({
            intelligence: intelligence.content,
            intelligence_section_status: intelligence.sectionStatus,
            intelligence_generated_at: intelligence.generatedAt,
            intelligence_generated_by: intelligence.generatedBy,
            updated_by: userId,
          })
          .eq("organization_id", organizationId)
      )
    },

    async listBrandProfiles() {
      const rows = check(
        "List brand profiles",
        await supabase
          .from("brand_profiles")
          .select("*")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("is_default", { ascending: false })
          .order("created_at")
      ) as BrandRow[]
      return withLogoUrls(rows.map(brandFromRow))
    },

    async saveBrandProfile(profile) {
      if (profile.isDefault) {
        check(
          "Clear default brand",
          await supabase
            .from("brand_profiles")
            .update({ is_default: false })
            .eq("organization_id", organizationId)
            .neq("id", profile.id)
        )
      }
      const values = {
        id: profile.id,
        organization_id: organizationId,
        name: profile.name,
        is_default: profile.isDefault,
        logo_asset_id: profile.logoAssetId,
        colors: profile.colors,
        typography: profile.typography,
        voice: profile.voice,
        messaging: profile.messaging,
        approved_copy: profile.approvedCopy,
        prohibited_messaging: profile.prohibitedMessaging,
        visual_references: profile.visualReferences,
        guidelines: profile.guidelines,
        visual_style: profile.visualStyle,
        created_by: userId,
      }
      let result = await supabase.from("brand_profiles").upsert(values).select("*").single()
      if (isMissingSchema(result.error)) {
        // visual_style arrives with migration 20261113000300; save the rest until it has been run.
        console.warn("[tangent] brand_profiles.visual_style missing; run the latest Supabase migration")
        const { visual_style: _style, ...rest } = values
        result = await supabase.from("brand_profiles").upsert(rest).select("*").single()
      }
      const row = check("Save brand profile", result) as BrandRow
      const [saved] = await withLogoUrls([brandFromRow(row)])
      return saved!
    },

    async deleteBrandProfile(id) {
      check(
        "Delete brand profile",
        await supabase
          .from("brand_profiles")
          .update({ deleted_at: new Date().toISOString(), is_default: false })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listProducts() {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, kind, category, description, price, audience, benefits, features, url, brand_profile_id, image_asset_ids, is_active, updated_at")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name")
      if (isMissingSchema(error)) return []
      if (error) throw new RepositoryError("List products", error)
      return ((data ?? []) as ProductRow[]).map(productFromRow).filter((p): p is Product => p !== null)
    },

    async saveProduct(product) {
      const { data, error } = await supabase
        .from("products")
        .upsert({
          id: product.id,
          organization_id: organizationId,
          name: product.name,
          kind: product.kind,
          category: product.category,
          description: product.description,
          price: product.price,
          audience: product.audience,
          benefits: product.benefits,
          features: product.features,
          url: product.url,
          brand_profile_id: product.brandProfileId,
          image_asset_ids: product.imageAssetIds,
          is_active: product.isActive,
          created_by: userId,
        })
        .select("id, name, kind, category, description, price, audience, benefits, features, url, brand_profile_id, image_asset_ids, is_active, updated_at")
        .single()
      if (isMissingSchema(error)) {
        throw new RepositoryError("Save product", { message: "the products table doesn't exist yet. Run the latest Supabase migration (products_brand_style)" })
      }
      if (error) throw new RepositoryError("Save product", error)
      const saved = productFromRow(data as ProductRow)
      if (!saved) throw new RepositoryError("Save product", { message: "the saved product could not be read back" })
      return saved
    },

    async deleteProduct(id) {
      check(
        "Delete product",
        await supabase
          .from("products")
          .update({ deleted_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listConversations() {
      const rows = check(
        "List conversations",
        await supabase
          .from("conversations")
          .select("id, title, updated_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(50)
      ) as { id: string; title: string; updated_at: string }[]
      return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, isSample: false }))
    },

    async getConversation(id) {
      const conversation = check(
        "Load conversation",
        await supabase
          .from("conversations")
          .select("id, title, updated_at")
          .eq("organization_id", organizationId)
          .eq("id", id)
          .maybeSingle()
      ) as { id: string; title: string; updated_at: string } | null
      if (!conversation) return null
      const messages = check(
        "Load messages",
        await supabase
          .from("messages")
          .select("id, role, content, metadata, created_at")
          .eq("conversation_id", id)
          .order("created_at")
      ) as { id: string; role: "user" | "assistant"; content: string; metadata: { run?: StoredMessage["run"] }; created_at: string }[]
      return {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updated_at,
        isSample: false,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          createdAt: m.created_at,
          run: m.metadata?.run ?? null,
        })),
      }
    },

    async createConversation(title) {
      const row = check(
        "Create conversation",
        await supabase
          .from("conversations")
          .insert({ organization_id: organizationId, created_by: userId, title })
          .select("id, title, updated_at")
          .single()
      ) as { id: string; title: string; updated_at: string }
      return { id: row.id, title: row.title, updatedAt: row.updated_at, isSample: false }
    },

    async appendMessage(conversationId, message) {
      check(
        "Save message",
        await supabase.from("messages").insert({
          id: message.id,
          organization_id: organizationId,
          conversation_id: conversationId,
          role: message.role,
          content: message.text,
          metadata: message.run ? { run: message.run } : {},
          created_by: message.role === "user" ? userId : null,
        })
      )
      check(
        "Touch conversation",
        await supabase
          .from("conversations")
          .update({ updated_at: message.createdAt })
          .eq("id", conversationId)
      )
    },

    async listApprovals() {
      const rows = check(
        "List approvals",
        await supabase
          .from("approval_requests")
          .select(APPROVAL_COLUMNS)
          .eq("organization_id", organizationId)
          .in("status", ["pending", "approved", "changes_requested"])
          .order("created_at", { ascending: false })
          .limit(50)
      ) as unknown as ApprovalRow[]
      return rows.map(approvalFromRow)
    },

    async createApprovalRequest(input) {
      let version = 1
      if (input.previousVersionId) {
        const prev = check(
          "Load previous approval version",
          await supabase
            .from("approval_requests")
            .select("id, version, status")
            .eq("organization_id", organizationId)
            .eq("id", input.previousVersionId)
            .maybeSingle()
        ) as { id: string; version: number; status: ApprovalStatus } | null
        if (prev) {
          version = prev.version + 1
          await supabase
            .from("approval_requests")
            .update({ status: "superseded" })
            .eq("organization_id", organizationId)
            .eq("id", prev.id)
        }
      }
      const payloadHash = await hashPayload(input.payload)
      const inserted = check(
        "Create approval request",
        await supabase
          .from("approval_requests")
          .insert({
            organization_id: organizationId,
            version,
            previous_version_id: input.previousVersionId ?? null,
            action_type: input.actionType,
            title: input.title,
            connected_account_id: input.connectedAccountId ?? null,
            payload: input.payload,
            payload_hash: payloadHash,
            financial_impact: input.financialImpact ?? null,
            requested_by_agent: input.requestedByAgent ?? null,
            requested_by: userId,
            status: "pending",
          })
          .select(APPROVAL_COLUMNS)
          .single()
      ) as unknown as ApprovalRow
      return approvalFromRow(inserted)
    },

    async decideApproval(id, decision, note, actorId) {
      const row = check(
        "Load approval",
        await supabase
          .from("approval_requests")
          .select(APPROVAL_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("id", id)
          .single()
      ) as unknown as ApprovalRow
      const request: ApprovalRequest = {
        id: row.id,
        version: row.version,
        previousVersionId: null,
        actionType: row.action_type,
        connectedAccountId: null,
        payload: row.payload,
        payloadHash: row.payload_hash,
        financialImpact: row.financial_impact,
        requestedByAgent: row.requested_by_agent,
        status: row.status,
        decidedBy: null,
        decidedAt: null,
        decisionNote: row.decision_note,
      }
      const next = transition(request, decisionToStatus(decision), {
        by: actorId,
        at: new Date().toISOString(),
        note: note ?? undefined,
      })
      const updated = check(
        "Record approval decision",
        await supabase
          .from("approval_requests")
          .update({
            status: next.status,
            decided_by: actorId,
            decided_at: next.decidedAt,
            decision_note: next.decisionNote,
          })
          .eq("id", id)
          .eq("status", row.status)
          .select(APPROVAL_COLUMNS)
          .single()
      ) as unknown as ApprovalRow
      return approvalFromRow(updated)
    },

    async getNextApprovalVersionId(id) {
      const row = check(
        "Load newer approval version",
        await supabase
          .from("approval_requests")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("previous_version_id", id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
      ) as { id: string } | null
      return row?.id ?? null
    },

    async getApprovalRequest(id) {
      const row = check(
        "Load approval request",
        await supabase
          .from("approval_requests")
          .select("id, version, previous_version_id, action_type, connected_account_id, payload, payload_hash, financial_impact, requested_by_agent, status, decided_by, decided_at, decision_note")
          .eq("organization_id", organizationId)
          .eq("id", id)
          .maybeSingle()
      ) as {
        id: string
        version: number
        previous_version_id: string | null
        action_type: ExternalActionType
        connected_account_id: string | null
        payload: Record<string, unknown>
        payload_hash: string
        financial_impact: FinancialImpact | null
        requested_by_agent: string | null
        status: ApprovalStatus
        decided_by: string | null
        decided_at: string | null
        decision_note: string | null
      } | null
      if (!row) return null
      return {
        id: row.id,
        version: row.version,
        previousVersionId: row.previous_version_id,
        actionType: row.action_type,
        connectedAccountId: row.connected_account_id,
        payload: row.payload,
        payloadHash: row.payload_hash,
        financialImpact: row.financial_impact,
        requestedByAgent: row.requested_by_agent,
        status: row.status,
        decidedBy: row.decided_by,
        decidedAt: row.decided_at,
        decisionNote: row.decision_note,
      }
    },

    async setApprovalExecutionStatus(id, from, to) {
      if (!canTransition(from, to)) {
        throw new ApprovalError(`Cannot move approval from "${from}" to "${to}"`, "invalid_transition")
      }
      // RLS only lets members set decision states; execution states belong to the engine.
      const admin = requireAdmin("Update approval execution status")
      const rows = check(
        "Update approval execution status",
        await admin
          .from("approval_requests")
          .update({ status: to })
          .eq("organization_id", organizationId)
          .eq("id", id)
          .eq("status", from)
          .select("id")
      ) as { id: string }[]
      return rows.length > 0
    },

    async listCampaigns() {
      const rows = check(
        "List campaigns",
        await supabase
          .from("campaigns")
          .select(CAMPAIGN_COLUMNS)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(100)
      ) as CampaignRow[]
      return rows.flatMap((row) => campaignFromRow(row) ?? [])
    },

    async getCampaign(id) {
      const row = check(
        "Load campaign",
        await supabase
          .from("campaigns")
          .select(CAMPAIGN_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle()
      ) as CampaignRow | null
      return row ? campaignFromRow(row) : null
    },

    async saveCampaign(campaign) {
      await upsertOwned(
        "campaigns",
        campaign.id,
        {
          name: campaign.name,
          objective: campaign.objective,
          audience: campaign.audience,
          channels: campaign.channels,
          start_date: campaign.startDate,
          end_date: campaign.endDate,
          budget_paise: Math.round(campaign.budgetInr * 100),
          landing_page_url: campaign.landingPageUrl || null,
          conversion_goal: campaign.conversionGoal || null,
          kpis: campaign.kpis,
          status: campaign.status,
          brand_profile_id: campaign.brandProfileId,
        },
        "Save campaign"
      )
      return { ...campaign, updatedAt: new Date().toISOString() }
    },

    async deleteCampaign(id) {
      check(
        "Delete campaign",
        await supabase
          .from("campaigns")
          .update({ deleted_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listConnectedAccounts() {
      const rows = check(
        "List connected accounts",
        await supabase
          .from("connected_accounts")
          .select("id, provider, external_account_id, display_name, scopes, status, token_expires_at, last_synced_at, last_error, updated_at")
          .eq("organization_id", organizationId)
          // Disconnected accounts that still have publishing history are kept as "revoked".
          .neq("status", "revoked")
          .order("updated_at", { ascending: false })
      ) as {
        id: string
        provider: string
        external_account_id: string
        display_name: string
        scopes: string[]
        status: ConnectionStatus
        token_expires_at: string | null
        last_synced_at: string | null
        last_error: string | null
        updated_at: string
      }[]
      const dbAccounts = rows.map(
        (r): ConnectedAccountView => ({
          id: r.id,
          provider: r.provider,
          externalAccountId: r.external_account_id,
          displayName: r.display_name,
          scopes: r.scopes ?? [],
          status: r.status,
          tokenExpiresAt: r.token_expires_at,
          lastSyncedAt: r.last_synced_at,
          lastError: r.last_error,
          updatedAt: r.updated_at,
        })
      )
      const localAccounts = listLocalConnectedAccounts(organizationId)
      const seen = new Set(dbAccounts.map((a) => `${a.provider}:${a.externalAccountId}`))
      return [
        ...dbAccounts,
        ...localAccounts.filter((a) => !seen.has(`${a.provider}:${a.externalAccountId}`)),
      ]
    },

    async saveConnectedAccount(input) {
      const env = serverEnv()
      const now = new Date().toISOString()
      const dbProvider = input.provider === "meta_ads" ? "meta" : input.provider

      if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(
          publicEnv.NEXT_PUBLIC_SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } }
        )
        const { data: row, error: accErr } = await admin
          .from("connected_accounts")
          .upsert(
            {
              organization_id: organizationId,
              provider: dbProvider,
              external_account_id: input.externalAccountId,
              display_name: input.displayName,
              scopes: input.scopes,
              status: input.status,
              token_expires_at: input.tokenExpiresAt ?? null,
              last_synced_at: now,
              last_error: input.lastError ?? null,
              connected_by: userId,
            },
            { onConflict: "organization_id,provider,external_account_id" }
          )
          .select("id")
          .single()

        // Never fall back to the local store here: on a serverless host it is
        // per-instance memory, so the connection would vanish on the next request.
        if (accErr || !row) {
          console.error("[tangent] saving connected account failed:", accErr?.message)
          throw new RepositoryError("Save connected account", {
            message: accErr?.message ?? "the database returned no row",
          })
        }
        {
          if (input.accessTokenCiphertext) {
            const { error: credError } = await admin.rpc("store_integration_credential", {
              p_connected_account_id: row.id,
              p_access_token_ciphertext: input.accessTokenCiphertext,
              p_refresh_token_ciphertext: input.refreshTokenCiphertext ?? null,
              p_key_version: input.keyVersion ?? 1,
            })
            if (credError) {
              // Without the stored token the account can't publish, so don't show it as healthy.
              console.error("[tangent] storing integration credential failed:", credError.message)
              await admin
                .from("connected_accounts")
                .update({ status: "error", last_error: "The access token could not be stored in the credential vault. Reconnect the account." })
                .eq("organization_id", organizationId)
                .eq("id", row.id)
              throw new RepositoryError("Store access token", {
                message: `${credError.message}. Run the latest Supabase migration (store_integration_credential), then reconnect.`,
              })
            }
          }
          if (input.provider === "meta_ads" || input.provider === "meta" || input.provider === "google_ads") {
            await admin.from("ad_accounts").upsert(
              {
                organization_id: organizationId,
                connected_account_id: row.id,
                provider: dbProvider,
                external_account_id: input.externalAccountId,
                name: input.displayName,
                currency: "INR",
                daily_spend_limit_paise:
                  input.dailySpendLimitInr !== undefined && input.dailySpendLimitInr !== null
                    ? Math.round(input.dailySpendLimitInr * 100)
                    : 250_000,
                monthly_spend_limit_paise:
                  input.monthlySpendLimitInr !== undefined && input.monthlySpendLimitInr !== null
                    ? Math.round(input.monthlySpendLimitInr * 100)
                    : 5_000_000,
                status: input.status === "active" ? "active" : "paused",
              },
              { onConflict: "organization_id,provider,external_account_id" }
            )
          }
          return {
            id: row.id,
            provider: dbProvider,
            externalAccountId: input.externalAccountId,
            displayName: input.displayName,
            scopes: input.scopes,
            status: input.status,
            tokenExpiresAt: input.tokenExpiresAt ?? null,
            lastSyncedAt: now,
            lastError: input.lastError ?? null,
            updatedAt: now,
          }
        }
      }

      if (process.env.NODE_ENV === "production") {
        throw new RepositoryError("Save connected account", {
          message: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server, so connections can't be stored",
        })
      }
      // Local development without a service-role key only.
      return saveLocalConnectedAccount(
        organizationId,
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
      removeLocalConnectedAccount(organizationId, id)
      const admin = adminClient()
      if (!admin) return
      const { error: deleteError } = await admin
        .from("connected_accounts")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", id)
      if (!deleteError) return

      // Publishing history (publishing_jobs) keeps the row from being deleted.
      // Retire it instead: hidden from the app, unusable, and its token removed.
      console.warn("[tangent] connected account kept for history, marking revoked:", deleteError.message)
      check(
        "Disconnect account",
        await admin
          .from("connected_accounts")
          .update({ status: "revoked", last_error: "Disconnected by a workspace member." })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
      const { error: credError } = await admin.rpc("delete_integration_credential", { p_connected_account_id: id })
      if (credError) console.error("[tangent] removing the stored token failed:", credError.message)
    },

    async getConnectedAccountCredential(id) {
      const local = getLocalConnectedAccountCredential(organizationId, id)
      if (local) return local
      // Confirm the account belongs to this workspace (RLS) before reading the vault.
      const owned = check(
        "Load connected account",
        await supabase.from("connected_accounts").select("id").eq("organization_id", organizationId).eq("id", id).maybeSingle()
      ) as { id: string } | null
      if (!owned) return null
      const admin = requireAdmin("Load integration credential")
      const rows = check(
        "Load integration credential",
        await admin.rpc("get_integration_credential", { p_connected_account_id: id })
      ) as { access_token_ciphertext: string; refresh_token_ciphertext: string | null; key_version: number }[] | null
      const row = rows?.[0] ?? null
      if (!row) return null
      return {
        accessTokenCiphertext: row.access_token_ciphertext,
        refreshTokenCiphertext: row.refresh_token_ciphertext,
        keyVersion: Number(row.key_version),
      }
    },

    async recordPublishing(input) {
      // Published/failed content states are reserved for the publishing engine (service role).
      const admin = requireAdmin("Record publishing result")
      const item = input.contentItem
      check(
        "Save published content item",
        await admin.from("content_items").upsert({
          id: item.id,
          organization_id: organizationId,
          created_by: userId,
          title: item.title,
          platform: item.platform,
          format: item.format,
          caption: item.caption,
          hashtags: item.hashtags,
          scheduled_for: item.scheduledFor,
          status: item.status,
          creative_project_id: item.creativeProjectId,
          media_asset_ids: item.mediaAssetIds,
          review_note: item.reviewNote,
          approval_request_id: input.approvalRequestId,
        })
      )
      const { data: account } = await admin
        .from("connected_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", input.connectedAccountId)
        .maybeSingle()
      // Accounts kept only in the local integration store have no row to reference.
      if (!account) return
      check(
        "Record publishing job",
        await admin.from("publishing_jobs").insert({
          organization_id: organizationId,
          content_item_id: item.id,
          connected_account_id: input.connectedAccountId,
          approval_request_id: input.approvalRequestId,
          status: input.status,
          scheduled_for: new Date().toISOString(),
          attempts: 1,
          external_post_id: input.externalPostId,
          last_error: input.lastError,
        })
      )
    },

    async listPublishingJobs() {
      const rows = check(
        "List publishing jobs",
        await supabase
          .from("publishing_jobs")
          .select("id, content_item_id, connected_account_id, approval_request_id, status, scheduled_for, attempts, external_post_id, last_error, updated_at, content_items(title, platform), connected_accounts(display_name)")
          .eq("organization_id", organizationId)
          .order("scheduled_for", { ascending: false })
          .limit(50)
      ) as unknown as {
        id: string
        content_item_id: string
        connected_account_id: string
        approval_request_id: string
        status: PublishingJobStatus
        scheduled_for: string
        attempts: number
        external_post_id: string | null
        last_error: string | null
        updated_at: string
        content_items: { title: string; platform: string } | null
        connected_accounts: { display_name: string } | null
      }[]
      return rows.map(
        (r): PublishingJobView => ({
          id: r.id,
          contentItemId: r.content_item_id,
          contentTitle: r.content_items?.title ?? "Untitled post",
          platform: r.content_items?.platform ?? "instagram",
          connectedAccountId: r.connected_account_id,
          accountName: r.connected_accounts?.display_name ?? "Connected account",
          approvalRequestId: r.approval_request_id,
          status: r.status,
          scheduledFor: r.scheduled_for,
          attempts: Number(r.attempts),
          externalPostId: r.external_post_id,
          lastError: r.last_error,
          updatedAt: r.updated_at,
        })
      )
    },

    async listAdAccounts() {
      const rows = check(
        "List ad accounts",
        await supabase
          .from("ad_accounts")
          .select("id, connected_account_id, provider, external_account_id, name, currency, daily_spend_limit_paise, monthly_spend_limit_paise, status")
          .eq("organization_id", organizationId)
          .order("created_at")
      ) as {
        id: string
        connected_account_id: string
        provider: string
        external_account_id: string
        name: string
        currency: string
        daily_spend_limit_paise: number | string | null
        monthly_spend_limit_paise: number | string | null
        status: string
      }[]
      const dbAdAccounts = rows.map(
        (r): AdAccountView => ({
          id: r.id,
          connectedAccountId: r.connected_account_id,
          provider: r.provider,
          externalAccountId: r.external_account_id,
          name: r.name,
          currency: r.currency.trim() || "INR",
          dailySpendLimitInr: r.daily_spend_limit_paise !== null ? Math.round(Number(r.daily_spend_limit_paise) / 100) : null,
          monthlySpendLimitInr: r.monthly_spend_limit_paise !== null ? Math.round(Number(r.monthly_spend_limit_paise) / 100) : null,
          status: r.status,
        })
      )
      const localAdAccounts = listLocalAdAccounts(organizationId)
      const seen = new Set(dbAdAccounts.map((a) => `${a.provider}:${a.externalAccountId}`))
      return [
        ...dbAdAccounts,
        ...localAdAccounts.filter((a) => !seen.has(`${a.provider}:${a.externalAccountId}`)),
      ]
    },

    async updateAdAccountLimits(id, limits) {
      if (updateLocalAdAccountLimits(organizationId, id, limits)) {
        return
      }
      check(
        "Update ad account spend limits",
        await supabase
          .from("ad_accounts")
          .update({
            daily_spend_limit_paise: limits.dailySpendLimitInr !== null ? Math.round(limits.dailySpendLimitInr * 100) : null,
            monthly_spend_limit_paise: limits.monthlySpendLimitInr !== null ? Math.round(limits.monthlySpendLimitInr * 100) : null,
          })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listAnalyticsEvents({ from, to }) {
      const rows = check(
        "List analytics events",
        await supabase
          .from("analytics_events")
          .select("id, source, entity_type, entity_id, metric, value, occurred_on, granularity, is_estimate")
          .eq("organization_id", organizationId)
          .gte("occurred_on", from.slice(0, 10))
          .lte("occurred_on", to.slice(0, 10))
          .order("occurred_on", { ascending: true })
          .limit(2000)
      ) as {
        id: number
        source: string
        entity_type: string
        entity_id: string | null
        metric: string
        value: number | string
        occurred_on: string
        granularity: AnalyticsEventRecord["granularity"]
        is_estimate: boolean
      }[]
      return rows.map(
        (r): AnalyticsEventRecord => ({
          id: String(r.id),
          source: r.source,
          entityType: r.entity_type,
          entityId: r.entity_id,
          metric: r.metric,
          value: Number(r.value),
          occurredOn: r.occurred_on,
          granularity: r.granularity,
          isEstimate: r.is_estimate,
        })
      )
    },

    async listAssets({ search, limit }) {
      let query = supabase
        .from("media_assets")
        .select(ASSET_COLUMNS)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit)
      const term = search?.replace(/[^\p{L}\p{N} _-]/gu, "").trim()
      if (term) query = query.ilike("name", `%${term}%`)
      const rows = check("List assets", await query) as AssetRow[]
      return assetsFromRows(rows)
    },

    async uploadAsset(asset) {
      const id = crypto.randomUUID()
      const path = `${organizationId}/${id}.${extensionFor(asset.mimeType)}`
      const { error: uploadError } = await media().upload(path, asset.bytes, { contentType: asset.mimeType, upsert: false })
      if (uploadError) throw new RepositoryError("Upload file", uploadError)
      const row = check(
        "Save asset",
        await supabase
          .from("media_assets")
          .insert({
            id,
            organization_id: organizationId,
            kind: "image",
            source: asset.source,
            storage_path: path,
            mime_type: asset.mimeType,
            size_bytes: asset.bytes.byteLength,
            width: asset.width,
            height: asset.height,
            name: asset.name,
            tags: asset.tags,
            generation: asset.generation,
            created_by: userId,
          })
          .select(ASSET_COLUMNS)
          .single()
      ) as AssetRow
      const [saved] = await assetsFromRows([row])
      return saved!
    },

    async deleteAsset(id) {
      check(
        "Delete asset",
        await supabase
          .from("media_assets")
          .update({ deleted_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async resolveAssetUrls(ids) {
      if (ids.length === 0) return {}
      const rows = check(
        "Resolve assets",
        await supabase.from("media_assets").select("id, storage_path").eq("organization_id", organizationId).in("id", ids)
      ) as { id: string; storage_path: string }[]
      const urls = await signPaths(rows.map((r) => r.storage_path))
      return Object.fromEntries(
        rows.flatMap((r) => {
          const url = urls.get(r.storage_path)
          return url ? [[r.id, url]] : []
        })
      )
    },

    async listCreativeProjects() {
      const rows = check(
        "List creative projects",
        await supabase
          .from("creative_projects")
          .select("id, name, objective, platform, format, brand_profile_id, status, document, brief, updated_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(100)
      ) as CreativeRow[]
      return rows.flatMap((row) => {
        const project = creativeFromRow(row)
        if (!project) return []
        const { document, brief: _brief, ...summary } = project
        return [{ ...summary, preview: { ...document, pages: document.pages.slice(0, 1) } }]
      })
    },

    async getCreativeProject(id) {
      const row = check(
        "Load creative project",
        await supabase
          .from("creative_projects")
          .select("id, name, objective, platform, format, brand_profile_id, status, document, brief, updated_at")
          .eq("organization_id", organizationId)
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle()
      ) as CreativeRow | null
      return row ? creativeFromRow(row) : null
    },

    async saveCreativeProject(project) {
      await upsertOwned(
        "creative_projects",
        project.id,
        {
          name: project.name,
          objective: project.objective,
          platform: project.platform,
          format: project.formatId,
          brand_profile_id: project.brandProfileId,
          status: project.status,
          document: project.document,
          brief: project.brief,
        },
        "Save creative project"
      )
      return { ...project, updatedAt: new Date().toISOString() }
    },

    async deleteCreativeProject(id) {
      check(
        "Delete creative project",
        await supabase
          .from("creative_projects")
          .update({ deleted_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listContentItems({ from, to }) {
      const base = () =>
        supabase.from("content_items").select(CONTENT_COLUMNS).eq("organization_id", organizationId).is("deleted_at", null)
      const [scheduled, unscheduled] = await Promise.all([
        base().gte("scheduled_for", from).lt("scheduled_for", to).order("scheduled_for"),
        base().is("scheduled_for", null).order("updated_at", { ascending: false }).limit(50),
      ])
      const rows = [
        ...(check("List scheduled content", scheduled) as ContentRow[]),
        ...(check("List unscheduled content", unscheduled) as ContentRow[]),
      ]
      return rows.flatMap((row) => contentFromRow(row) ?? [])
    },

    async getContentItem(id) {
      const row = check(
        "Load content item",
        await supabase
          .from("content_items")
          .select(CONTENT_COLUMNS)
          .eq("organization_id", organizationId)
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle()
      ) as ContentRow | null
      return row ? contentFromRow(row) : null
    },

    async saveContentItem(item) {
      await upsertOwned(
        "content_items",
        item.id,
        {
          title: item.title,
          platform: item.platform,
          format: item.format,
          caption: item.caption,
          hashtags: item.hashtags,
          scheduled_for: item.scheduledFor,
          status: item.status,
          creative_project_id: item.creativeProjectId,
          media_asset_ids: item.mediaAssetIds,
          review_note: item.reviewNote,
        },
        "Save content item"
      )
      return { ...item, updatedAt: new Date().toISOString() }
    },

    async deleteContentItem(id) {
      check(
        "Delete content item",
        await supabase
          .from("content_items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", id)
      )
    },

    async listMembers() {
      const [members, invitations] = await Promise.all([
        supabase
          .from("memberships")
          .select("id, role, users(full_name, email)")
          .eq("organization_id", organizationId)
          .order("created_at"),
        supabase
          .from("invitations")
          .select("id, email, role")
          .eq("organization_id", organizationId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()),
      ])
      const memberRows = check("List members", members) as unknown as {
        id: string
        role: Role
        users: { full_name: string | null; email: string } | null
      }[]
      // Invitations are only visible to members.manage; others get an empty list.
      const inviteRows = (invitations.data ?? []) as { id: string; email: string; role: Role }[]
      return [
        ...memberRows.map((m): MemberView => ({
          id: m.id,
          name: m.users?.full_name || m.users?.email.split("@")[0] || "Member",
          email: m.users?.email ?? "",
          role: m.role,
          status: "active",
        })),
        ...inviteRows.map((i): MemberView => ({ id: i.id, name: i.email.split("@")[0] ?? i.email, email: i.email, role: i.role, status: "invited" })),
      ]
    },

    async createInvitation(email, role, tokenHash) {
      check(
        "Create invitation",
        await supabase.from("invitations").insert({
          organization_id: organizationId,
          email,
          role,
          token_hash: tokenHash,
          invited_by: userId,
        })
      )
    },

    async recordAgentRun(run) {
      check(
        "Record agent run",
        await supabase.from("agent_runs").insert({
          id: run.runId,
          organization_id: organizationId,
          conversation_id: run.conversationId,
          triggered_by: userId,
          status: run.status,
          intent: run.intent,
          task_type: run.taskType,
          model: run.model,
          input_tokens: run.usage.inputTokens,
          output_tokens: run.usage.outputTokens,
          error: run.error,
          started_at: run.startedAt,
          completed_at: run.completedAt,
        })
      )
      if (run.tasks.length === 0) return
      check(
        "Record agent tasks",
        await supabase.from("agent_tasks").insert(
          run.tasks.map((task) => ({
            organization_id: organizationId,
            agent_run_id: run.runId,
            sequence: task.sequence,
            agent_id: task.agentId,
            title: task.title,
            instruction: task.instruction,
            status: task.status,
            output: task.output,
            error: task.error ? { message: task.error } : null,
            started_at: run.startedAt,
            completed_at: run.completedAt,
          }))
        )
      )
    },

    async recordAudit(entry) {
      check(
        "Write audit log",
        await supabase.rpc("log_audit_event", {
          p_organization_id: organizationId,
          p_action: entry.action,
          p_entity_type: entry.entityType,
          p_entity_id: entry.entityId,
          p_summary: entry.summary,
          p_metadata: entry.metadata ?? {},
          p_actor_type: entry.actor.type,
          p_agent_id: entry.actor.type === "agent" ? entry.actor.id : null,
        })
      )
    },

    async listAudit(limit) {
      const rows = check(
        "List audit log",
        await supabase
          .from("audit_logs")
          .select("id, actor_type, actor_id, action, entity_type, entity_id, summary, metadata, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(limit)
      ) as {
        id: number
        actor_type: "user" | "agent" | "system"
        actor_id: string | null
        action: string
        entity_type: string
        entity_id: string | null
        summary: string
        metadata: Record<string, unknown>
        created_at: string
      }[]
      return rows.map(
        (row): AuditRecord => ({
          id: String(row.id),
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          summary: row.summary,
          actor: { type: row.actor_type, id: row.actor_id },
          metadata: row.metadata,
          createdAt: row.created_at,
        })
      )
    },

    async recordUsage(key, quantity, metadata) {
      check(
        "Record usage",
        await supabase.rpc("record_usage", {
          p_organization_id: organizationId,
          p_key: key,
          p_quantity: quantity,
          p_agent_run_id: null,
          p_metadata: metadata ?? {},
        })
      )
    },
  }
}
