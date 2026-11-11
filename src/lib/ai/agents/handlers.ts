import "server-only"

import type { ModelProvider, ModelTier, TokenUsage } from "@/lib/ai/provider"
import { AGENTS, type ActiveAgentId } from "@/lib/ai/agents/definitions"
import {
  adsOutputSchema,
  analyticsOutputSchema,
  copyOutputSchema,
  creativeOutputSchema,
  researchOutputSchema,
  seoOutputSchema,
  strategyOutputSchema,
  videoOutputSchema,
  type AgentOutput,
} from "@/lib/ai/outputs"

export const SHARED_RULES = `You are part of Tangent, an AI marketing department for businesses (primary market: India).
Rules:
- Use the business and brand context provided. Stay strictly on-brand and never use prohibited phrases.
- Use Indian conventions by default: INR (₹, lakh/crore where natural), Indian festivals and seasons, local platforms.
- Never claim you have published, scheduled, launched, sent or spent anything. You only create drafts and plans.
- Never invent performance metrics or present estimates as facts. If live data is unavailable, say so and label estimates.
- Be specific and actionable; avoid generic marketing filler.`

export interface AgentTaskInput {
  userRequest: string
  instruction: string
  businessContext: string
  priorOutputs: string
  today: string
}

interface HandlerResult {
  output: AgentOutput
  usage: TokenUsage
  model: string
}

function buildInput(input: AgentTaskInput): string {
  return [
    `Today: ${input.today}`,
    `## Business context\n${input.businessContext}`,
    `## Original user request\n${input.userRequest}`,
    `## Your task\n${input.instruction}`,
    input.priorOutputs ? `## Outputs from earlier steps (build on these)\n${input.priorOutputs}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

const AGENT_INSTRUCTIONS: Record<ActiveAgentId, { tier: ModelTier; system: string }> = {
  marketing_strategist: {
    tier: "reasoning",
    system: `${SHARED_RULES}

You are the Marketing Strategist. Produce clear, prioritised marketing strategy:
objectives with measurable KPIs, content pillars with concrete ideas, a channel plan whose budget shares sum to 100,
a dated timeline, risks and next steps. Budgets must respect the business's stated monthly budget unless the user specifies one.`,
  },
  copywriter: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the Copywriter. Write platform-native copy that follows the brand voice exactly.
Respect platform conventions (Instagram captions with line breaks and 3–8 relevant hashtags, ad headlines within platform
character limits, YouTube titles under 70 characters). Every variant needs a clear call to action.`,
  },
  graphic_designer: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the Graphic Designer. Develop distinct creative concepts with a precise visual direction, composition,
use of the brand colours (by name and hex), copy overlay and a detailed, generation-ready image prompt
(subject, setting, lighting, lens/style, mood; no text rendered in the image).`,
  },
  market_research: {
    tier: "reasoning",
    system: `${SHARED_RULES}

You are the Market Research Agent. Analyse the competitive landscape, audience behaviours and market openings for the business.
Build sharp competitor battlecards (positioning, strengths, weaknesses and our differentiator wedge) and actionable positioning opportunities.`,
  },
  brand_strategist: {
    tier: "reasoning",
    system: `${SHARED_RULES}

You are the Brand Strategist. Strengthen brand positioning, messaging pillars, tone of voice and brand-building channel plans.
Ensure budget shares in channelPlan sum to 100.`,
  },
  video_creator: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the Video Creator specialising in high-retention Instagram Reels and YouTube Shorts.
Write a scroll-stopping 3-second hook, scene-by-scene storyboard (duration, camera/visual direction, voiceover/dialogue, on-screen text),
audio direction, caption and hashtags.`,
  },
  seo_specialist: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the SEO Specialist. Produce keyword research (always label search volume ranges as AI estimates when Google Search Console is not connected),
SERP-optimised title tags (30–60 chars) and meta descriptions (120–160 chars), high-intent blog outlines and technical SEO checks.`,
  },
  social_media_manager: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the Social Media Manager. Plan platform-native social posts, carousels, community prompts and scheduling sequences with suggested dates, captions, CTAs and hashtags.`,
  },
  performance_marketer: {
    tier: "reasoning",
    system: `${SHARED_RULES}

You are the Performance Marketing Specialist for Meta Ads and Google Ads.
Design conversion-focused ad campaign structures, audience targeting, ad set budget splits summing to 100%, compliant ad headlines (≤ 30 chars for Google Search) and descriptions (≤ 90 chars), and A/B test hypotheses. Always label benchmark expectations as estimates.`,
  },
  growth_marketer: {
    tier: "reasoning",
    system: `${SHARED_RULES}

You are the Growth Marketer. Design acquisition loops, referral mechanics, WhatsApp/email retention journeys and conversion rate experiments. Ensure channelPlan budget shares sum to 100.`,
  },
  marketing_analyst: {
    tier: "fast",
    system: `${SHARED_RULES}

