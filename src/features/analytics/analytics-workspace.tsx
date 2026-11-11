"use client"

import { Download, Loader2, Sparkles } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { DemoBadge } from "@/components/data/demo-badge"
import { StatCard } from "@/components/data/stat-card"
import { PageHeader } from "@/components/page/page-header"
import { ConnectionRequired } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generateAnalyticsReport } from "@/features/analytics/actions"
import { PerformanceChart } from "@/features/dashboard/performance-chart"
import type { AnalyticsOutput } from "@/lib/ai/outputs"
import { DEMO_CHANNELS, type DailyMetrics } from "@/lib/demo/dashboard"
import { ANALYTICS_WINDOWS, type AnalyticsEventRecord } from "@/lib/domain/analytics"
import {
  formatINR,
  formatMultiplier,
  formatNumber,
  formatPercent,
  percentChange,
} from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"

type Totals = Omit<DailyMetrics, "date">

function sumMetrics(rows: DailyMetrics[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      reach: acc.reach + r.reach,
      impressions: acc.impressions + r.impressions,
      engagement: acc.engagement + r.engagement,
      websiteVisitors: acc.websiteVisitors + r.websiteVisitors,
      leads: acc.leads + r.leads,
      conversions: acc.conversions + r.conversions,
      adSpend: acc.adSpend + r.adSpend,
      attributedRevenue: acc.attributedRevenue + r.attributedRevenue,
    }),
    {
      reach: 0,
      impressions: 0,
      engagement: 0,
      websiteVisitors: 0,
      leads: 0,
      conversions: 0,
      adSpend: 0,
      attributedRevenue: 0,
    }
  )
}

export interface WorkspaceInventoryCounts {
  campaignsCount: number
  activeCampaignsCount: number
  contentTotal: number
  contentApproved: number
  creativeProjectsCount: number
  connectedAccountsCount: number
}

