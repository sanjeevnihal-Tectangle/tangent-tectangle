import { z } from "zod"

import { EXTERNAL_ACTION_TYPES } from "@/lib/approvals/engine"
import { ACTIVE_AGENT_IDS } from "@/lib/ai/agents/definitions"

/*
 * Structured-output schemas. Every field is required so they can be used as
 * strict JSON schemas with the model provider; "not applicable" is expressed
 * with empty strings/arrays rather than optional fields.
 */

export const TASK_TYPES = [
  "strategy",
  "content_creation",
  "creative_design",
  "campaign_planning",
  "analysis",
  "research",
  "advertising",
  "seo",
  "general",
] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const executionPlanSchema = z.object({
  intent: z.string().describe("One sentence restating what the user wants"),
  taskType: z.enum(TASK_TYPES),
  steps: z
    .array(
      z.object({
        agent: z.enum(ACTIVE_AGENT_IDS),
        title: z.string().describe("Short imperative title, e.g. 'Draft 10 Instagram captions'"),
        instruction: z.string().describe("Detailed instruction for the agent"),
      })
    )
    .min(1)
    .max(4),
  externalActions: z
    .array(
      z.object({
        actionType: z.enum(EXTERNAL_ACTION_TYPES),
        platform: z.string(),
        description: z.string(),
      })
    )
    .describe("External actions the user asked for (publishing, launching ads, spending). Never executed without approval."),
  limitations: z
    .array(z.string())
    .describe("Parts of the request Tangent cannot fulfil yet, e.g. missing live data or unavailable agents"),
})
export type ExecutionPlan = z.infer<typeof executionPlanSchema>

export const strategyOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  objectives: z.array(z.object({ objective: z.string(), kpi: z.string(), target: z.string() })),
  pillars: z.array(
    z.object({ name: z.string(), description: z.string(), exampleIdeas: z.array(z.string()) })
  ),
  channelPlan: z.array(
    z.object({
      channel: z.string(),
      role: z.string(),
      budgetSharePercent: z.number(),
      cadence: z.string(),
    })
  ),
  timeline: z.array(z.object({ period: z.string(), focus: z.string(), actions: z.array(z.string()) })),
  risks: z.array(z.string()),
  nextSteps: z.array(z.string()),
})
export type StrategyOutput = z.infer<typeof strategyOutputSchema>

export const copyOutputSchema = z.object({
  brief: z.string(),
  variants: z
    .array(
      z.object({
        platform: z.string(),
        format: z.string(),
        headline: z.string(),
        body: z.string(),
        callToAction: z.string(),
        hashtags: z.array(z.string()),
        suggestedDate: z.string().describe("ISO date (YYYY-MM-DD) or empty string"),
      })
    )
    .min(1)
    .max(30),
  notes: z.array(z.string()),
})
export type CopyOutput = z.infer<typeof copyOutputSchema>

export const creativeOutputSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string(),
        platform: z.string(),
        format: z.string(),
        aspectRatio: z.string(),
        visualDirection: z.string(),
        composition: z.string(),
        colorUsage: z.array(z.string()),
        copyOverlay: z.string(),
        imagePrompt: z.string(),
      })
    )
    .min(1)
    .max(6),
  notes: z.array(z.string()),
})
export type CreativeOutput = z.infer<typeof creativeOutputSchema>

export const seoOutputSchema = z.object({
  summary: z.string(),
  keywords: z
    .array(
      z.object({
        keyword: z.string(),
        intent: z.enum(["informational", "commercial", "transactional", "local"]),
        estimatedMonthlyVolume: z.string().describe("Estimated range e.g. '1,200–2,400 / mo (AI estimate)'"),
        difficulty: z.enum(["low", "medium", "high"]),
        targetPage: z.string(),
      })
    )
    .min(1)
    .max(20),
  metaSuggestions: z
    .array(
      z.object({
        pageName: z.string(),
        slug: z.string(),
        titleTag: z.string().describe("30-60 characters"),
        metaDescription: z.string().describe("120-160 characters"),
        h1: z.string(),
      })
    )
    .max(8),
  blogTopics: z
    .array(
      z.object({
        title: z.string(),
        primaryKeyword: z.string(),
        outline: z.array(z.string()),
      })
    )
    .max(10),
  technicalChecks: z.array(z.string()),
})
export type SeoOutput = z.infer<typeof seoOutputSchema>

export const adsOutputSchema = z.object({
  campaignName: z.string(),
  platform: z.enum(["meta_ads", "google_ads"]),
  objective: z.string(),
  recommendedDailyBudgetInr: z.number(),
  targetLocations: z.string(),
  targetAudience: z.string(),
  adSets: z
    .array(
      z.object({
        name: z.string(),
        audienceSegment: z.string(),
        budgetSharePercent: z.number(),
        placements: z.array(z.string()),
      })
    )
    .min(1)
    .max(5),
  headlines: z.array(z.string()).min(1).max(10),
  descriptions: z.array(z.string()).min(1).max(6),
  callToAction: z.string(),
  abTestHypothesis: z.string(),
  estimatedBenchmarksNote: z.string().describe("Explicitly labelled as industry benchmark estimates"),
})
export type AdsOutput = z.infer<typeof adsOutputSchema>

export const researchOutputSchema = z.object({
  marketSummary: z.string(),
  competitorBattlecards: z
    .array(
      z.object({
        competitor: z.string(),
        positioning: z.string(),
        strengths: z.array(z.string()),
        weaknesses: z.array(z.string()),
        ourWedge: z.string().describe("How we win against this competitor"),
      })
    )
    .max(8),
  positioningOpenings: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        suggestedCampaignHook: z.string(),
      })
    )
    .max(6),
  audienceTrends: z.array(z.string()),
})
export type ResearchOutput = z.infer<typeof researchOutputSchema>

export const analyticsOutputSchema = z.object({
  headline: z.string(),
  executiveSummary: z.string(),
  highlights: z.array(z.object({ metric: z.string(), observation: z.string(), status: z.enum(["positive", "neutral", "attention"]) })),
  anomaliesAndRisks: z.array(z.string()),
  recommendations: z.array(
    z.object({
      action: z.string(),
      expectedImpact: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    })
  ),
})
export type AnalyticsOutput = z.infer<typeof analyticsOutputSchema>

export const videoOutputSchema = z.object({
  title: z.string(),
  platform: z.enum(["Instagram Reel", "YouTube Short", "Facebook Reel"]),
  totalDurationSeconds: z.number(),
  hook: z.string().describe("First 3 seconds visual + verbal hook"),
  scenes: z
    .array(
      z.object({
        sceneNumber: z.number(),
        durationSeconds: z.number(),
        visualDirection: z.string(),
        voiceoverOrDialogue: z.string(),
        onScreenText: z.string(),
      })
    )
    .min(2)
    .max(8),
  audioDirection: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  callToAction: z.string(),
})
export type VideoOutput = z.infer<typeof videoOutputSchema>

export type AgentOutput =
  | { kind: "strategy"; data: StrategyOutput }
  | { kind: "copy"; data: CopyOutput }
  | { kind: "creative"; data: CreativeOutput }
  | { kind: "seo"; data: SeoOutput }
  | { kind: "ads"; data: AdsOutput }
  | { kind: "research"; data: ResearchOutput }
  | { kind: "analytics"; data: AnalyticsOutput }
  | { kind: "video"; data: VideoOutput }
