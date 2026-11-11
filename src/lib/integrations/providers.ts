export type IntegrationCategory = "ai" | "social" | "advertising" | "search" | "automation" | "payments"

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ai: "AI providers",
  social: "Social media",
  advertising: "Advertising",
  search: "Search & analytics",
  automation: "Automation",
  payments: "Payments",
}

export interface IntegrationProviderInfo {
  id: string
  name: string
  category: IntegrationCategory
  description: string
  capabilities: string[]
  /** Server env vars holding the app credentials. Never sent to the browser. */
  envVars: string[]
  /** Phase in which the OAuth connector / adapter ships. */
  connectorPhase: number
  /** True when Tangent itself uses the credentials directly (no per-workspace OAuth). */
  serverOnly: boolean
}

export const INTEGRATION_PROVIDERS: IntegrationProviderInfo[] = [
  { id: "openai", name: "OpenAI", category: "ai", description: "GPT models for every agent, with structured outputs. Fails over to Anthropic.", capabilities: ["Agent reasoning", "Structured outputs", "Image generation (Phase 3)"], envVars: ["OPENAI_API_KEY"], connectorPhase: 2, serverOnly: true },
  { id: "anthropic", name: "Anthropic", category: "ai", description: "Claude models for every agent, with structured outputs. Fails over to OpenAI.", capabilities: ["Agent reasoning", "Structured outputs"], envVars: ["ANTHROPIC_API_KEY"], connectorPhase: 2, serverOnly: true },
  { id: "instagram", name: "Instagram", category: "social", description: "Publish posts, reels and stories; read insights (via Meta).", capabilities: ["Publishing", "Scheduling", "Insights"], envVars: ["META_APP_ID", "META_APP_SECRET"], connectorPhase: 4, serverOnly: false },
  { id: "facebook", name: "Facebook Pages", category: "social", description: "Manage pages, publish posts and read page insights.", capabilities: ["Publishing", "Scheduling", "Insights"], envVars: ["META_APP_ID", "META_APP_SECRET"], connectorPhase: 4, serverOnly: false },
  { id: "youtube", name: "YouTube", category: "social", description: "Upload Shorts and videos; read channel analytics.", capabilities: ["Uploads", "Channel analytics"], envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], connectorPhase: 4, serverOnly: false },
  { id: "linkedin", name: "LinkedIn", category: "social", description: "Company page publishing and analytics.", capabilities: ["Publishing", "Analytics"], envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], connectorPhase: 6, serverOnly: false },
  { id: "tiktok", name: "TikTok", category: "social", description: "Video publishing and creator analytics.", capabilities: ["Publishing", "Analytics"], envVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], connectorPhase: 6, serverOnly: false },
  { id: "meta_ads", name: "Meta Ads", category: "advertising", description: "Campaigns, ad sets and ads across Facebook and Instagram.", capabilities: ["Campaign drafts", "Approval-gated launches", "Spend limits", "Performance"], envVars: ["META_APP_ID", "META_APP_SECRET"], connectorPhase: 5, serverOnly: false },
  { id: "google_ads", name: "Google Ads", category: "advertising", description: "Search and Performance Max campaigns.", capabilities: ["Campaign drafts", "Approval-gated launches", "Spend limits", "Performance"], envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"], connectorPhase: 5, serverOnly: false },
  { id: "search_console", name: "Google Search Console", category: "search", description: "Real search queries, clicks and rankings for SEO Studio.", capabilities: ["Search performance", "Indexing status"], envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], connectorPhase: 5, serverOnly: false },
  { id: "n8n", name: "n8n", category: "automation", description: "Trigger custom automation workflows from approved actions.", capabilities: ["Workflow triggers", "Webhooks"], envVars: ["N8N_BASE_URL", "N8N_API_KEY"], connectorPhase: 5, serverOnly: true },
  { id: "razorpay", name: "Razorpay", category: "payments", description: "Tangent subscription billing (never ad spend).", capabilities: ["Subscriptions", "Invoices", "Webhooks"], envVars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], connectorPhase: 6, serverOnly: true },
]

export type IntegrationStatus =
  /** Credentials present and the adapter is in use. */
  | "credentials_set"
  /** Credentials present but the connector has not shipped yet. */
  | "awaiting_connector"
  | "not_configured"

export interface IntegrationStatusView extends IntegrationProviderInfo {
  status: IntegrationStatus
  missingEnvVars: string[]
}
