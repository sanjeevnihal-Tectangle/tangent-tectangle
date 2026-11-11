import { addDays, seededRandom, toISODate } from "@/lib/demo/random"

export interface DailyMetrics {
  date: string
  reach: number
  impressions: number
  engagement: number
  websiteVisitors: number
  leads: number
  conversions: number
  adSpend: number
  attributedRevenue: number
}

export const DEMO_CHANNELS = [
  { id: "instagram", label: "Instagram", reachShare: 0.46, engagementShare: 0.58, spendShare: 0.34, conversionShare: 0.31 },
  { id: "facebook", label: "Facebook", reachShare: 0.22, engagementShare: 0.16, spendShare: 0.16, conversionShare: 0.14 },
  { id: "google_ads", label: "Google Ads", reachShare: 0.14, engagementShare: 0.04, spendShare: 0.42, conversionShare: 0.38 },
  { id: "youtube", label: "YouTube", reachShare: 0.12, engagementShare: 0.17, spendShare: 0.08, conversionShare: 0.05 },
  { id: "organic_search", label: "Organic search", reachShare: 0.06, engagementShare: 0.05, spendShare: 0, conversionShare: 0.12 },
] as const

const HISTORY_DAYS = 180

/** 180 days of deterministic daily metrics ending today (restaurant seasonality). */
export function buildDemoDailyMetrics(today: Date): DailyMetrics[] {
  const random = seededRandom(20261110)
  const series: DailyMetrics[] = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const day = date.getDay()
    const weekend = day === 0 || day === 6 ? 1.32 : day === 5 ? 1.15 : 1
    const trend = 1 + ((HISTORY_DAYS - i) / HISTORY_DAYS) * 0.38
    const festive = i >= 1 && i <= 12 ? 1.45 - Math.abs(i - 3) * 0.035 : 1
    const noise = () => 0.88 + random() * 0.24
    const factor = weekend * trend * festive

    const reach = Math.round(14200 * factor * noise())
    const impressions = Math.round(reach * (1.75 + random() * 0.35))
    const engagement = Math.round(reach * 0.052 * noise())
    const websiteVisitors = Math.round(1180 * factor * noise())
    const leads = Math.round(websiteVisitors * 0.041 * noise())
    const conversions = Math.round(leads * 0.62 * noise())
    const adSpend = Math.round(3600 * trend * (festive > 1 ? 1.3 : 1) * noise())
    const attributedRevenue = Math.round(adSpend * (3.4 + random() * 1.4) * (festive > 1 ? 1.2 : 1))

    series.push({
      date: toISODate(date),
      reach,
      impressions,
      engagement,
      websiteVisitors,
      leads,
      conversions,
      adSpend,
      attributedRevenue,
    })
  }
  return series
}

export interface DemoCampaign {
  id: string
  name: string
  objective: string
  status: "draft" | "planning" | "production" | "review" | "approved" | "active" | "completed"
  channels: string[]
  budget: number
  spent: number
  startDate: string
  endDate: string
  conversions: number
  roas: number | null
}

export function buildDemoCampaigns(today: Date): DemoCampaign[] {
  const d = (offset: number) => toISODate(addDays(today, offset))
  return [
    { id: "c1", name: "Winter Comfort Menu Launch", objective: "Drive dine-in footfall", status: "active", channels: ["Instagram", "Facebook", "Google Ads"], budget: 60000, spent: 27400, startDate: d(-6), endDate: d(24), conversions: 312, roas: 4.1 },
    { id: "c2", name: "Wedding Season Catering", objective: "Generate catering leads", status: "active", channels: ["Google Ads", "Meta Ads"], budget: 120000, spent: 71800, startDate: d(-21), endDate: d(39), conversions: 86, roas: 6.3 },
    { id: "c3", name: "Weekday Lunch Combos", objective: "Lift weekday delivery orders", status: "review", channels: ["Instagram", "WhatsApp"], budget: 25000, spent: 0, startDate: d(5), endDate: d(35), conversions: 0, roas: null },
    { id: "c4", name: "Christmas & New Year Brunch", objective: "Pre-book festive brunch tables", status: "planning", channels: ["Instagram", "YouTube", "Google Ads"], budget: 90000, spent: 0, startDate: d(20), endDate: d(52), conversions: 0, roas: null },
    { id: "c5", name: "Diwali Festive Thali", objective: "Festive orders and gifting", status: "completed", channels: ["Instagram", "Facebook", "Google Ads"], budget: 75000, spent: 74100, startDate: d(-34), endDate: d(-1), conversions: 1204, roas: 5.2 },
  ]
}

