"use client"

import { Check, Copy, ImageIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  AdsOutput,
  AgentOutput,
  AnalyticsOutput,
  CopyOutput,
  CreativeOutput,
  ResearchOutput,
  SeoOutput,
  StrategyOutput,
  VideoOutput,
} from "@/lib/ai/outputs"
import { formatINR } from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Couldn't access the clipboard")
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
}

function StrategyView({ data }: { data: StrategyOutput }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-heading text-base font-semibold">{data.title}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{data.summary}</p>
      </div>
      {data.objectives.length ? (
        <div>
          <SectionLabel>Objectives</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.objectives.map((o) => (
              <div key={o.objective} className="rounded-md border p-2.5">
                <p className="text-sm font-medium">{o.objective}</p>
                <p className="text-xs text-muted-foreground">
                  {o.kpi} · <span className="text-foreground">{o.target}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {data.pillars.length ? (
        <div>
          <SectionLabel>Content pillars</SectionLabel>
          <ul className="space-y-2">
            {data.pillars.map((p) => (
              <li key={p.name} className="text-sm">
                <span className="font-medium">{p.name}</span> — {p.description}
                {p.exampleIdeas.length ? (
                  <span className="block text-xs text-muted-foreground">e.g. {p.exampleIdeas.join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.channelPlan.length ? (
        <div>
          <SectionLabel>Channel plan</SectionLabel>
          <div className="space-y-2">
            {data.channelPlan.map((c) => (
              <div key={c.channel} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="truncate font-medium">{c.channel}</span>
                <div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, c.budgetSharePercent)}%` }} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {c.role} · {c.cadence}
                  </p>
                </div>
                <span className="tabular text-right text-xs">{c.budgetSharePercent}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {data.timeline.length ? (
        <div>
          <SectionLabel>Timeline</SectionLabel>
          <ol className="space-y-2 border-l pl-4">
            {data.timeline.map((t) => (
              <li key={t.period} className="text-sm">
                <span className="font-medium">{t.period}</span> · {t.focus}
                <span className="block text-xs text-muted-foreground">{t.actions.join(" · ")}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {data.risks.length || data.nextSteps.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.risks.length ? (
            <div>
              <SectionLabel>Risks</SectionLabel>
              <ul className="list-disc space-y-1 pl-4 text-sm">{data.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : null}
          {data.nextSteps.length ? (
            <div>
              <SectionLabel>Next steps</SectionLabel>
              <ul className="list-disc space-y-1 pl-4 text-sm">{data.nextSteps.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CopyView({ data }: { data: CopyOutput }) {
  return (
    <div className="space-y-3">
      {data.brief ? <p className="text-sm text-muted-foreground">{data.brief}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {data.variants.map((v, i) => {
          const full = [v.headline, v.body, v.callToAction, v.hashtags.join(" ")].filter(Boolean).join("\n\n")
          return (
            <div key={i} className="flex flex-col rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
                <span className="truncate text-xs text-muted-foreground">
                  {v.platform} · {v.format}
                  {v.suggestedDate ? ` · ${v.suggestedDate}` : ""}
                </span>
                <CopyButton text={full} />
              </div>
              <div className="flex-1 space-y-2 p-3 text-sm">
                {v.headline ? <p className="font-medium">{v.headline}</p> : null}
                <p className="whitespace-pre-wrap">{v.body}</p>
                {v.callToAction ? <p className="text-brand-emphasis">{v.callToAction}</p> : null}
                {v.hashtags.length ? <p className="text-xs text-muted-foreground">{v.hashtags.join(" ")}</p> : null}
              </div>
            </div>
          )
        })}
      </div>
      {data.notes.length ? <p className="text-xs text-muted-foreground">Notes: {data.notes.join(" ")}</p> : null}
    </div>
  )
}

const HEX = /#[0-9a-fA-F]{6}/

function CreativeView({ data }: { data: CreativeOutput }) {
  const { workspace } = useWorkspace()
  return (
    <div className="space-y-3">
      {data.concepts.map((c) => (
        <div key={c.name} className="rounded-md border">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <p className="text-sm font-medium">{c.name}</p>
            <Badge variant="muted">{c.platform}</Badge>
            <Badge variant="muted">{c.format}</Badge>
            <Badge variant="muted">{c.aspectRatio}</Badge>
          </div>
          <div className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_14rem]">
            <div className="space-y-2">
              <p>{c.visualDirection}</p>
              <p className="text-muted-foreground">{c.composition}</p>
              {c.copyOverlay ? (
                <p>
                  <span className="text-muted-foreground">Overlay: </span>
                  {c.copyOverlay}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {c.colorUsage.map((usage) => {
                  const hex = usage.match(HEX)?.[0]
                  return (
                    <span key={usage} className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs">
                      {hex ? <span className="size-3 rounded-sm border" style={{ backgroundColor: hex }} aria-hidden /> : null}
                      {usage}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/30 p-3">
              <ImageIcon className="size-4 text-muted-foreground" />
              <p className="line-clamp-4 text-xs text-muted-foreground">{c.imagePrompt}</p>
              <div className="mt-auto flex flex-wrap gap-1">
                <CopyButton text={c.imagePrompt} label="Copy prompt" />
                <Button asChild variant="outline" size="xs">
                  <Link href={`${workspaceHref(workspace.slug, "studio")}/new?brief=${encodeURIComponent(`${c.name}: ${c.visualDirection} Copy: ${c.copyOverlay}`.slice(0, 1500))}`}>
                    Design in Studio
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {data.notes.length ? <p className="text-xs text-muted-foreground">Notes: {data.notes.join(" ")}</p> : null}
    </div>
  )
}

function SeoView({ data }: { data: SeoOutput }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{data.summary}</p>
      {data.keywords.length ? (
        <div>
          <SectionLabel>Target keywords (AI estimates)</SectionLabel>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Keyword</th>
                  <th className="py-1.5 font-medium">Intent</th>
                  <th className="py-1.5 font-medium">Est. volume</th>
                  <th className="py-1.5 font-medium">Difficulty</th>
                  <th className="px-3 py-1.5 font-medium">Target page</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.keywords.map((k) => (
                  <tr key={k.keyword}>
                    <td className="px-3 py-1.5 font-medium">{k.keyword}</td>
                    <td className="py-1.5 text-xs capitalize">{k.intent}</td>
                    <td className="tabular py-1.5 text-xs text-muted-foreground">{k.estimatedMonthlyVolume}</td>
                    <td className="py-1.5"><Badge variant="muted">{k.difficulty}</Badge></td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{k.targetPage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {data.metaSuggestions.length ? (
        <div>
          <SectionLabel>Meta tags</SectionLabel>
          <div className="space-y-2">
            {data.metaSuggestions.map((m) => (
              <div key={m.slug} className="rounded-md border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{m.pageName} <code className="font-mono text-xs text-muted-foreground">{m.slug}</code></span>
                  <CopyButton text={`Title: ${m.titleTag}\nDescription: ${m.metaDescription}\nH1: ${m.h1}`} />
                </div>
                <p className="mt-1 text-brand-emphasis">{m.titleTag}</p>
                <p className="text-xs text-muted-foreground">{m.metaDescription}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {data.blogTopics.length ? (
        <div>
          <SectionLabel>Blog topics</SectionLabel>
          <ul className="space-y-1.5 text-sm">
            {data.blogTopics.map((b) => (
              <li key={b.title}>
                <span className="font-medium">{b.title}</span> <Badge variant="outline">{b.primaryKeyword}</Badge>
                {b.outline.length ? <span className="block text-xs text-muted-foreground">{b.outline.join(" → ")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function AdsView({ data }: { data: AdsOutput }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-heading text-base font-semibold">{data.campaignName}</h4>
          <p className="text-xs text-muted-foreground">
            {data.platform === "meta_ads" ? "Meta Ads" : "Google Ads"} · {data.objective} · {formatINR(data.recommendedDailyBudgetInr)}/day
          </p>
        </div>
        <Badge variant="warning">Draft · spend requires approval</Badge>
      </div>
      <p className="text-sm"><span className="text-muted-foreground">Targeting: </span>{data.targetLocations} — {data.targetAudience}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.adSets.map((set) => (
          <div key={set.name} className="rounded-md border p-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{set.name}</span>
              <span className="tabular text-xs">{set.budgetSharePercent}%</span>
            </div>
            <p className="text-xs text-muted-foreground">{set.audienceSegment}</p>
            <p className="mt-1 text-xs text-muted-foreground">Placements: {set.placements.join(", ")}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <SectionLabel>Headlines</SectionLabel>
          <ul className="space-y-1 text-sm">{data.headlines.map((h) => <li key={h}>· {h}</li>)}</ul>
        </div>
        <div>
          <SectionLabel>Descriptions</SectionLabel>
          <ul className="space-y-1 text-sm">{data.descriptions.map((d) => <li key={d}>· {d}</li>)}</ul>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">A/B test: {data.abTestHypothesis} · {data.estimatedBenchmarksNote}</p>
    </div>
  )
}

function ResearchView({ data }: { data: ResearchOutput }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{data.marketSummary}</p>
      {data.competitorBattlecards.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.competitorBattlecards.map((c) => (
            <div key={c.competitor} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{c.competitor}</p>
              <p className="text-xs text-muted-foreground">{c.positioning}</p>
              <p className="mt-2 text-xs"><span className="font-medium text-brand-emphasis">Our wedge: </span>{c.ourWedge}</p>
            </div>
          ))}
        </div>
      ) : null}
      {data.positioningOpenings.length ? (
        <div>
          <SectionLabel>Positioning opportunities</SectionLabel>
          <ul className="space-y-2 text-sm">
            {data.positioningOpenings.map((o) => (
              <li key={o.title}>
                <span className="font-medium">{o.title}</span> — {o.rationale}
                <span className="block text-xs text-brand-emphasis">Hook: {o.suggestedCampaignHook}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function AnalyticsView({ data }: { data: AnalyticsOutput }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-heading text-base font-semibold">{data.headline}</h4>
        <p className="mt-1 text-sm text-muted-foreground">{data.executiveSummary}</p>
      </div>
      {data.highlights.length ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {data.highlights.map((h) => (
            <div key={h.metric} className="rounded-md border p-2.5 text-sm">
              <p className="font-medium">{h.metric}</p>
              <p className="text-xs text-muted-foreground">{h.observation}</p>
            </div>
          ))}
        </div>
      ) : null}
      {data.recommendations.length ? (
        <div>
          <SectionLabel>Recommended actions</SectionLabel>
          <ul className="space-y-1.5 text-sm">
            {data.recommendations.map((r) => (
              <li key={r.action} className="flex items-start gap-2">
                <Badge variant={r.priority === "high" ? "brand" : "muted"} className="mt-0.5 shrink-0">{r.priority}</Badge>
                <span><span className="font-medium">{r.action}</span> — {r.expectedImpact}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function VideoView({ data }: { data: VideoOutput }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-heading text-base font-semibold">{data.title}</h4>
          <p className="text-xs text-muted-foreground">{data.platform} · {data.totalDurationSeconds}s · {data.audioDirection}</p>
        </div>
        <CopyButton text={`${data.title}\nHook: ${data.hook}\n\n${data.scenes.map((s) => `[${s.sceneNumber} - ${s.durationSeconds}s] ${s.visualDirection}\nVO: ${s.voiceoverOrDialogue}\nText: ${s.onScreenText}`).join("\n\n")}\n\nCaption:\n${data.caption}\n${data.hashtags.join(" ")}`} label="Copy script" />
      </div>
      <div className="rounded-md border bg-brand-subtle/20 p-2.5 text-sm">
        <span className="font-medium text-brand-emphasis">0–3s Hook: </span>{data.hook}
      </div>
      <ol className="space-y-2">
        {data.scenes.map((s) => (
          <li key={s.sceneNumber} className="rounded-md border p-2.5 text-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Scene {s.sceneNumber}</span>
              <span className="tabular">{s.durationSeconds}s</span>
            </div>
            <p className="mt-1">{s.visualDirection}</p>
            {s.voiceoverOrDialogue ? <p className="mt-1 text-xs"><span className="text-muted-foreground">Voiceover: </span>{s.voiceoverOrDialogue}</p> : null}
            {s.onScreenText ? <p className="mt-0.5 text-xs font-medium text-brand-emphasis">On-screen: “{s.onScreenText}”</p> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function AgentOutputView({ output }: { output: AgentOutput }) {
  switch (output.kind) {
    case "strategy":
      return <StrategyView data={output.data} />
    case "copy":
      return <CopyView data={output.data} />
    case "creative":
      return <CreativeView data={output.data} />
    case "seo":
      return <SeoView data={output.data} />
    case "ads":
      return <AdsView data={output.data} />
    case "research":
      return <ResearchView data={output.data} />
    case "analytics":
      return <AnalyticsView data={output.data} />
    case "video":
      return <VideoView data={output.data} />
    default: {
      const unreachable: never = output
      return unreachable
    }
  }
}
