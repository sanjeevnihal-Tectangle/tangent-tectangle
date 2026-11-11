import { cn } from "@/lib/utils"

/**
 * Official Tangent chevron ribbon mark:
 * - Upper wing & lower-left tail in brand gold (#FBBF0E)
 * - Main lower-right bar in `currentColor` (charcoal/black on light surfaces, white on dark surfaces)
 */
const TOP_GOLD_WING = "M7.5 1.8 29.5 12.2 21.5 15.4 7.5 8.8Z"
const BOTTOM_LEFT_GOLD_TAIL = "M2.5 23 7.5 21 7.5 28 2.5 30Z"
const MAIN_DARK_BAR = "M9.5 20.2 29.5 12.2 29.5 19.2 9.5 27.2Z"

export function TangentMark({
  className,
  title = "Tangent",
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("size-6 shrink-0", className)}
    >
      <path d={TOP_GOLD_WING} fill="#FBBF0E" />
      <path d={BOTTOM_LEFT_GOLD_TAIL} fill="#FBBF0E" />
      <path d={MAIN_DARK_BAR} fill="currentColor" />
    </svg>
  )
}

export function TangentLogo({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        className
      )}
    >
      <TangentMark className={cn("size-6", markClassName)} title="" />
      <span className="font-heading text-[1.15rem] leading-none font-bold tracking-tight">
        Tangent
      </span>
      <span className="sr-only">Tangent</span>
    </span>
  )
}
