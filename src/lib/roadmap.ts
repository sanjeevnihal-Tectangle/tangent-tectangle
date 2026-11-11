export interface ModuleRoadmap {
  capabilities: string[]
  /** What already exists in the foundation that this module builds on. */
  foundations: string[]
  /** External providers the module needs (shown as connection-required). */
  connections: string[]
  /** Suggested Command Centre instruction available today. */
  tryNow: string | null
}

export const MODULE_ROADMAP: Record<string, ModuleRoadmap> = {
  social: {
    capabilities: [
      "Connect Instagram, Facebook and YouTube via official OAuth",
      "Publish and schedule (always approval-gated)",
      "Published posts, engagement and social insights",
      "Publishing error management and retries",
    ],
    foundations: ["Integration Gateway contracts", "connected_accounts + encrypted credentials", "Approval engine with payload hashing"],
    connections: ["Instagram", "Facebook", "YouTube"],
    tryNow: "Create a week of Instagram and Facebook posts for our next promotion.",
  },
  campaigns: {
    capabilities: [
      "Campaign workspace: objective, audience, channels, dates, budget, assets, landing page, KPIs",
      "Lifecycle: Draft → Planning → Production → Review → Approved → Active → Completed",
      "AI strategy, channel mix, creatives, copy and budget allocation",
      "Results analysis",
    ],
    foundations: ["campaigns table with lifecycle enum", "Marketing Strategist agent"],
    connections: [],
    tryNow: "Create a festive campaign across Instagram, Facebook and Google Ads with a ₹50,000 budget.",
  },
  seo: {
    capabilities: ["Website audits and technical checks", "Keyword research and tracking", "Meta titles and descriptions", "Blog planning and SEO content", "Google Search Console data"],
    foundations: ["analytics_events with is_estimate flag (estimates vs real data)"],
    connections: ["Google Search Console"],
    tryNow: "Suggest 10 SEO blog topics for our business with target keywords (label any estimates).",
  },
  ads: {
    capabilities: ["Meta Ads and Google Ads accounts", "Campaign, ad set / ad group creation", "Audience and budget planning", "A/B test recommendations", "Configurable spend limits with approval-gated launches"],
    foundations: ["ad_accounts with spend limits", "ad_campaigns (draft-only for users)", "Approval engine with financial impact"],
    connections: ["Meta Ads", "Google Ads"],
    tryNow: "Prepare a Google Ads campaign with a ₹500 daily budget.",
  },
  analytics: {
    capabilities: ["Reach, impressions, engagement, video views, traffic, leads, conversions", "Spend, CPC, CPM, CPA, ROAS", "Channel and campaign comparisons", "Exportable reports and AI summaries", "Data sources, reporting windows and attribution notes on every chart"],
    foundations: ["analytics_events table", "Overview dashboard components"],
    connections: ["Meta", "Google Analytics", "Google Ads", "YouTube"],
    tryNow: null,
  },
  competitors: {
    capabilities: ["Competitor profiles and monitoring", "Content and offer tracking", "Opportunity alerts"],
    foundations: ["Competitors in the business profile", "Competitor insights in Marketing Strategy"],
    connections: [],
    tryNow: "Based on our competitors, suggest three positioning opportunities.",
  },
}
