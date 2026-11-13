import {
  Blocks,
  Bot,
  CalendarDays,
  ChartLine,
  Compass,
  Fingerprint,
  Package,
  Images,
  LayoutDashboard,
  Megaphone,
  MousePointerClick,
  Palette,
  Radar,
  SearchCheck,
  Settings,
  Share2,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  id: string
  label: string
  /** Path segment under /w/[orgSlug]/ */
  segment: string
  icon: LucideIcon
  description: string
  /** `planned` modules render a roadmap state until their phase ships. */
  status: "available" | "planned"
  phase: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", segment: "overview", icon: LayoutDashboard, description: "Cross-channel marketing performance at a glance", status: "available", phase: 1 },
      { id: "command-centre", label: "AI Command Centre", segment: "command-centre", icon: Sparkles, description: "Brief your AI marketing team and track their work", status: "available", phase: 2 },
      { id: "strategy", label: "Marketing Strategy", segment: "strategy", icon: Compass, description: "Business intelligence profile, personas and strategy", status: "available", phase: 1 },
      { id: "products", label: "Products & Services", segment: "products", icon: Package, description: "What you sell, with a brand kit per product", status: "available", phase: 1 },
    ],
  },
  {
    label: "Create",
    items: [
      { id: "studio", label: "Creative Studio", segment: "studio", icon: Palette, description: "Generate, edit and export on-brand creatives", status: "available", phase: 3 },
      { id: "planner", label: "Content Planner", segment: "planner", icon: CalendarDays, description: "Plan, approve and schedule content on a calendar", status: "available", phase: 4 },
      { id: "assets", label: "Asset Library", segment: "assets", icon: Images, description: "Every image, video and document in one place", status: "available", phase: 3 },
    ],
  },
  {
    label: "Marketing",
    items: [
      { id: "social", label: "Social Media", segment: "social", icon: Share2, description: "Connected accounts, publishing and social insights", status: "available", phase: 4 },
      { id: "campaigns", label: "Campaigns", segment: "campaigns", icon: Megaphone, description: "Plan and run multi-channel campaigns", status: "available", phase: 5 },
      { id: "seo", label: "SEO Studio", segment: "seo", icon: SearchCheck, description: "Audits, keywords and SEO content", status: "available", phase: 5 },
      { id: "ads", label: "Ads Manager", segment: "ads", icon: MousePointerClick, description: "Meta and Google ads with approval-gated spend", status: "available", phase: 5 },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "analytics", label: "Analytics & Insights", segment: "analytics", icon: ChartLine, description: "Cross-platform reporting with clear data sources", status: "available", phase: 5 },
      { id: "competitors", label: "Competitor Intelligence", segment: "competitors", icon: Radar, description: "Track competitors and find openings", status: "available", phase: 5 },
      { id: "brand", label: "Brand Intelligence", segment: "brand", icon: Fingerprint, description: "Brand profiles that every AI output follows", status: "available", phase: 1 },
    ],
  },
  {
    label: "System",
    items: [
      { id: "agents", label: "AI Agents", segment: "agents", icon: Bot, description: "Your AI marketing team, their tools and limits", status: "available", phase: 2 },
      { id: "integrations", label: "Integrations", segment: "integrations", icon: Blocks, description: "Connect marketing platforms and services", status: "available", phase: 1 },
      { id: "team", label: "Team & Members", segment: "team", icon: Users, description: "Members, roles and invitations", status: "available", phase: 1 },
      { id: "settings", label: "Settings", segment: "settings", icon: Settings, description: "Workspace, plan, usage and audit history", status: "available", phase: 1 },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function navItem(id: string): NavItem {
  const item = NAV_ITEMS.find((i) => i.id === id)
  if (!item) throw new Error(`Unknown nav item ${id}`)
  return item
}

export function workspaceHref(orgSlug: string, segment: string): string {
  return `/w/${orgSlug}/${segment}`
}
