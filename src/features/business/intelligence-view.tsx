"use client"

import { Check, Loader2, Pencil, RotateCcw, Sparkles, Users } from "lucide-react"
import Link from "next/link"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DemoBadge } from "@/components/data/demo-badge"
import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { generateIntelligence, updateIntelligenceSection } from "@/features/business/actions"
import {
  BUSINESS_MODEL_LABELS,
  CHANNEL_LABELS,
  INTELLIGENCE_SECTION_LABELS,
  INTELLIGENCE_SECTIONS,
  type BusinessProfile,
  type IntelligenceSection,
  type MarketingIntelligence,
  type MarketingIntelligenceContent,
} from "@/lib/domain/business"
import { formatINR } from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"

/** Sections whose main text can be edited inline. */
const EDITABLE: Partial<Record<IntelligenceSection, { read: (c: MarketingIntelligenceContent) => string; write: (c: MarketingIntelligenceContent, v: string) => unknown }>> = {
  summary: { read: (c) => c.summary, write: (_c, v) => v },
  valueProposition: { read: (c) => c.valueProposition, write: (_c, v) => v },
  strategy: { read: (c) => c.strategy.positioning, write: (c, v) => ({ ...c.strategy, positioning: v }) },
}

function SectionBody({ section, content }: { section: IntelligenceSection; content: MarketingIntelligenceContent }) {
  switch (section) {
    case "summary":
      return <p className="text-sm leading-relaxed">{content.summary}</p>
    case "valueProposition":
      return <p className="font-heading text-base leading-snug">&ldquo;{content.valueProposition}&rdquo;</p>
    case "personas":
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {content.personas.map((p) => (
            <div key={p.name} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.snapshot}</p>
              <p className="mt-2 text-xs"><span className="text-muted-foreground">Goals:</span> {p.goals.join("; ")}</p>
              <p className="text-xs"><span className="text-muted-foreground">Pain points:</span> {p.painPoints.join("; ")}</p>
              <p className="text-xs"><span className="text-muted-foreground">Channels:</span> {p.preferredChannels.join(", ")}</p>
            </div>
          ))}
        </div>
      )
    case "competitorInsights":
      return content.competitorInsights.length ? (
        <div className="space-y-3">
          {content.competitorInsights.map((c) => (
            <div key={c.competitor} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-3">
              <p className="font-medium md:col-span-3">{c.competitor}</p>
              <p className="text-xs"><span className="text-muted-foreground">Strengths:</span> {c.strengths.join("; ")}</p>
              <p className="text-xs"><span className="text-muted-foreground">Weaknesses:</span> {c.weaknesses.join("; ")}</p>
              <p className="text-xs"><span className="text-muted-foreground">Opportunity:</span> {c.opportunity}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Inferred from your profile, not from live competitor data.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No competitors in the business profile.</p>
      )
    case "opportunities":
      return (
        <ul className="space-y-2">
          {content.opportunities.map((o) => (
            <li key={o.title} className="flex items-start gap-3 text-sm">
              <Badge variant={o.impact === "high" ? "brand" : "muted"} className="mt-0.5 capitalize">{o.impact}</Badge>
              <span><span className="font-medium">{o.title}</span> — <span className="text-muted-foreground">{o.rationale}</span></span>
            </li>
          ))}
        </ul>
      )
    case "recommendedChannels":
      return (
        <div className="space-y-2.5">
          {content.recommendedChannels.map((c) => (
            <div key={c.channel} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="font-medium">{c.channel}</span>
              <div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, c.budgetSharePercent)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.role} — {c.rationale}</p>
              </div>
              <span className="tabular text-right text-xs">{c.budgetSharePercent}%</span>
            </div>
          ))}
        </div>
      )
    case "strategy":
      return (
        <div className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Positioning:</span> {content.strategy.positioning}</p>
          <div className="grid gap-2 md:grid-cols-3">
            {content.strategy.pillars.map((p) => (
              <div key={p.name} className="rounded-md border p-3">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </div>
          <ul className="list-disc space-y-0.5 pl-4">{content.strategy.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
      )
    case "plan30Day":
      return (
        <div className="grid gap-2 md:grid-cols-4">
          {content.plan30Day.map((w) => (
            <div key={w.week} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Week {w.week}</p>
              <p className="font-medium">{w.theme}</p>
              <ul className="mt-1.5 space-y-1 text-xs">{w.actions.map((a) => <li key={a}>· {a}</li>)}</ul>
            </div>
          ))}
        </div>
      )
    default: {
      const unreachable: never = section
      return unreachable
    }
  }
}

function SectionCard({
  section,
  intelligence,
  onUpdated,
}: {
  section: IntelligenceSection
  intelligence: MarketingIntelligence
  onUpdated: (next: MarketingIntelligence) => void
}) {
  const { workspace } = useWorkspace()
  const canEdit = useCan("business_profile.edit")
  const [editing, setEditing] = useState(false)
  const editable = EDITABLE[section]
  const [text, setText] = useState(() => editable?.read(intelligence.content) ?? "")
  const [pending, startTransition] = useTransition()
  const approved = intelligence.sectionStatus[section] === "approved"

  const update = (status: "draft" | "approved", content?: unknown) =>
    startTransition(async () => {
      const result = await updateIntelligenceSection(workspace.slug, { section, status, content })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onUpdated(result.data)
      setEditing(false)
    })

  return (
    <Card size="sm" id={section}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {INTELLIGENCE_SECTION_LABELS[section]}
          <Badge variant={approved ? "success" : "muted"}>{approved ? "Approved" : "Draft"}</Badge>
        </CardTitle>
        {canEdit ? (
          <CardAction className="flex gap-1">
            {editable && !editing ? (
              <Button variant="ghost" size="xs" onClick={() => { setText(editable.read(intelligence.content)); setEditing(true) }}>
                <Pencil /> Edit
              </Button>
            ) : null}
            {approved ? (
              <Button variant="ghost" size="xs" disabled={pending} onClick={() => update("draft")}>
                <RotateCcw /> Back to draft
              </Button>
            ) : (
              <Button variant="outline" size="xs" disabled={pending || editing} onClick={() => update("approved")}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
            )}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing && editable ? (
          <div className="space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label={`Edit ${INTELLIGENCE_SECTION_LABELS[section]}`} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
              <Button size="sm" disabled={pending || text.trim().length < 5} onClick={() => update("draft", editable.write(intelligence.content, text.trim()))}>
                Save as draft
              </Button>
            </div>
          </div>
        ) : (
          <SectionBody section={section} content={intelligence.content} />
        )}
      </CardContent>
    </Card>
  )
}

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function IntelligenceView({ profile, initial }: { profile: BusinessProfile | null; initial: MarketingIntelligence | null }) {
  const { workspace, aiConfigured } = useWorkspace()
  const canEdit = useCan("business_profile.edit")
  const [intelligence, setIntelligence] = useState(initial)
  const [generating, startGenerating] = useTransition()

  const approvedCount = intelligence ? INTELLIGENCE_SECTIONS.filter((s) => intelligence.sectionStatus[s] === "approved").length : 0

  const generate = () =>
    startGenerating(async () => {
      const result = await generateIntelligence(workspace.slug)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setIntelligence(result.data)
      toast.success("Intelligence profile generated. Review and approve each section.")
    })

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Marketing Strategy" description="Your business intelligence profile and AI-generated marketing strategy." />
        <EmptyState
          icon={Users}
          title="Start with your business profile"
          description="Tell Tangent about your business, audience, competitors and goals. Every agent uses this as shared context."
          action={
            <Button asChild variant="brand">
              <Link href={workspaceHref(workspace.slug, "onboarding")}>Start onboarding</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Strategy"
        description="Business intelligence profile and strategy. Approved sections become shared context for every AI agent."
        meta={intelligence?.isSample ? <DemoBadge label="Sample profile" detail="This intelligence profile is sample content, not generated from your data. Regenerate it with AI once configured." /> : null}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={workspaceHref(workspace.slug, "onboarding")}>
                <Pencil /> Edit business profile
              </Link>
            </Button>
            {canEdit ? (
              <Button variant="brand" size="sm" onClick={generate} disabled={!aiConfigured || generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {generating ? "Analysing business…" : intelligence ? "Regenerate with AI" : "Generate with AI"}
              </Button>
            ) : null}
          </>
        }
      />

      {!aiConfigured ? (
        <NotConfigured
          title="AI generation is not configured"
          description="Add an OpenAI or Anthropic API key to let the Marketing Strategist analyse your business and generate personas, opportunities and a 30-day plan. With both, Tangent fails over automatically."
          envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {generating ? (
            <Card size="sm">
              <CardContent className="flex items-center gap-3 py-2 text-sm">
                <Loader2 className="size-4 animate-spin text-brand" />
                The Marketing Strategist is analysing your business, audience and competitors. This usually takes 30–60 seconds.
              </CardContent>
            </Card>
          ) : null}
          {intelligence ? (
            INTELLIGENCE_SECTIONS.map((section) => (
              <SectionCard key={section} section={section} intelligence={intelligence} onUpdated={setIntelligence} />
            ))
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No intelligence profile yet"
              description="Generate a business summary, personas, value proposition, competitor insights, channel plan and 30-day plan from your profile."
            />
          )}
        </div>

        <div className="space-y-4">
          {intelligence ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Review progress</CardTitle>
                <CardDescription>
                  {approvedCount} of {INTELLIGENCE_SECTIONS.length} sections approved
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={(approvedCount / INTELLIGENCE_SECTIONS.length) * 100} aria-label="Sections approved" />
                <p className="text-xs text-muted-foreground">
                  Generated by {intelligence.generatedBy} on {new Date(intelligence.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
                </p>
              </CardContent>
            </Card>
          ) : null}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2">
                <ProfileRow label="Business">{profile.name}</ProfileRow>
                <ProfileRow label="Industry">{profile.industry}</ProfileRow>
                <ProfileRow label="Model">{BUSINESS_MODEL_LABELS[profile.businessModel]}</ProfileRow>
                <ProfileRow label="Location">{[profile.city, profile.region].filter(Boolean).join(", ")}</ProfileRow>
                <ProfileRow label="Budget">{formatINR(profile.monthlyBudgetInr)} / month</ProfileRow>
                <ProfileRow label="Channels">{profile.preferredChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}</ProfileRow>
                <ProfileRow label="Objectives">
                  <ul className="space-y-0.5">{profile.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
                </ProfileRow>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
