"use client"

import { format, parseISO } from "date-fns"
import { ArrowRight, Bot, CalendarClock, Megaphone, Plus, Sparkles } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { DemoBadge } from "@/components/data/demo-badge"
import { StatCard } from "@/components/data/stat-card"
import { StatusPill } from "@/components/data/status-pill"
import { PageHeader } from "@/components/page/page-header"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApprovalList } from "@/features/approvals/approval-list"
import { PerformanceChart } from "@/features/dashboard/performance-chart"
import type { ApprovalView } from "@/lib/domain/approvals"
import {
  DEMO_CHANNELS,
  type DailyMetrics,
  type DemoActivity,
  type DemoCampaign,
  type DemoContentItem,
  type DemoRecommendation,
} from "@/lib/demo/dashboard"
import {
  formatINR,
  formatMultiplier,
  formatNumber,
  formatPercent,
  minutesAgoLabel,
  percentChange,
} from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days" } as const
type Range = keyof typeof RANGES

type Totals = Omit<DailyMetrics, "date">

function sum(rows: DailyMetrics[]): Totals {
  return rows.reduce<Totals>(
    (acc, row) => ({
      reach: acc.reach + row.reach,
      impressions: acc.impressions + row.impressions,
      engagement: acc.engagement + row.engagement,
      websiteVisitors: acc.websiteVisitors + row.websiteVisitors,
      leads: acc.leads + row.leads,
      conversions: acc.conversions + row.conversions,
      adSpend: acc.adSpend + row.adSpend,
      attributedRevenue: acc.attributedRevenue + row.attributedRevenue,
    }),
    { reach: 0, impressions: 0, engagement: 0, websiteVisitors: 0, leads: 0, conversions: 0, adSpend: 0, attributedRevenue: 0 }
  )
}

const CHANNEL_METRICS = {
  reach: { label: "Reach", share: "reachShare", total: "reach", format: (v: number) => formatNumber(v, { compact: true }) },
  spend: { label: "Spend", share: "spendShare", total: "adSpend", format: (v: number) => formatINR(v, { compact: true }) },
  conversions: { label: "Conversions", share: "conversionShare", total: "conversions", format: (v: number) => formatNumber(v) },
} as const
type ChannelMetric = keyof typeof CHANNEL_METRICS

const PLATFORM_DOT: Record<DemoContentItem["platform"], string> = {
  Instagram: "bg-chart-1",
  Facebook: "bg-info",
  YouTube: "bg-destructive",
}

export interface OverviewData {
  greeting: string
  series: DailyMetrics[]
  campaigns: DemoCampaign[]
  upcoming: DemoContentItem[]
  activities: DemoActivity[]
  recommendations: DemoRecommendation[]
  approvals: ApprovalView[]
}

