import { z } from "zod"

export const MARKETING_CHANNELS = [
  "instagram",
  "facebook",
  "youtube",
  "google_search",
  "google_ads",
  "meta_ads",
  "linkedin",
  "whatsapp",
  "email",
  "seo",
  "offline",
] as const
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  google_search: "Google Business Profile",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  email: "Email",
  seo: "SEO / Website",
  offline: "Offline & events",
}

export const BUSINESS_MODELS = ["b2c", "b2b", "d2c", "marketplace", "hybrid"] as const
export const BUSINESS_MODEL_LABELS: Record<(typeof BUSINESS_MODELS)[number], string> = {
  b2c: "B2C — sells to consumers",
  b2b: "B2B — sells to businesses",
  d2c: "D2C — own brand, direct online",
  marketplace: "Marketplace / platform",
  hybrid: "Hybrid",
}

export const INDUSTRIES = [
  "Restaurants & food",
  "Healthcare",
  "Education",
  "Ecommerce & D2C",
  "Logistics",
  "Real estate",
  "Retail",
  "Professional services",
  "Beauty & wellness",
  "Travel & hospitality",
  "Technology & SaaS",
  "Other",
] as const

const trimmed = (max: number) => z.string().trim().max(max)

export const businessProfileSchema = z.object({
  name: trimmed(120).min(2, "Enter your business name"),
  industry: trimmed(80).min(2, "Select an industry"),
  website: z.union([z.literal(""), z.url("Enter a valid URL, including https://")]),
  city: trimmed(80).min(2, "Enter a city"),
  region: trimmed(80),
  country: trimmed(80).min(2),
  description: trimmed(1200).min(20, "Describe the business in at least a sentence or two"),
  productsAndServices: z.array(trimmed(160).min(1)).min(1, "Add at least one product or service").max(30),
  targetAudience: trimmed(800).min(10, "Describe who you sell to"),
  customerSegments: z.array(trimmed(160).min(1)).max(12),
  businessModel: z.enum(BUSINESS_MODELS),
  competitors: z
    .array(z.object({ name: trimmed(120).min(1), website: z.union([z.literal(""), z.url()]) }))
    .max(10),
  objectives: z.array(trimmed(200).min(1)).min(1, "Add at least one objective").max(10),
  monthlyBudgetInr: z.number().int().min(0).max(100_000_000),
  preferredChannels: z.array(z.enum(MARKETING_CHANNELS)).min(1, "Pick at least one channel"),
})

export type BusinessProfile = z.infer<typeof businessProfileSchema>

/** Sections of the AI-generated intelligence profile that users review and approve. */
export const INTELLIGENCE_SECTIONS = [
  "summary",
  "personas",
  "valueProposition",
  "competitorInsights",
  "opportunities",
  "recommendedChannels",
  "strategy",
  "plan30Day",
] as const
export type IntelligenceSection = (typeof INTELLIGENCE_SECTIONS)[number]

export const INTELLIGENCE_SECTION_LABELS: Record<IntelligenceSection, string> = {
  summary: "Business summary",
  personas: "Customer personas",
  valueProposition: "Value proposition",
  competitorInsights: "Competitor insights",
  opportunities: "Marketing opportunities",
  recommendedChannels: "Recommended channels",
  strategy: "Marketing strategy",
  plan30Day: "30-day marketing plan",
}

/**
 * All fields are required (no optionals) so the same schema can be used as a
 * strict structured-output schema for the model.
 */
export const marketingIntelligenceContentSchema = z.object({
  summary: z.string(),
  valueProposition: z.string(),
  personas: z
    .array(
      z.object({
        name: z.string(),
        snapshot: z.string(),
        goals: z.array(z.string()),
        painPoints: z.array(z.string()),
        preferredChannels: z.array(z.string()),
      })
    )
    .max(4),
  competitorInsights: z.array(
    z.object({
      competitor: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      opportunity: z.string(),
    })
  ),
  opportunities: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      impact: z.enum(["high", "medium", "low"]),
    })
  ),
  recommendedChannels: z.array(
    z.object({
      channel: z.string(),
      role: z.string(),
      budgetSharePercent: z.number(),
      rationale: z.string(),
    })
  ),
  strategy: z.object({
    positioning: z.string(),
    pillars: z.array(z.object({ name: z.string(), description: z.string() })),
    objectives: z.array(z.string()),
  }),
  plan30Day: z.array(
    z.object({
      week: z.number().int(),
      theme: z.string(),
      actions: z.array(z.string()),
    })
  ),
})

export type MarketingIntelligenceContent = z.infer<typeof marketingIntelligenceContentSchema>

export const sectionStatusSchema = z.enum(["draft", "approved"])
export type SectionStatus = z.infer<typeof sectionStatusSchema>

export const marketingIntelligenceSchema = z.object({
  content: marketingIntelligenceContentSchema,
  sectionStatus: z.record(z.enum(INTELLIGENCE_SECTIONS), sectionStatusSchema),
  generatedAt: z.string(),
  generatedBy: z.string(),
  isSample: z.boolean(),
})

export type MarketingIntelligence = z.infer<typeof marketingIntelligenceSchema>
