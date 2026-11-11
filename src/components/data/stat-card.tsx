import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - min) / range) * 26).toFixed(2)}`)
    .join(" ")
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function StatCard({
  label,
  value,
  change,
  trend,
  invertChange = false,
  hint,
}: {
  label: string
  value: string
  /** Relative change vs previous period, e.g. 0.12 for +12%. */
  change: number | null
  trend?: number[]
  /** For cost metrics a decrease is good. */
  invertChange?: boolean
  hint?: string
}) {
  const positive = change !== null && change > 0.0005
  const negative = change !== null && change < -0.0005
  const good = invertChange ? negative : positive
  const bad = invertChange ? positive : negative
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus

  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border bg-card p-3.5">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="tabular font-heading text-xl font-semibold tracking-tight md:text-[1.4rem]">{value}</p>
        {change !== null ? (
          <span
            className={cn(
              "tabular mb-0.5 inline-flex items-center gap-0.5 text-xs font-medium",
              good && "text-success",
              bad && "text-destructive",
              !good && !bad && "text-muted-foreground"
            )}
            aria-label={`${(change * 100).toFixed(1)}% versus previous period`}
          >
            <Icon className="size-3.5" />
            {Math.abs(change * 100).toFixed(1)}%
          </span>
        ) : null}
      </div>
      {trend ? <Sparkline values={trend} className={good ? "text-success/70" : bad ? "text-destructive/60" : "text-muted-foreground/60"} /> : null}
      {hint ? <p className="text-[0.7rem] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
