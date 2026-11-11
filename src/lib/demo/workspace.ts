import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/auth/permissions"
import type { CurrentUser, UsageSnapshot, WorkspaceSummary } from "@/lib/domain/workspace"
import { DEFAULT_PLANS } from "@/lib/billing/plans"

export const DEMO_WORKSPACE_SLUG = "demo"

export const DEMO_WORKSPACE: WorkspaceSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: DEMO_WORKSPACE_SLUG,
  name: "Saffron & Sage",
  industry: "Restaurants & food",
  planId: "growth",
}

export const DEMO_USER: CurrentUser = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Ananya Rao",
  email: "ananya@saffronandsage.example",
  avatarUrl: null,
}

export const DEMO_ROLE = "owner" as const
export const DEMO_PERMISSIONS = [...DEFAULT_ROLE_PERMISSIONS[DEMO_ROLE]]

const growth = DEFAULT_PLANS.growth.entitlements

export const DEMO_USAGE: UsageSnapshot[] = [
  { key: "ai_credits_monthly", used: 1284, limit: growth.ai_credits_monthly },
  { key: "image_generations_monthly", used: 96, limit: growth.image_generations_monthly },
  { key: "video_generations_monthly", used: 2, limit: growth.video_generations_monthly },
  { key: "storage_gb", used: 7, limit: growth.storage_gb },
  { key: "connected_accounts", used: 0, limit: growth.connected_accounts },
  { key: "team_members", used: 4, limit: growth.team_members },
  { key: "brand_profiles", used: 2, limit: growth.brand_profiles },
  { key: "scheduled_posts_monthly", used: 41, limit: growth.scheduled_posts_monthly },
]

export const DEMO_MEMBERS = [
  { id: "m1", name: "Ananya Rao", email: "ananya@saffronandsage.example", role: "owner" as const, status: "active" as const },
  { id: "m2", name: "Kabir Mehta", email: "kabir@saffronandsage.example", role: "marketer" as const, status: "active" as const },
  { id: "m3", name: "Ishita Nair", email: "ishita@saffronandsage.example", role: "designer" as const, status: "active" as const },
  { id: "m4", name: "Rohan Desai", email: "rohan@saffronandsage.example", role: "analyst" as const, status: "invited" as const },
]