export function OverviewDashboard({ data }: { data: OverviewData }) {
  const { workspace, user } = useWorkspace()
  const [range, setRange] = useState<Range>("30")
  const [channelMetric, setChannelMetric] = useState<ChannelMetric>("reach")
  const days = Number(range)

  const { current, previous, window } = useMemo(() => {
    const window = data.series.slice(-days)
    const prior = data.series.slice(-days * 2, -days)
    return { current: sum(window), previous: sum(prior), window }
  }, [data.series, days])

  const roas = current.adSpend ? current.attributedRevenue / current.adSpend : 0
  const prevRoas = previous.adSpend ? previous.attributedRevenue / previous.adSpend : 0
  const engagementRate = current.impressions ? current.engagement / current.impressions : 0
  const trend = (key: keyof Totals) => window.map((d) => d[key])
  const pendingApprovals = data.approvals.filter((a) => a.status === "pending").length
  const activeCampaigns = data.campaigns.filter((c) => c.status === "active" || c.status === "review" || c.status === "planning")
  const channel = CHANNEL_METRICS[channelMetric]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.greeting}, ${user.name.split(" ")[0]}`}
        description={
          <>
            Here&apos;s how <span className="font-medium text-foreground">{workspace.name}</span> is performing.
            {pendingApprovals > 0 ? ` ${pendingApprovals} action${pendingApprovals > 1 ? "s" : ""} need${pendingApprovals > 1 ? "" : "s"} your approval.` : ""}
          </>
        }
        meta={<DemoBadge detail="Sample performance data. Connect Meta, Google and YouTube in Integrations to see your real results." />}
        actions={
          <>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Date range">
                <SelectValue>{RANGES[range]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGES) as Range[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {RANGES[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link href={`${workspaceHref(workspace.slug, "command-centre")}?prompt=${encodeURIComponent("Create a campaign strategy for our next promotion.")}`}>
                <Plus /> Create campaign
              </Link>
            </Button>
            <Button asChild variant="brand" size="sm">
              <Link href={workspaceHref(workspace.slug, "command-centre")}>
                <Sparkles /> Ask Tangent AI
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total reach" value={formatNumber(current.reach, { compact: true })} change={percentChange(current.reach, previous.reach)} trend={trend("reach")} />
        <StatCard
          label="Engagement"
          value={formatNumber(current.engagement, { compact: true })}
          change={percentChange(current.engagement, previous.engagement)}
          trend={trend("engagement")}
          hint={`${formatPercent(engagementRate)} of impressions`}
        />
        <StatCard label="Website visitors" value={formatNumber(current.websiteVisitors, { compact: true })} change={percentChange(current.websiteVisitors, previous.websiteVisitors)} trend={trend("websiteVisitors")} />
        <StatCard
          label="Leads / conversions"
          value={`${formatNumber(current.leads)} / ${formatNumber(current.conversions)}`}
          change={percentChange(current.conversions, previous.conversions)}
          trend={trend("conversions")}
        />
        <StatCard label="Ad spend" value={formatINR(current.adSpend, { compact: true })} change={percentChange(current.adSpend, previous.adSpend)} trend={trend("adSpend")} invertChange />
        <StatCard label="ROAS" value={formatMultiplier(roas)} change={percentChange(roas, prevRoas)} hint="Attributed revenue ÷ ad spend" />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Marketing performance</CardTitle>
            <CardDescription>{RANGES[range]} · daily, all channels</CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceChart data={window} />
            <p className="mt-2 text-xs text-muted-foreground">
              Source: sample data. With connected accounts, each metric shows its provider, reporting window and attribution model.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel breakdown</CardTitle>
            <CardDescription>Share of {channel.label.toLowerCase()} by channel</CardDescription>
            <CardAction>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                spacing={0}
                value={channelMetric}
                onValueChange={(v) => v && setChannelMetric(v as ChannelMetric)}
                aria-label="Channel metric"
              >
                {(Object.keys(CHANNEL_METRICS) as ChannelMetric[]).map((key) => (
                  <ToggleGroupItem key={key} value={key} className="px-2 text-xs">
                    {CHANNEL_METRICS[key].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5">
              {DEMO_CHANNELS.map((c) => {
                const share = c[channel.share]
                const value = Math.round(current[channel.total] * share)
                return (
                  <li key={c.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{c.label}</span>
                      <span className="tabular text-muted-foreground">
                        {share === 0 ? "—" : channel.format(value)}
                        <span className="ml-2 inline-block w-10 text-right text-xs">{formatPercent(share, 0)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${share * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-muted-foreground" /> Active campaigns
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={workspaceHref(workspace.slug, "campaigns")}>
                  All campaigns <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 pb-2 font-medium">Campaign</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Budget used</th>
                    <th className="pb-2 text-right font-medium">Conv.</th>
                    <th className="px-4 pb-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.channels.join(" · ")}</p>
                      </td>
                      <td className="py-2.5">
                        <StatusPill kind="campaign" status={c.status} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Progress value={(c.spent / c.budget) * 100} className="h-1 w-20" aria-label={`${c.name} budget used`} />
                          <span className="tabular text-xs text-muted-foreground">
                            {formatINR(c.spent, { compact: true })} / {formatINR(c.budget, { compact: true })}
                          </span>
                        </div>
                      </td>
                      <td className="tabular py-2.5 text-right">{c.conversions ? formatNumber(c.conversions) : "—"}</td>
                      <td className="tabular px-4 py-2.5 text-right">{c.roas ? formatMultiplier(c.roas) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card id="approvals">
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
            <CardDescription>Nothing external happens without your sign-off</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ApprovalList initial={data.approvals} compact />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" /> Upcoming content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.upcoming.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <div className="w-11 shrink-0 rounded-md border py-1 text-center">
                    <p className="text-[0.65rem] text-muted-foreground uppercase">{format(parseISO(item.scheduledFor), "EEE")}</p>
                    <p className="tabular font-heading text-sm font-semibold">{format(parseISO(item.scheduledFor), "d")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("size-1.5 rounded-full", PLATFORM_DOT[item.platform])} aria-hidden />
                      {item.platform} · {item.format} · {format(parseISO(item.scheduledFor), "h:mm a")}
                    </p>
                  </div>
                  <StatusPill kind="content" status={item.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground" /> Recent AI activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-4">
              {data.activities.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[1.3rem] size-2 rounded-full ring-4 ring-card",
                      a.kind === "flagged" ? "bg-warning" : "bg-brand"
                    )}
                    aria-hidden
                  />
                  <p className="text-sm">{a.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.agent} · {minutesAgoLabel(a.minutesAgo)}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" /> AI recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recommendations.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{r.title}</p>
                  <Badge variant={r.impact === "high" ? "brand" : "muted"} className="shrink-0 capitalize">
                    {r.impact}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>
                <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0 text-brand">
                  <Link href={`${workspaceHref(workspace.slug, "command-centre")}?prompt=${encodeURIComponent(r.prompt)}`}>
                    Work on this with Tangent <ArrowRight />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