export function AnalyticsWorkspace({
  series,
  liveEvents,
  inventory,
}: {
  series: DailyMetrics[]
  liveEvents: AnalyticsEventRecord[]
  inventory: WorkspaceInventoryCounts
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canRunAi = useCan("ai.run")
  const [windowId, setWindowId] = useState<"7d" | "30d" | "90d" | "180d">("30d")
  const [aiReport, setAiReport] = useState<AnalyticsOutput | null>(null)
  const [pending, startTransition] = useTransition()

  const activeWindow = ANALYTICS_WINDOWS.find((w) => w.id === windowId) ?? ANALYTICS_WINDOWS[1]
  const days = activeWindow.days
  const isSampleSeries = liveEvents.length === 0

  const { current, previous, slice } = useMemo(() => {
    const slice = series.slice(-days)
    const prior = series.slice(-days * 2, -days)
    return { current: sumMetrics(slice), previous: sumMetrics(prior), slice }
  }, [series, days])

  const roas = current.adSpend ? current.attributedRevenue / current.adSpend : 0
  const prevRoas = previous.adSpend ? previous.attributedRevenue / previous.adSpend : 0
  const cpa = current.conversions ? Math.round(current.adSpend / current.conversions) : 0
  const cpm = current.impressions ? Math.round((current.adSpend / current.impressions) * 1000) : 0
  const engagementRate = current.impressions ? current.engagement / current.impressions : 0

  const exportCsv = () => {
    const header = [
      "date",
      "reach",
      "impressions",
      "engagement",
      "website_visitors",
      "leads",
      "conversions",
      "ad_spend_inr",
      "attributed_revenue_inr",
      "data_source",
    ].join(",")
    const rows = slice.map((r) =>
      [
        r.date,
        r.reach,
        r.impressions,
        r.engagement,
        r.websiteVisitors,
        r.leads,
        r.conversions,
        r.adSpend,
        r.attributedRevenue,
        isSampleSeries ? "sample_demo" : "synced",
      ].join(",")
    )
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `tangent-analytics-${workspace.slug}-${windowId}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Downloaded CSV report")
  }

  const runAnalyst = () =>
    startTransition(async () => {
      const summary = [
        `Data mode: ${isSampleSeries ? "Sample cross-channel series (no live OAuth analytics connectors synced yet)" : `${liveEvents.length} synced analytics events`}`,
        `Workspace inventory (real DB): ${inventory.campaignsCount} campaigns (${inventory.activeCampaignsCount} active), ${inventory.contentTotal} content items (${inventory.contentApproved} approved), ${inventory.creativeProjectsCount} creative projects, ${inventory.connectedAccountsCount} connected accounts.`,
        `Window (${activeWindow.label}): Reach ${current.reach}, Impressions ${current.impressions}, Engagement ${current.engagement} (${formatPercent(engagementRate)}), Website visitors ${current.websiteVisitors}, Leads ${current.leads}, Conversions ${current.conversions}, Ad spend ${formatINR(current.adSpend)}, Attributed revenue ${formatINR(current.attributedRevenue)}, ROAS ${formatMultiplier(roas)}, CPA ${formatINR(cpa)}.`,
      ].join("\n")
      const res = await generateAnalyticsReport(workspace.slug, {
        windowDays: days,
        contextSummary: summary,
      })
      if (res.ok) setAiReport(res.data)
      else toast.error(res.error)
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Insights"
        description="Cross-channel reach, conversions, spend efficiency and attribution with explicit data source labels."
        meta={
          isSampleSeries ? (
            <DemoBadge detail="Channel performance series is sample data until Meta, Google Analytics, Google Ads or YouTube are connected." />
          ) : (
            <Badge variant="success">{liveEvents.length} synced events</Badge>
          )
        }
        actions={
          <>
            <Select value={windowId} onValueChange={(v) => setWindowId(v as typeof windowId)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Reporting window">
                <SelectValue>{activeWindow.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANALYTICS_WINDOWS.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download /> Export CSV
            </Button>
            {aiConfigured && canRunAi ? (
              <Button variant="brand" size="sm" disabled={pending} onClick={runAnalyst}>
                {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {pending ? "Analysing…" : "AI Analyst summary"}
              </Button>
            ) : null}
          </>
        }
      />

      {inventory.connectedAccountsCount === 0 ? (
        <ConnectionRequired
          provider="Meta, Google Analytics, Google Ads & YouTube"
          description="Connect your marketing accounts in Integrations to replace the sample channel series below with live synced metrics."
          href={workspaceHref(workspace.slug, "integrations")}
        />
      ) : null}

      <section aria-label="Live workspace inventory" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Workspace production inventory (live workspace data)
          </h2>
          <Badge variant="outline">Source: Tangent database</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Campaigns"
            value={String(inventory.campaignsCount)}
            change={null}
            hint={`${inventory.activeCampaignsCount} active`}
          />
          <StatCard
            label="Planner posts"
            value={String(inventory.contentTotal)}
            change={null}
            hint={`${inventory.contentApproved} approved`}
          />
          <StatCard
            label="Creative projects"
            value={String(inventory.creativeProjectsCount)}
            change={null}
            hint="In Creative Studio"
          />
          <StatCard
            label="Connected channels"
            value={String(inventory.connectedAccountsCount)}
            change={null}
            hint="Active OAuth connections"
          />
        </div>
      </section>

      {aiReport ? (
        <Card className="border-brand/40">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-brand" /> {aiReport.headline}
              </CardTitle>
              <Badge variant="brand">Marketing Analyst</Badge>
            </div>
            <CardDescription>{aiReport.executiveSummary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {aiReport.highlights.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-3">
                {aiReport.highlights.map((h) => (
                  <div key={h.metric} className="rounded-md border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{h.metric}</span>
                      <Badge
                        variant={
                          h.status === "positive"
                            ? "success"
                            : h.status === "attention"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {h.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{h.observation}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {aiReport.recommendations.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Recommended actions
                </p>
                <ul className="space-y-1.5">
                  {aiReport.recommendations.map((r) => (
                    <li key={r.action} className="flex items-start gap-2 text-xs">
                      <Badge variant={r.priority === "high" ? "brand" : "outline"}>
                        {r.priority}
                      </Badge>
                      <span>
                        <strong className="text-foreground">{r.action}</strong> — {r.expectedImpact}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section aria-label="Cross-channel metrics" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Cross-channel performance ({activeWindow.label})
          </h2>
          {isSampleSeries ? <DemoBadge /> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <StatCard
            label="Reach"
            value={formatNumber(current.reach, { compact: true })}
            change={percentChange(current.reach, previous.reach)}
          />
          <StatCard
            label="Impressions"
            value={formatNumber(current.impressions, { compact: true })}
            change={percentChange(current.impressions, previous.impressions)}
          />
          <StatCard
            label="Engagement"
            value={formatNumber(current.engagement, { compact: true })}
            change={percentChange(current.engagement, previous.engagement)}
            hint={`${formatPercent(engagementRate)} ER`}
          />
          <StatCard
            label="Visitors"
            value={formatNumber(current.websiteVisitors, { compact: true })}
            change={percentChange(current.websiteVisitors, previous.websiteVisitors)}
          />
          <StatCard
            label="Conversions"
            value={formatNumber(current.conversions)}
            change={percentChange(current.conversions, previous.conversions)}
          />
          <StatCard
            label="Ad spend"
            value={formatINR(current.adSpend, { compact: true })}
            change={percentChange(current.adSpend, previous.adSpend)}
            invertChange
          />
          <StatCard
            label="CPA"
            value={formatINR(cpa)}
            change={null}
            hint={`CPM ${formatINR(cpm)}`}
          />
          <StatCard
            label="ROAS"
            value={formatMultiplier(roas)}
            change={percentChange(roas, prevRoas)}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Daily reach, conversions & spend</CardTitle>
              <CardDescription>
                Window: {activeWindow.label} · Granularity: Daily · Attribution: 7-day click / 1-day view
              </CardDescription>
            </div>
            {isSampleSeries ? <DemoBadge /> : null}
          </div>
        </CardHeader>
        <CardContent>
          <PerformanceChart data={slice} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Channel efficiency comparison</CardTitle>
              <CardDescription>
                Reach, engagement, spend and conversion share by channel ({activeWindow.label})
              </CardDescription>
            </div>
            {isSampleSeries ? <DemoBadge /> : null}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="py-2 text-right font-medium">Reach</th>
                  <th className="py-2 text-right font-medium">Engagement</th>
                  <th className="py-2 text-right font-medium">Spend</th>
                  <th className="py-2 text-right font-medium">Conversions</th>
                  <th className="px-4 py-2 text-right font-medium">CPA</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {DEMO_CHANNELS.map((ch) => {
                  const chReach = Math.round(current.reach * ch.reachShare)
                  const chEng = Math.round(current.engagement * ch.engagementShare)
                  const chSpend = Math.round(current.adSpend * ch.spendShare)
                  const chConv = Math.max(1, Math.round(current.conversions * ch.conversionShare))
                  const chCpa = chSpend > 0 ? Math.round(chSpend / chConv) : 0
                  return (
                    <tr key={ch.id}>
                      <td className="px-4 py-2.5 font-medium">{ch.label}</td>
                      <td className="tabular py-2.5 text-right">{formatNumber(chReach)}</td>
                      <td className="tabular py-2.5 text-right">{formatNumber(chEng)}</td>
                      <td className="tabular py-2.5 text-right">
                        {chSpend > 0 ? formatINR(chSpend) : "Organic"}
                      </td>
                      <td className="tabular py-2.5 text-right">{formatNumber(chConv)}</td>
                      <td className="tabular px-4 py-2.5 text-right">
                        {chCpa > 0 ? formatINR(chCpa) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
