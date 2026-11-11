"use client"

import {
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Radar,
  Sparkles,
  Swords,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DemoBadge } from "@/components/data/demo-badge"
import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  runCompetitorAnalysis,
  saveCompetitorsList,
} from "@/features/competitors/actions"
import type { ResearchOutput } from "@/lib/ai/outputs"
import type { BusinessProfile, MarketingIntelligence } from "@/lib/domain/business"
import { workspaceHref } from "@/lib/navigation"

export function CompetitorsWorkspace({
  business,
  intelligence,
}: {
  business: BusinessProfile | null
  intelligence: MarketingIntelligence | null
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canEditBusiness = useCan("business_profile.edit")
  const canRunAi = useCan("ai.run")

  const [competitors, setCompetitors] = useState<{ name: string; website: string }[]>(
    () => business?.competitors ?? []
  )
  const [newName, setNewName] = useState("")
  const [newWebsite, setNewWebsite] = useState("")
  const [dirty, setDirty] = useState(false)

  const [focus, setFocus] = useState("")
  const [researchResult, setResearchResult] = useState<ResearchOutput | null>(null)
  const [savingList, startSavingList] = useTransition()
  const [runningAi, startRunningAi] = useTransition()

  const addCompetitor = () => {
    const trimmedName = newName.trim()
    const trimmedUrl = newWebsite.trim()
    if (!trimmedName) {
      toast.error("Enter a competitor name.")
      return
    }
    if (competitors.length >= 10) {
      toast.error("Maximum 10 tracked competitors allowed.")
      return
    }
    setCompetitors((prev) => [...prev, { name: trimmedName, website: trimmedUrl }])
    setNewName("")
    setNewWebsite("")
    setDirty(true)
  }

  const removeCompetitor = (index: number) => {
    setCompetitors((prev) => prev.filter((_, idx) => idx !== index))
    setDirty(true)
  }

  const handleSaveCompetitors = () => {
    startSavingList(async () => {
      const res = await saveCompetitorsList(workspace.slug, competitors)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setDirty(false)
      toast.success(`Saved ${res.data.count} tracked competitors.`)
    })
  }

  const handleRunAnalysis = () => {
    startRunningAi(async () => {
      const res = await runCompetitorAnalysis(workspace.slug, focus)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setResearchResult(res.data)
      toast.success("Competitor battlecards updated.")
    })
  }

  const savedInsights = intelligence?.content.competitorInsights ?? []
  const savedOpportunities = intelligence?.content.opportunities ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitor Intelligence"
        description="Track direct and category competitors, compare positioning strengths and weaknesses, and uncover counter-positioning wedges for your campaigns."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {intelligence?.isSample && !researchResult ? (
              <DemoBadge label="Sample intelligence" />
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={workspaceHref(workspace.slug, "campaigns")}>
                Plan counter-campaign
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="size-4 text-primary" />
              Tracked competitors ({competitors.length}/10)
            </CardTitle>
            <CardDescription>
              Competitors stored in your Business Profile and included in every AI strategy and research run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!business ? (
              <EmptyState
                icon={Radar}
                title="Business profile required"
                description="Complete your Business Setup first so Tangent knows your category, city, and core offering."
                action={
                  <Button asChild size="sm">
                    <Link href={workspaceHref(workspace.slug, "strategy")}>
                      Open Marketing Strategy
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                {competitors.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No competitors tracked yet. Add 1–5 direct or local alternatives below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {competitors.map((comp, idx) => (
                      <div
                        key={`${comp.name}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{comp.name}</div>
                          {comp.website ? (
                            <a
                              href={comp.website}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Globe className="size-3" />
                              {comp.website}
                              <ExternalLink className="size-2.5" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No website URL
                            </span>
                          )}
                        </div>
                        {canEditBusiness ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${comp.name}`}
                            onClick={() => removeCompetitor(idx)}
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {canEditBusiness ? (
                  <fieldset className="min-w-0 space-y-2.5 rounded-lg border bg-muted/20 p-3">
                    <div className="space-y-1">
                      <Label htmlFor="comp-name" className="text-xs">
                        Competitor name
                      </Label>
                      <Input
                        id="comp-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Blue Tokai"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="comp-url" className="text-xs">
                        Website (optional, full https:// URL)
                      </Label>
                      <Input
                        id="comp-url"
                        value={newWebsite}
                        onChange={(e) => setNewWebsite(e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCompetitor}
                      >
                        <Plus className="size-3.5" />
                        Add to list
                      </Button>
                      {dirty ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingList}
                          onClick={handleSaveCompetitors}
                        >
                          {savingList ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : null}
                          Save list
                        </Button>
                      ) : null}
                    </div>
                  </fieldset>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Market Research Agent — Deep Battlecard Analysis
            </CardTitle>
            <CardDescription>
              Synthesizes positioning gaps, competitor vulnerabilities, and high-leverage messaging wedges tailored to {business?.name ?? workspace.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!aiConfigured ? (
              <NotConfigured
                title="AI Competitor Research is not configured"
                envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
                description="Configure an AI model key to generate live competitive battlecards and positioning wedges."
              />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="research-focus">
                    Research focus or angle (optional)
                  </Label>
                  <Input
                    id="research-focus"
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    disabled={!canRunAi || runningAi}
                    placeholder="e.g. Compare subscription pricing, festive gifting bundles, and Instagram Reels hooks"
                  />
                </div>
                <Button
                  type="button"
                  disabled={!canRunAi || runningAi}
                  onClick={handleRunAnalysis}
                >
                  {runningAi ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Swords className="size-4" />
                  )}
                  Generate battlecards
                </Button>
              </div>
            )}

            {researchResult ? (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border bg-muted/20 p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Market summary
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      AI synthesized
                    </Badge>
                  </div>
                  <p className="text-sm">{researchResult.marketSummary}</p>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Positioning openings we can claim
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {researchResult.positioningOpenings.map((opening, idx) => (
                      <div key={idx} className="rounded-lg border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">{opening.title}</span>
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            Opening
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {opening.rationale}
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          Hook: {opening.suggestedCampaignHook}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {researchResult.audienceTrends.length > 0 ? (
                  <div className="rounded-lg border p-3">
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Audience & category trends
                    </div>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {researchResult.audienceTrends.map((trend, idx) => (
                        <li key={idx}>{trend}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : savedOpportunities.length > 0 ? (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Current positioning opportunities
                  </span>
                  {intelligence?.isSample ? <DemoBadge /> : null}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {savedOpportunities.map((opp, idx) => (
                    <div key={idx} className="rounded-lg border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{opp.title}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {opp.impact}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-muted-foreground">{opp.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Competitor Battlecards & Counter-Positioning Matrix
              </CardTitle>
              <CardDescription>
                Side-by-side breakdown of competitor strengths, blind spots, and the specific wedge your team should emphasize in copy and ads.
              </CardDescription>
            </div>
            {intelligence?.isSample && !researchResult ? <DemoBadge /> : null}
          </div>
        </CardHeader>
        <CardContent>
          {researchResult ? (
            <div className="grid gap-4 md:grid-cols-2">
              {researchResult.competitorBattlecards.map((card, idx) => (
                <div key={idx} className="flex flex-col justify-between rounded-xl border p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-base">{card.competitor}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          Battlecard
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {card.positioning}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <div className="mb-1 font-medium text-foreground">
                          Their strengths
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {card.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <div className="mb-1 font-medium text-foreground">
                          Their blind spots
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {card.weaknesses.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
                    <span className="font-semibold text-primary">
                      Our winning wedge:{" "}
                    </span>
                    <span className="text-foreground">{card.ourWedge}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : savedInsights.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {savedInsights.map((card, idx) => (
                <div key={idx} className="flex flex-col justify-between rounded-xl border p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base">{card.competitor}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        Intelligence profile
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <div className="mb-1 font-medium text-foreground">
                          Their strengths
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {card.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <div className="mb-1 font-medium text-foreground">
                          Their blind spots
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          {card.weaknesses.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
                    <span className="font-semibold text-primary">
                      Our winning wedge:{" "}
                    </span>
                    <span className="text-foreground">{card.opportunity}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Swords}
              title="No competitor battlecards yet"
              description="Add your competitors on the left and click Generate battlecards to analyze their positioning and discover your counter-positioning wedges."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