export interface DemoContentItem {
  id: string
  title: string
  platform: "Instagram" | "Facebook" | "YouTube"
  format: string
  scheduledFor: string
  status: "draft" | "in_review" | "approved" | "scheduled"
  campaign: string | null
}

export function buildDemoUpcomingContent(today: Date): DemoContentItem[] {
  const at = (offset: number, hour: number) => {
    const date = addDays(today, offset)
    date.setHours(hour, 0, 0, 0)
    return date.toISOString()
  }
  return [
    { id: "p1", title: "Winter menu reveal — 5-dish carousel", platform: "Instagram", format: "Carousel", scheduledFor: at(1, 12), status: "scheduled", campaign: "Winter Comfort Menu Launch" },
    { id: "p2", title: "Chef Arjun's slow-cooked nihari", platform: "Instagram", format: "Reel", scheduledFor: at(2, 18), status: "approved", campaign: "Winter Comfort Menu Launch" },
    { id: "p3", title: "Catering for 50–500 guests", platform: "Facebook", format: "Image post", scheduledFor: at(3, 11), status: "in_review", campaign: "Wedding Season Catering" },
    { id: "p4", title: "Behind the tandoor — 60s story", platform: "YouTube", format: "Short", scheduledFor: at(4, 19), status: "draft", campaign: null },
    { id: "p5", title: "Weekday lunch combo ₹299", platform: "Instagram", format: "Story", scheduledFor: at(6, 10), status: "draft", campaign: "Weekday Lunch Combos" },
  ]
}

export interface DemoActivity {
  id: string
  agent: string
  summary: string
  minutesAgo: number
  kind: "created" | "analysed" | "flagged" | "planned"
}

export const DEMO_ACTIVITIES: DemoActivity[] = [
  { id: "a1", agent: "Copywriter", summary: "Drafted 6 captions for the Winter Comfort Menu carousel", minutesAgo: 18, kind: "created" },
  { id: "a2", agent: "Graphic Designer", summary: "Produced 3 visual directions for the Christmas brunch hero creative", minutesAgo: 52, kind: "created" },
  { id: "a3", agent: "Marketing Strategist", summary: "Rebalanced Wedding Catering budget toward Google Search", minutesAgo: 140, kind: "planned" },
  { id: "a4", agent: "Marketing Strategist", summary: "Flagged rising cost per lead on Meta catering ads (+22% WoW)", minutesAgo: 260, kind: "flagged" },
  { id: "a5", agent: "Copywriter", summary: "Wrote 12 Google Ads headlines for weekday lunch combos", minutesAgo: 410, kind: "created" },
]

export interface DemoRecommendation {
  id: string
  title: string
  rationale: string
  impact: "high" | "medium" | "low"
  prompt: string
}

export const DEMO_RECOMMENDATIONS: DemoRecommendation[] = [
  {
    id: "r1",
    title: "Shift ₹8,000 from Meta to Google Search for catering",
    rationale: "Search catering leads convert at 2.4× the Meta rate with a 31% lower cost per lead over the last 14 days.",
    impact: "high",
    prompt: "Prepare a budget reallocation plan for the Wedding Season Catering campaign, moving spend from Meta to Google Search.",
  },
  {
    id: "r2",
    title: "Turn the nihari reel into a 3-part Reels series",
    rationale: "Slow-cook process videos earn 3.1× the average saves. A series builds anticipation ahead of the weekend rush.",
    impact: "medium",
    prompt: "Create a 3-part Instagram Reels series concept and scripts around our slow-cooked winter dishes.",
  },
  {
    id: "r3",
    title: "Open Christmas brunch pre-bookings this week",
    rationale: "Last year's festive brunch sold out 9 days before Christmas. Early-bird messaging captures planners now.",
    impact: "high",
    prompt: "Create a campaign strategy for Christmas & New Year brunch pre-bookings with early-bird messaging.",
  },
]

export const DEMO_NOTIFICATIONS = [
  { id: "n1", title: "2 actions awaiting your approval", detail: "Instagram carousel and a budget increase", minutesAgo: 12, href: "overview#approvals" },
  { id: "n2", title: "Winter Comfort Menu campaign is pacing 8% ahead", detail: "Marketing Strategist", minutesAgo: 95, href: "overview" },
  { id: "n3", title: "Instagram is not connected", detail: "Connect Meta to publish and see real insights", minutesAgo: 600, href: "integrations" },
]
