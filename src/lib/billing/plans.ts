export const PLAN_IDS = ["starter", "growth", "professional", "agency"] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const ENTITLEMENT_KEYS = [
  "ai_credits_monthly",
  "image_generations_monthly",
  "video_generations_monthly",
  "storage_gb",
  "connected_accounts",
  "team_members",
  "brand_profiles",
  "scheduled_posts_monthly",
] as const
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number]

/** `null` means unlimited or contract-defined (Agency). */
export type EntitlementLimits = Record<EntitlementKey, number | null>

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Monthly price in paise. `null` = custom pricing. */
  monthlyPricePaise: number | null
  description: string
  entitlements: EntitlementLimits
}

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  ai_credits_monthly: "AI credits",
  image_generations_monthly: "Image generations",
  video_generations_monthly: "Video generations",
  storage_gb: "Storage (GB)",
  connected_accounts: "Connected accounts",
  team_members: "Team members",
  brand_profiles: "Brand profiles",
  scheduled_posts_monthly: "Scheduled posts",
}

/**
 * Default plan catalogue. Production reads the same shape from the `plans` and
 * `plan_entitlements` tables (seeded from these values) so limits can change
 * without a deploy. Never compare against plan ids elsewhere — call
 * `checkEntitlement` instead.
 */
export const DEFAULT_PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPricePaise: 1_999_00,
    description: "For single-location businesses getting started with AI marketing.",
    entitlements: {
      ai_credits_monthly: 500,
      image_generations_monthly: 60,
      video_generations_monthly: 0,
      storage_gb: 5,
      connected_accounts: 3,
      team_members: 2,
      brand_profiles: 1,
      scheduled_posts_monthly: 60,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPricePaise: 4_999_00,
    description: "For growing businesses running multi-channel campaigns.",
    entitlements: {
      ai_credits_monthly: 2_000,
      image_generations_monthly: 250,
      video_generations_monthly: 10,
      storage_gb: 25,
      connected_accounts: 8,
      team_members: 5,
      brand_profiles: 3,
      scheduled_posts_monthly: 300,
    },
  },
  professional: {
    id: "professional",
    name: "Professional",
    monthlyPricePaise: 9_999_00,
    description: "For established brands and in-house marketing teams.",
    entitlements: {
      ai_credits_monthly: 6_000,
      image_generations_monthly: 800,
      video_generations_monthly: 40,
      storage_gb: 100,
      connected_accounts: 20,
      team_members: 15,
      brand_profiles: 10,
      scheduled_posts_monthly: 1_200,
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPricePaise: null,
    description: "Custom limits for agencies managing multiple client businesses.",
    entitlements: {
      ai_credits_monthly: null,
      image_generations_monthly: null,
      video_generations_monthly: null,
      storage_gb: null,
      connected_accounts: null,
      team_members: null,
      brand_profiles: null,
      scheduled_posts_monthly: null,
    },
  },
}

/** AI credits: 1 credit per started 1,000 tokens, minimum 1 per run. */
export function creditsForTokens(totalTokens: number): number {
  return Math.max(1, Math.ceil(totalTokens / 1000))
}

/** Upper-bound credit reservation checked before a run starts. */
export const ESTIMATED_CREDITS_PER_RUN = 15

export interface EntitlementCheck {
  allowed: boolean
  limit: number | null
  used: number
  remaining: number | null
}

export function checkEntitlement(
  limits: EntitlementLimits,
  key: EntitlementKey,
  used: number,
  increment = 1
): EntitlementCheck {
  const limit = limits[key]
  if (limit === null) {
    return { allowed: true, limit: null, used, remaining: null }
  }
  const remaining = Math.max(0, limit - used)
  return { allowed: used + increment <= limit, limit, used, remaining }
}
