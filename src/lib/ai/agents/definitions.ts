export const AGENT_IDS = [
  "marketing_strategist",
  "copywriter",
  "graphic_designer",
  "market_research",
  "brand_strategist",
  "video_creator",
  "seo_specialist",
  "social_media_manager",
  "performance_marketer",
  "growth_marketer",
  "marketing_analyst",
] as const
export type AgentId = (typeof AGENT_IDS)[number]

/** Agents with a working task handler. The planner can only assign these. */
export const ACTIVE_AGENT_IDS = [
  "marketing_strategist",
  "copywriter",
  "graphic_designer",
  "market_research",
  "brand_strategist",
  "video_creator",
  "seo_specialist",
  "social_media_manager",
  "performance_marketer",
  "growth_marketer",
  "marketing_analyst",
] as const satisfies readonly AgentId[]
export type ActiveAgentId = (typeof ACTIVE_AGENT_IDS)[number]

export type ToolId =
  | "business_context.read"
  | "brand_profile.read"
  | "analytics.read"
  | "content.draft"
  | "campaign.draft"
  | "creative.brief"
  | "image.generate"
  | "approval.request"

export type OperationScope = "read" | "create" | "execute"

export interface AgentDefinition {
  id: AgentId
  name: string
  shortName: string
  status: "active" | "planned"
  phase: number
  summary: string
  responsibilities: string[]
  tools: ToolId[]
  /** Highest operation class the agent may perform. Execute always needs approval. */
  maxScope: OperationScope
  limits: { maxOutputTokens: number; maxCallsPerRun: number }
}

export const AGENTS: Record<AgentId, AgentDefinition> = {
  marketing_strategist: {
    id: "marketing_strategist",
    name: "Marketing Strategist",
    shortName: "Strategist",
    status: "active",
    phase: 2,
    summary: "Turns business context and goals into positioning, plans and campaign strategy.",
    responsibilities: [
      "Marketing strategies and 30-day plans",
      "Campaign structures and channel mix",
      "Budget allocation recommendations",
      "Business intelligence profiles",
    ],
    tools: ["business_context.read", "brand_profile.read", "campaign.draft"],
    maxScope: "create",
    limits: { maxOutputTokens: 6000, maxCallsPerRun: 2 },
  },
  copywriter: {
    id: "copywriter",
    name: "Copywriter",
    shortName: "Copywriter",
    status: "active",
    phase: 2,
    summary: "Writes on-brand captions, ad copy, headlines and CTAs for every platform.",
    responsibilities: [
      "Social captions and hashtags",
      "Ad headlines and descriptions",
      "Campaign messaging variants",
      "Brand voice compliance",
    ],
    tools: ["business_context.read", "brand_profile.read", "content.draft"],
    maxScope: "create",
    limits: { maxOutputTokens: 5000, maxCallsPerRun: 2 },
  },
  graphic_designer: {
    id: "graphic_designer",
    name: "Graphic Designer",
    shortName: "Designer",
    status: "active",
    phase: 2,
    summary: "Develops creative concepts, visual directions and generation-ready image prompts.",
    responsibilities: [
      "Creative concepts per platform and format",
      "Visual direction using brand colours",
      "Image generation prompts",
      "Layout and copy-overlay guidance",
    ],
    tools: ["business_context.read", "brand_profile.read", "creative.brief", "image.generate"],
    maxScope: "create",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  market_research: {
    id: "market_research",
    name: "Market Research Agent",
    shortName: "Research",
    status: "active",
    phase: 5,
    summary: "Researches competitors, audiences and market trends.",
    responsibilities: ["Competitor monitoring", "Audience research", "Trend discovery"],
    tools: ["business_context.read"],
    maxScope: "read",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  brand_strategist: {
    id: "brand_strategist",
    name: "Brand Strategist",
    shortName: "Brand",
    status: "active",
    phase: 3,
    summary: "Builds and maintains brand positioning, voice and messaging frameworks.",
    responsibilities: ["Brand voice development", "Messaging frameworks", "Brand compliance reviews"],
    tools: ["business_context.read", "brand_profile.read"],
    maxScope: "create",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  video_creator: {
    id: "video_creator",
    name: "Video Creator",
    shortName: "Video",
    status: "active",
    phase: 3,
    summary: "Scripts, storyboards and produces short-form video.",
    responsibilities: ["Reel and Shorts scripts", "Storyboards", "Video generation and editing"],
    tools: ["business_context.read", "brand_profile.read"],
    maxScope: "create",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  seo_specialist: {
    id: "seo_specialist",
    name: "SEO Specialist",
    shortName: "SEO",
    status: "active",
    phase: 5,
    summary: "Audits websites, researches keywords and plans SEO content.",
    responsibilities: ["Website audits", "Keyword research", "Meta tags", "Blog planning"],
    tools: ["business_context.read"],
    maxScope: "create",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  social_media_manager: {
    id: "social_media_manager",
    name: "Social Media Manager",
    shortName: "Social",
    status: "active",
    phase: 4,
    summary: "Plans calendars, schedules posts and manages publishing (with approval).",
    responsibilities: ["Content calendars", "Scheduling", "Publishing requests", "Engagement tracking"],
    tools: ["business_context.read", "content.draft", "approval.request"],
    maxScope: "execute",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  performance_marketer: {
    id: "performance_marketer",
    name: "Performance Marketing Specialist",
    shortName: "Performance",
    status: "active",
    phase: 5,
    summary: "Structures, budgets and optimises paid campaigns (spend requires approval).",
    responsibilities: ["Ad campaign structures", "Audience planning", "Budget pacing", "A/B tests"],
    tools: ["business_context.read", "analytics.read", "campaign.draft", "approval.request"],
    maxScope: "execute",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  growth_marketer: {
    id: "growth_marketer",
    name: "Growth Marketer",
    shortName: "Growth",
    status: "active",
    phase: 5,
    summary: "Finds growth loops, funnel improvements and retention opportunities.",
    responsibilities: ["Funnel analysis", "Retention campaigns", "Referral programmes"],
    tools: ["business_context.read", "analytics.read"],
    maxScope: "create",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
  marketing_analyst: {
    id: "marketing_analyst",
    name: "Marketing Analyst",
    shortName: "Analyst",
    status: "active",
    phase: 5,
    summary: "Analyses cross-channel performance and explains what is working and why.",
    responsibilities: ["Performance summaries", "Attribution analysis", "Anomaly detection"],
    tools: ["business_context.read", "analytics.read"],
    maxScope: "read",
    limits: { maxOutputTokens: 4000, maxCallsPerRun: 2 },
  },
}
