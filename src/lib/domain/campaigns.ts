import { z } from "zod"

import { MARKETING_CHANNELS } from "@/lib/domain/business"

export const CAMPAIGN_STATUSES = [
  "draft",
  "planning",
  "production",
  "review",
  "approved",
  "active",
  "completed",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  planning: "Planning",
  production: "Production",
  review: "In review",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
}

export const CAMPAIGN_OBJECTIVES = [
  "Brand awareness & reach",
  "Lead generation",
  "Website traffic",
  "Store footfall & dine-in",
  "Online sales & conversions",
  "Festive promotion",
  "Product or menu launch",
  "Customer retention & repeat orders",
] as const

export const campaignKpiSchema = z.object({
  metric: z.string().trim().min(1, "Enter a metric").max(80),
  target: z.string().trim().min(1, "Enter a target").max(80),
  current: z.string().trim().max(80),
})
export type CampaignKpi = z.infer<typeof campaignKpiSchema>

export const campaignSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2, "Give the campaign a name (at least 2 characters)").max(160),
    objective: z.string().trim().min(2, "Specify the campaign objective").max(160),
    audience: z.string().trim().max(800),
    channels: z.array(z.enum(MARKETING_CHANNELS)).min(1, "Pick at least one channel").max(11),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullable(),
    budgetInr: z.number().int().min(0).max(100_000_000),
    landingPageUrl: z.union([z.literal(""), z.url("Enter a valid URL including https://")]),
    conversionGoal: z.string().trim().max(160),
    kpis: z.array(campaignKpiSchema).max(10),
    status: z.enum(CAMPAIGN_STATUSES),
    brandProfileId: z.string().nullable(),
    updatedAt: z.string(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })

export type Campaign = z.infer<typeof campaignSchema>

