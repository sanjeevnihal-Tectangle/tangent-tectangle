import { FlaskConical } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function DemoBadge({
  label = "Demo data",
  detail = "Sample data for illustration. It is not from your connected accounts.",
  className,
}: {
  label?: string
  detail?: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" className={cn("cursor-default gap-1", className)} tabIndex={0}>
          <FlaskConical />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{detail}</TooltipContent>
    </Tooltip>
  )
}
