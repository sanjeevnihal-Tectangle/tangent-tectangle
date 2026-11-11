"use client"

import { format, parseISO } from "date-fns"
import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DailyMetrics } from "@/lib/demo/dashboard"
import { formatNumber } from "@/lib/format"

const METRICS = {
  reach: { label: "Reach" },
  engagement: { label: "Engagement" },
  websiteVisitors: { label: "Visitors" },
  conversions: { label: "Conversions" },
} as const
type Metric = keyof typeof METRICS

export function PerformanceChart({ data }: { data: DailyMetrics[] }) {
  const [metric, setMetric] = useState<Metric>("reach")
  const config = {
    [metric]: { label: METRICS[metric].label, color: "var(--chart-1)" },
    previous: { label: "Previous period", color: "var(--chart-5)" },
  } satisfies ChartConfig

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        value={metric}
        onValueChange={(value) => value && setMetric(value as Metric)}
        aria-label="Chart metric"
      >
        {(Object.keys(METRICS) as Metric[]).map((key) => (
          <ToggleGroupItem key={key} value={key} className="px-2.5 text-xs">
            {METRICS[key].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fill-metric" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--color-${metric})`} stopOpacity={0.22} />
              <stop offset="100%" stopColor={`var(--color-${metric})`} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickMargin={8}
            tickFormatter={(value: string) => format(parseISO(value), "d MMM")}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatNumber(value, { compact: true })}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => format(parseISO(String(value)), "EEE, d MMM yyyy")}
                indicator="line"
              />
            }
          />
          <Area
            dataKey={metric}
            type="monotone"
            stroke={`var(--color-${metric})`}
            strokeWidth={1.75}
            fill="url(#fill-metric)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
