import {
  ChartLine,
  Clapperboard,
  Compass,
  Fingerprint,
  MousePointerClick,
  Palette,
  PenLine,
  Radar,
  Rocket,
  SearchCheck,
  Share2,
} from "lucide-react"

import { AGENTS, type ActiveAgentId } from "@/lib/ai/agents/definitions"
import { cn } from "@/lib/utils"

const AGENT_ICONS: Record<ActiveAgentId, typeof Compass> = {
  marketing_strategist: Compass,
  copywriter: PenLine,
  graphic_designer: Palette,
  market_research: Radar,
  brand_strategist: Fingerprint,
  video_creator: Clapperboard,
  seo_specialist: SearchCheck,
  social_media_manager: Share2,
  performance_marketer: MousePointerClick,
  growth_marketer: Rocket,
  marketing_analyst: ChartLine,
}

export function AgentAvatar({ agentId, className }: { agentId: ActiveAgentId; className?: string }) {
  const Icon = AGENT_ICONS[agentId]
  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border bg-brand-subtle text-brand-emphasis", className)}
      title={AGENTS[agentId].name}
    >
      <Icon className="size-3.5" />
    </span>
  )
}
