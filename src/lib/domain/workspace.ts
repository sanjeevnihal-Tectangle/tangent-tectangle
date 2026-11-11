import type { Permission, Role } from "@/lib/auth/permissions"
import type { EntitlementKey, PlanId } from "@/lib/billing/plans"

/**
 * demo: no Supabase configured — a single sample workspace backed by local
 *       demo storage. Every surface labels its data as demo.
 * live: Supabase configured — authenticated users and real tenant data.
 */
export type AppMode = "demo" | "live"

export interface WorkspaceSummary {
  id: string
  slug: string
  name: string
  industry: string | null
  planId: PlanId
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface UsageSnapshot {
  key: EntitlementKey
  used: number
  limit: number | null
}

/** Serializable workspace context shared with client components. */
export interface WorkspaceContext {
  mode: AppMode
  workspace: WorkspaceSummary
  workspaces: WorkspaceSummary[]
  user: CurrentUser
  role: Role
  permissions: Permission[]
  usage: UsageSnapshot[]
  aiConfigured: boolean
}