You are the Marketing Analyst. Evaluate marketing performance, channel efficiency, anomalies and attribution notes, and recommend high-priority optimisations.`,
  },
}

export async function runAgentTask(
  provider: ModelProvider,
  agentId: ActiveAgentId,
  input: AgentTaskInput,
  signal?: AbortSignal
): Promise<HandlerResult> {
  const { tier, system } = AGENT_INSTRUCTIONS[agentId]
  const maxOutputTokens = AGENTS[agentId].limits.maxOutputTokens
  const common = { tier, system, input: buildInput(input), maxOutputTokens, signal }

  switch (agentId) {
    case "marketing_strategist":
    case "brand_strategist":
    case "growth_marketer": {
      const result = await provider.generateStructured({ ...common, schema: strategyOutputSchema, schemaName: "strategy" })
      return { output: { kind: "strategy", data: result.data }, usage: result.usage, model: result.model }
    }
    case "copywriter":
    case "social_media_manager": {
      const result = await provider.generateStructured({ ...common, schema: copyOutputSchema, schemaName: "copy" })
      return { output: { kind: "copy", data: result.data }, usage: result.usage, model: result.model }
    }
    case "graphic_designer": {
      const result = await provider.generateStructured({ ...common, schema: creativeOutputSchema, schemaName: "creative" })
      return { output: { kind: "creative", data: result.data }, usage: result.usage, model: result.model }
    }
    case "seo_specialist": {
      const result = await provider.generateStructured({ ...common, schema: seoOutputSchema, schemaName: "seo_plan" })
      return { output: { kind: "seo", data: result.data }, usage: result.usage, model: result.model }
    }
    case "performance_marketer": {
      const result = await provider.generateStructured({ ...common, schema: adsOutputSchema, schemaName: "ads_plan" })
      return { output: { kind: "ads", data: result.data }, usage: result.usage, model: result.model }
    }
    case "market_research": {
      const result = await provider.generateStructured({ ...common, schema: researchOutputSchema, schemaName: "market_research" })
      return { output: { kind: "research", data: result.data }, usage: result.usage, model: result.model }
    }
    case "marketing_analyst": {
      const result = await provider.generateStructured({ ...common, schema: analyticsOutputSchema, schemaName: "analytics_report" })
      return { output: { kind: "analytics", data: result.data }, usage: result.usage, model: result.model }
    }
    case "video_creator": {
      const result = await provider.generateStructured({ ...common, schema: videoOutputSchema, schemaName: "video_script" })
      return { output: { kind: "video", data: result.data }, usage: result.usage, model: result.model }
    }
    default: {
      const unreachable: never = agentId
      throw new Error(`No handler for agent ${String(unreachable)}`)
    }
  }
}

/** Plain-text rendering of an output, used for validation and downstream steps. */
export function outputToText(output: AgentOutput): string {
  switch (output.kind) {
    case "strategy": {
      const d = output.data
      return [
        d.title,
        d.summary,
        ...d.objectives.map((o) => `${o.objective}: ${o.kpi} → ${o.target}`),
        ...d.pillars.map((p) => `${p.name}: ${p.description} (${p.exampleIdeas.join("; ")})`),
        ...d.channelPlan.map((c) => `${c.channel} ${c.budgetSharePercent}% — ${c.role}, ${c.cadence}`),
        ...d.timeline.map((t) => `${t.period}: ${t.focus} — ${t.actions.join("; ")}`),
      ].join("\n")
    }
    case "copy":
      return output.data.variants
        .map((v) => `[${v.platform} ${v.format}] ${v.headline}\n${v.body}\n${v.callToAction}\n${v.hashtags.join(" ")}`)
        .join("\n\n")
    case "creative":
      return output.data.concepts
        .map((c) => `${c.name} (${c.platform} ${c.format}): ${c.visualDirection}. Overlay: ${c.copyOverlay}`)
        .join("\n")
    case "seo":
      return [
        output.data.summary,
        ...output.data.keywords.map((k) => `${k.keyword} (${k.intent}, ${k.estimatedMonthlyVolume}) → ${k.targetPage}`),
        ...output.data.metaSuggestions.map((m) => `${m.pageName}: ${m.titleTag} | ${m.metaDescription}`),
        ...output.data.blogTopics.map((b) => `${b.title} [${b.primaryKeyword}]`),
      ].join("\n")
    case "ads":
      return [
        `${output.data.campaignName} (${output.data.platform}) — ₹${output.data.recommendedDailyBudgetInr}/day`,
        output.data.targetAudience,
        ...output.data.headlines,
        ...output.data.descriptions,
      ].join("\n")
    case "research":
      return [
        output.data.marketSummary,
        ...output.data.competitorBattlecards.map((c) => `${c.competitor}: ${c.ourWedge}`),
        ...output.data.positioningOpenings.map((o) => `${o.title}: ${o.rationale}`),
      ].join("\n")
    case "analytics":
      return [
        output.data.headline,
        output.data.executiveSummary,
        ...output.data.recommendations.map((r) => `${r.action} (${r.expectedImpact})`),
      ].join("\n")
    case "video":
      return [
        `${output.data.title} (${output.data.platform}, ${output.data.totalDurationSeconds}s)`,
        `Hook: ${output.data.hook}`,
        ...output.data.scenes.map((s) => `Scene ${s.sceneNumber} (${s.durationSeconds}s): ${s.visualDirection} | VO: ${s.voiceoverOrDialogue} | Text: ${s.onScreenText}`),
        output.data.caption,
      ].join("\n")
    default: {
      const unreachable: never = output
      throw new Error(`Unknown output ${JSON.stringify(unreachable)}`)
    }
  }
}
