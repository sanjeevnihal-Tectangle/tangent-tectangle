import "server-only"

import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { z } from "zod"

import { DEFAULT_ROLE_PERMISSIONS, isRole, type Permission } from "@/lib/auth/permissions"
import { DEFAULT_PLANS, ENTITLEMENT_KEYS, PLAN_IDS, type PlanId } from "@/lib/billing/plans"
import { createDemoRepository } from "@/lib/data/demo-repository"
import { createSupabaseRepository } from "@/lib/data/supabase-repository"
import type { WorkspaceRepository } from "@/lib/data/types"
import {
  DEMO_PERMISSIONS,
  DEMO_ROLE,
  DEMO_USAGE,
  DEMO_USER,
  DEMO_WORKSPACE,
  DEMO_WORKSPACE_SLUG,
} from "@/lib/demo/workspace"
import type { UsageSnapshot, WorkspaceContext, WorkspaceSummary } from "@/lib/domain/workspace"
import { isSupabaseConfigured } from "@/lib/env/public"
import { configuredProviderIds } from "@/lib/ai/provider"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export class PermissionError extends Error {
  constructor(readonly permission: Permission) {
    super(`You don't have permission to do this (${permission})`)
    this.name = "PermissionError"
  }
}

const membershipRowSchema = z.object({
  role: z.string(),
  organizations: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    industry: z.string().nullable(),
    subscriptions: z
      .union([z.object({ plan_id: z.string() }), z.array(z.object({ plan_id: z.string() }))])
      .nullable(),
  }),
})

function planFrom(subscriptions: z.infer<typeof membershipRowSchema>["organizations"]["subscriptions"]): PlanId {
  const planId = Array.isArray(subscriptions) ? subscriptions[0]?.plan_id : subscriptions?.plan_id
  return (PLAN_IDS as readonly string[]).includes(planId ?? "") ? (planId as PlanId) : "starter"
}

interface ResolvedWorkspace {
  context: WorkspaceContext
  repository: WorkspaceRepository
}

const WORKSPACE_CACHE_TTL_MS = 60_000
const WORKSPACE_CACHE = new Map<string, { context: WorkspaceContext; expiresAt: number }>()

/**
 * Clears cached workspace resolution entries so mutations to memberships,
 * brand profiles, connected accounts, or usage reflect immediately.
 */
export function invalidateWorkspaceCache(userId?: string, orgSlug?: string): void {
  if (!userId && !orgSlug) {
    WORKSPACE_CACHE.clear()
    return
  }
  for (const key of WORKSPACE_CACHE.keys()) {
    const [cachedUserId, cachedSlug] = key.split(":")
    if ((!userId || cachedUserId === userId) && (!orgSlug || cachedSlug === orgSlug)) {
      WORKSPACE_CACHE.delete(key)
    }
  }
}

/**
 * Resolves the workspace for the current request from the URL slug and the
 * user's session. Cached per request and across rapid page transitions (60s TTL).
 * Redirects to /login when signed out and 404s when the user is not a member —
 * tenant ids never come from the client.
 */
export const resolveWorkspace = cache(async (orgSlug: string): Promise<ResolvedWorkspace> => {
  const aiConfigured = configuredProviderIds().length > 0

  if (!isSupabaseConfigured()) {
    if (orgSlug !== DEMO_WORKSPACE_SLUG) notFound()
    return {
      context: {
        mode: "demo",
        workspace: DEMO_WORKSPACE,
        workspaces: [DEMO_WORKSPACE],
        user: DEMO_USER,
        role: DEMO_ROLE,
        permissions: DEMO_PERMISSIONS,
        usage: DEMO_USAGE,
        aiConfigured,
      },
      repository: createDemoRepository(),
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id ?? null
  if (!userId) redirect(`/login?next=/w/${encodeURIComponent(orgSlug)}/overview`)

  const cacheKey = `${userId}:${orgSlug}`
  const cached = WORKSPACE_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const context: WorkspaceContext = { ...cached.context, aiConfigured }
    return {
      context,
      repository: createSupabaseRepository(supabase, context.workspace.id, userId),
    }
  }

  const [membershipsResult, profileResult] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, organizations!inner(id, slug, name, industry, subscriptions(plan_id))")
      .eq("user_id", userId)
      .is("organizations.deleted_at", null),
    supabase.from("users").select("id, email, full_name, avatar_url").eq("id", userId).maybeSingle(),
  ])
  if (membershipsResult.error) throw new Error(`Failed to load workspaces: ${membershipsResult.error.message}`)

  const memberships = z.array(membershipRowSchema).parse(membershipsResult.data)
  const workspaces: (WorkspaceSummary & { role: string })[] = memberships.map((m) => ({
    id: m.organizations.id,
    slug: m.organizations.slug,
    name: m.organizations.name,
    industry: m.organizations.industry,
    planId: planFrom(m.organizations.subscriptions),
    role: m.role,
  }))

  const current = workspaces.find((w) => w.slug === orgSlug)
  if (!current || !isRole(current.role)) notFound()

  const profile = profileResult.data as
    | { id: string; email: string; full_name: string | null; avatar_url: string | null }
    | null

  const usage = await loadUsage(supabase, current.id, current.planId)

  const context: WorkspaceContext = {
    mode: "live",
    workspace: { id: current.id, slug: current.slug, name: current.name, industry: current.industry, planId: current.planId },
    workspaces: workspaces.map(({ role: _role, ...w }) => w),
    user: {
      id: userId,
      name: profile?.full_name || profile?.email?.split("@")[0] || "You",
      email: profile?.email ?? "",
      avatarUrl: profile?.avatar_url ?? null,
    },
    role: current.role,
    permissions: [...DEFAULT_ROLE_PERMISSIONS[current.role]],
    usage,
    aiConfigured,
  }

  WORKSPACE_CACHE.set(cacheKey, {
    context,
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
  })

  return {
    context,
    repository: createSupabaseRepository(supabase, current.id, userId),
  }
})

async function loadUsage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  planId: PlanId
): Promise<UsageSnapshot[]> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [usageRows, members, brands, accounts] = await Promise.all([
    supabase
      .from("usage_records")
      .select("key, quantity")
      .eq("organization_id", organizationId)
      .gte("occurred_at", monthStart.toISOString()),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase
      .from("brand_profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase.from("connected_accounts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ])

  const totals = new Map<string, number>()
  for (const row of (usageRows.data ?? []) as { key: string; quantity: number }[]) {
    totals.set(row.key, (totals.get(row.key) ?? 0) + Number(row.quantity))
  }
  totals.set("team_members", members.count ?? 0)
  totals.set("brand_profiles", brands.count ?? 0)
  totals.set("connected_accounts", accounts.count ?? 0)

  const limits = DEFAULT_PLANS[planId].entitlements
  return ENTITLEMENT_KEYS.map((key) => ({ key, used: totals.get(key) ?? 0, limit: limits[key] }))
}

export function requirePermission(context: WorkspaceContext, permission: Permission): void {
  if (!context.permissions.includes(permission)) throw new PermissionError(permission)
}
