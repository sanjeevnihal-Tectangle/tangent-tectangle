import { z } from "zod"

export const AD_PLATFORMS = ["meta_ads", "google_ads"] as const
export type AdPlatform = (typeof AD_PLATFORMS)[number]

export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta_ads: "Meta Ads (Instagram & Facebook)",
  google_ads: "Google Ads (Search & PMax)",
}

export const AD_OBJECTIVES = [
  "Leads & enquiries",
  "Website conversions",
  "Store visits & local reach",
  "Traffic & clicks",
  "Brand awareness & video views",
  "WhatsApp & call enquiries",
] as const

export interface AdAccountView {
  id: string
  connectedAccountId: string
  provider: string
  externalAccountId: string
  name: string
  currency: string
  dailySpendLimitInr: number | null
  monthlySpendLimitInr: number | null
  status: string
}

export const adCampaignPayloadSchema = z.object({
  platform: z.enum(AD_PLATFORMS),
  name: z.string().trim().min(2, "Enter a campaign name").max(160),
  objective: z.string().trim().min(2, "Select an objective").max(160),
  dailyBudgetInr: z.number().int().min(100, "Minimum daily budget is ₹100").max(10_000_000),
  durationDays: z.number().int().min(1).max(365),
  targetLocations: z.string().trim().min(2, "Enter at least one city or region").max(300),
  targetAudience: z.string().trim().min(5, "Describe target demographics & interests").max(600),
  headlines: z.array(z.string().trim().min(2).max(90)).min(1, "Add at least one headline").max(10),
  descriptions: z.array(z.string().trim().min(5).max(300)).min(1, "Add at least one description").max(6),
  callToAction: z.string().trim().min(2).max(60),
  landingPageUrl: z.union([z.literal(""), z.url("Enter a valid landing page URL")]),
  abTestHypothesis: z.string().trim().max(500),
})

export type AdCampaignPayload = z.infer<typeof adCampaignPayloadSchema>

