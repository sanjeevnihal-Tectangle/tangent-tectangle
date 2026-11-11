"use client"

import {
  Check,
  Loader2,
  MousePointerClick,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatCard } from "@/components/data/stat-card"
import { TagInput } from "@/components/forms/tag-input"
import { PageHeader } from "@/components/page/page-header"
import { ConnectionRequired, EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  generateAdPlanWithAi,
  submitAdSpendProposal,
  updateAccountSpendLimits,
} from "@/features/ads/actions"
import { decideApproval } from "@/features/approvals/actions"
import type { AdsOutput } from "@/lib/ai/outputs"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import {
  AD_OBJECTIVES,
  AD_PLATFORM_LABELS,
  AD_PLATFORMS,
  type AdAccountView,
  type AdCampaignPayload,
  type AdPlatform,
} from "@/lib/domain/ads"
import type { ApprovalDecision, ApprovalView } from "@/lib/domain/approvals"
import type { BusinessProfile } from "@/lib/domain/business"
import { formatINR } from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"

const SPEND_ACTION_TYPES = new Set([
  "launch_ad_campaign",
  "increase_budget",
  "change_targeting",
])

function defaultProposal(business: BusinessProfile | null): AdCampaignPayload {
  return {
    platform: "meta_ads",
    name: "",
    objective: AD_OBJECTIVES[0],
    dailyBudgetInr: 1000,
    durationDays: 14,
    targetLocations: business ? `${business.city}, ${business.country}` : "Bengaluru, India",
    targetAudience: business?.targetAudience.slice(0, 300) ?? "Urban professionals aged 24–45",
    headlines: [],
    descriptions: [],
    callToAction: "Learn More",
    landingPageUrl: business?.website ?? "",
    abTestHypothesis: "Compare offer-led headline vs social-proof headline for CTR.",
  }
}

export function AdsWorkspace({
  initialAccounts,
  initialApprovals,
  business,
}: {
  initialAccounts: AdAccountView[]
  initialApprovals: ApprovalView[]
  business: BusinessProfile | null
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canManageAds = useCan("ads.manage")
  const canApproveSpend = useCan("ads.approve_spend")
  const canRunAi = useCan("ai.run")

  const [approvals, setApprovals] = useState(
    initialApprovals.filter((a) => SPEND_ACTION_TYPES.has(a.actionType))
  )
  const [accounts, setAccounts] = useState(initialAccounts)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [revisingApproval, setRevisingApproval] = useState<ApprovalView | null>(null)
  const [pending, startTransition] = useTransition()

  // AI Ad Planner state
  const [aiPlatform, setAiPlatform] = useState<AdPlatform>("meta_ads")
  const [aiBrief, setAiBrief] = useState("")
  const [aiDailyBudget, setAiDailyBudget] = useState(1500)
  const [aiOutput, setAiOutput] = useState<AdsOutput | null>(null)
  const [aiPending, startAiTransition] = useTransition()

  const pendingProposals = approvals.filter((a) => a.status === "pending")
  const approvedDailyPaise = approvals
    .filter((a) => a.status === "approved" && a.financialImpact?.period === "daily")
    .reduce((sum, a) => sum + (a.financialImpact?.maxSpendPaise ?? 0), 0)

  const decide = (approvalId: string, decision: ApprovalDecision) =>
    startTransition(async () => {
      const note =
        decision === "request_changes"
          ? window.prompt("Describe the budget or targeting changes required:")
          : null
      if (decision === "request_changes" && !note) return
      const res = await decideApproval({
        workspace: workspace.slug,
        approvalId,
        decision,
        note,
      })
      if (res.ok) {
        setApprovals((list) => list.map((a) => (a.id === approvalId ? res.approval : a)))
        toast.success(`Spend decision recorded: ${decision.replace("_", " ")}`)
      } else {
        toast.error(res.error)
      }
    })

  const submitAiPlanForApproval = (plan: AdsOutput) =>
    startTransition(async () => {
      const res = await submitAdSpendProposal(workspace.slug, {
        payload: {
          platform: plan.platform,
          name: plan.campaignName,
          objective: plan.objective,
          dailyBudgetInr: Math.max(100, Math.round(plan.recommendedDailyBudgetInr)),
          durationDays: 14,
          targetLocations: plan.targetLocations,
          targetAudience: plan.targetAudience,
          headlines: plan.headlines,
          descriptions: plan.descriptions,
          callToAction: plan.callToAction,
          landingPageUrl: business?.website ?? "",
          abTestHypothesis: plan.abTestHypothesis,
        },
      })
      if (res.ok) {
        setApprovals((list) => [res.data, ...list])
        toast.success("Submitted ad campaign for spend approval")
      } else {
        toast.error(res.error)
      }
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads Manager"
        description="Structure Meta Ads and Google Ads campaigns with configurable spend guardrails and cryptographic human sign-off on every rupee."
        actions={
          canManageAds ? (
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                setRevisingApproval(null)
                setBuilderOpen(true)
              }}
            >
              <Plus /> New ad proposal
            </Button>
          ) : null
        }
      />

      {accounts.length === 0 ? (
        <ConnectionRequired
          provider="Meta Ads & Google Ads"
          description="No ad accounts are connected yet. You can design ad campaigns, run AI structures and approve exact spend proposals now; live campaign creation executes only after connecting Meta Ads or Google Ads in Integrations."
          href={`${workspaceHref(workspace.slug, "integrations")}?connect=meta_ads`}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Connected ad accounts"
          value={String(accounts.length)}
          change={null}
          hint={accounts.length ? "Spend limits active" : "Connect in Integrations"}
        />
        <StatCard
          label="Pending spend sign-off"
          value={String(pendingProposals.length)}
          change={null}
          hint="Requires ads.approve_spend"
        />
        <StatCard
          label="Approved daily cap"
          value={formatINR(Math.round(approvedDailyPaise / 100))}
          change={null}
          hint="Across approved proposals"
        />
        <StatCard
          label="Total ad proposals"
          value={String(approvals.length)}
          change={null}
          hint="Immutable payload hashes"
        />
      </div>

      <Tabs defaultValue="proposals">
        <TabsList>
          <TabsTrigger value="proposals">
            Spend approvals & campaigns ({approvals.length})
          </TabsTrigger>
          <TabsTrigger value="ai-builder">
            AI Performance Marketer
          </TabsTrigger>
          <TabsTrigger value="guardrails">
            Account spend guardrails ({accounts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="space-y-4 pt-4">
          {approvals.length === 0 ? (
            <EmptyState
              icon={MousePointerClick}
              title="No ad spend proposals yet"
              description="Create an ad campaign proposal manually or use the AI Performance Marketer to design a Meta Ads or Google Ads structure."
              action={
                canManageAds ? (
                  <Button variant="brand" size="sm" onClick={() => setBuilderOpen(true)}>
                    <Plus /> Create ad proposal
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {approvals.map((approval) => (
                <Card key={approval.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              approval.status === "approved"
                                ? "success"
                                : approval.status === "pending"
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {approval.status.replace("_", " ")}
                          </Badge>
                          <Badge variant="outline">v{approval.version}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {EXTERNAL_ACTION_LABELS[approval.actionType]}
                          </span>
                        </div>
                        <CardTitle className="mt-1.5 text-base">{approval.title}</CardTitle>
                      </div>
                      {approval.financialImpact ? (
                        <div className="text-right">
                          <p className="tabular font-heading text-base font-semibold text-brand-emphasis">
                            {formatINR(Math.round(approval.financialImpact.maxSpendPaise / 100))}
                          </p>
                          <p className="text-[0.7rem] text-muted-foreground capitalize">
                            Max {approval.financialImpact.period.replace("_", " ")} spend
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 rounded-md border bg-muted/20 p-3 text-xs">
                      {approval.details.map((d) => (
                        <div key={d.label} className="contents">
                          <dt className="truncate text-muted-foreground capitalize">{d.label}</dt>
                          <dd className="line-clamp-2 font-medium">{d.value}</dd>
                        </div>
                      ))}
                    </dl>

                    {approval.decisionNote ? (
                      <p className="rounded bg-warning-subtle px-2.5 py-1.5 text-xs">
                        Reviewer note: {approval.decisionNote}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {approval.status === "pending" && canApproveSpend ? (
                          <>
                            <Button
                              size="xs"
                              variant="brand"
                              disabled={pending}
                              onClick={() => decide(approval.id, "approve")}
                            >
                              <Check /> Approve spend
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={pending}
                              onClick={() => decide(approval.id, "request_changes")}
                            >
                              Request changes
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="text-destructive"
                              disabled={pending}
                              onClick={() => decide(approval.id, "reject")}
                            >
                              <XCircle /> Reject
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {canManageAds ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setRevisingApproval(approval)
                            setBuilderOpen(true)
                          }}
                        >
                          <PenLine /> Revise (creates v{approval.version + 1})
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai-builder" className="space-y-6 pt-4">
          {!aiConfigured ? (
            <NotConfigured
              title="AI Performance Marketer is not configured"
              description="Add an AI provider key to generate paid campaign structures, ad sets and A/B test hypotheses."
              envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
            />
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <form
              className="space-y-4 self-start rounded-lg border p-4"
              onSubmit={(e) => {
                e.preventDefault()
                startAiTransition(async () => {
                  const res = await generateAdPlanWithAi(workspace.slug, {
                    platform: aiPlatform,
                    brief: aiBrief,
                    dailyBudgetInr: aiDailyBudget,
                  })
                  if (res.ok) setAiOutput(res.data)
                  else toast.error(res.error)
                })
              }}
            >
              <div className="space-y-1.5">
                <Label>Ad platform</Label>
                <Select value={aiPlatform} onValueChange={(v) => setAiPlatform(v as AdPlatform)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{AD_PLATFORM_LABELS[aiPlatform]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AD_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {AD_PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-ad-budget">Daily budget (₹ INR)</Label>
                <Input
                  id="ai-ad-budget"
                  type="number"
                  min={100}
                  step={250}
                  value={aiDailyBudget}
                  onChange={(e) => setAiDailyBudget(Math.max(100, Number(e.target.value) || 500))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-ad-brief">Offer & goal</Label>
                <Textarea
                  id="ai-ad-brief"
                  rows={4}
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder="e.g. Generate catering enquiries for wedding and corporate events across Bengaluru with a free tasting session offer."
                />
              </div>
              <Button
                type="submit"
                variant="brand"
                className="w-full"
                disabled={!aiConfigured || !canRunAi || aiPending || aiBrief.trim().length < 5}
              >
                {aiPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {aiPending ? "Structuring campaign…" : "Generate ad structure"}
              </Button>
            </form>

            <div className="min-w-0">
              {aiOutput ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Badge variant="outline">{AD_PLATFORM_LABELS[aiOutput.platform]}</Badge>
                        <CardTitle className="mt-1 text-lg">{aiOutput.campaignName}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {aiOutput.objective} · {formatINR(aiOutput.recommendedDailyBudgetInr)}/day
                        </p>
                      </div>
                      {canManageAds ? (
                        <Button
                          variant="brand"
                          size="sm"
                          disabled={pending}
                          onClick={() => submitAiPlanForApproval(aiOutput)}
                        >
                          <ShieldCheck /> Submit for spend approval
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <p>
                      <span className="text-muted-foreground">Targeting: </span>
                      {aiOutput.targetLocations} — {aiOutput.targetAudience}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {aiOutput.adSets.map((set) => (
                        <div key={set.name} className="rounded-md border p-3">
                          <div className="flex items-center justify-between font-medium">
                            <span>{set.name}</span>
                            <Badge variant="muted">{set.budgetSharePercent}% budget</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{set.audienceSegment}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Placements: {set.placements.join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                          Headlines
                        </p>
                        <ul className="space-y-1">
                          {aiOutput.headlines.map((h) => (
                            <li key={h} className="rounded border px-2.5 py-1 text-xs">
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                          Descriptions
                        </p>
                        <ul className="space-y-1">
                          {aiOutput.descriptions.map((d) => (
                            <li key={d} className="rounded border px-2.5 py-1 text-xs">
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                      <p>
                        <strong className="text-foreground">A/B test hypothesis:</strong>{" "}
                        {aiOutput.abTestHypothesis}
                      </p>
                      <p className="mt-1">
                        <strong className="text-foreground">Benchmark note (Estimate):</strong>{" "}
                        {aiOutput.estimatedBenchmarksNote}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="AI Performance Marketing Specialist"
                  description="Generate audience segmentation, ad sets, compliant headlines and A/B test plans, then lock them into a spend approval request."
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="guardrails" className="space-y-4 pt-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-brand" /> How spend guardrails work
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Every ad launch, budget increase or targeting change creates an immutable{" "}
              <code className="font-mono">approval_request</code> with a SHA-256 payload hash and{" "}
              <code className="font-mono">financial_impact</code>. Before calling Meta or Google APIs, the executor runs{" "}
              <code className="font-mono">assertExecutable(request, payload, spendLimitPaise)</code> — rejecting any unapproved edit or any spend exceeding the account limit.
            </CardContent>
          </Card>

          {accounts.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No connected ad accounts"
              description="Connect Meta Ads or Google Ads in Integrations to configure per-account daily and monthly spend ceilings."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {accounts.map((acc) => (
                <AdAccountGuardrailCard
                  key={acc.id}
                  account={acc}
                  canApproveSpend={canApproveSpend}
                  slug={workspace.slug}
                  onUpdated={(updated) =>
                    setAccounts((list) => list.map((a) => (a.id === updated.id ? updated : a)))
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {builderOpen ? (
        <AdProposalDialog
          initialPayload={defaultProposal(business)}
          revising={revisingApproval}
          onClose={() => {
            setBuilderOpen(false)
            setRevisingApproval(null)
          }}
          onCreated={(created) => {
            setApprovals((list) => [
              created,
              ...list.filter((a) => a.id !== revisingApproval?.id),
            ])
            setBuilderOpen(false)
            setRevisingApproval(null)
          }}
        />
      ) : null}
    </div>
  )
}

function AdAccountGuardrailCard({
  account,
  canApproveSpend,
  slug,
  onUpdated,
}: {
  account: AdAccountView
  canApproveSpend: boolean
  slug: string
  onUpdated: (a: AdAccountView) => void
}) {
  const [daily, setDaily] = useState(account.dailySpendLimitInr ?? 5000)
  const [monthly, setMonthly] = useState(account.monthlySpendLimitInr ?? 100000)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{account.name}</CardTitle>
          <Badge variant="success">{account.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {account.provider} · ID {account.externalAccountId}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Daily limit (₹ INR)</Label>
            <Input
              type="number"
              disabled={!canApproveSpend || pending}
              value={daily}
              onChange={(e) => setDaily(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label>Monthly limit (₹ INR)</Label>
            <Input
              type="number"
              disabled={!canApproveSpend || pending}
              value={monthly}
              onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        {canApproveSpend ? (
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await updateAccountSpendLimits(slug, {
                  accountId: account.id,
                  dailySpendLimitInr: daily,
                  monthlySpendLimitInr: monthly,
                })
                if (res.ok) {
                  toast.success("Updated spend limits")
                  onUpdated({ ...account, dailySpendLimitInr: daily, monthlySpendLimitInr: monthly })
                } else {
                  toast.error(res.error)
                }
              })
            }
          >
            Save spend limits
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function AdProposalDialog({
  initialPayload,
  revising,
  onClose,
  onCreated,
}: {
  initialPayload: AdCampaignPayload
  revising: ApprovalView | null
  onClose: () => void
  onCreated: (approval: ApprovalView) => void
}) {
  const { workspace } = useWorkspace()
  const [draft, setDraft] = useState<AdCampaignPayload>(() => {
    if (!revising) return initialPayload
    const getDetail = (key: string) =>
      revising.details.find((d) => d.label.toLowerCase() === key.toLowerCase())?.value ?? ""
    return {
      ...initialPayload,
      name: getDetail("campaignName") || revising.title,
      objective: getDetail("objective") || initialPayload.objective,
      dailyBudgetInr: revising.financialImpact
        ? Math.max(100, Math.round(revising.financialImpact.maxSpendPaise / 100))
        : initialPayload.dailyBudgetInr,
      targetLocations: getDetail("locations") || initialPayload.targetLocations,
      targetAudience: getDetail("audience") || initialPayload.targetAudience,
      headlines: getDetail("headlines")
        ? getDetail("headlines").split("|").map((s) => s.trim()).filter(Boolean)
        : ["Book Your Table Today"],
      descriptions: getDetail("descriptions")
        ? getDetail("descriptions").split("|").map((s) => s.trim()).filter(Boolean)
        : ["Authentic flavours crafted fresh daily."],
    }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      const res = await submitAdSpendProposal(workspace.slug, {
        payload: draft,
        previousVersionId: revising?.id ?? null,
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      toast.success(
        revising
          ? `Created v${res.data.version} (previous version superseded — requires re-approval)`
          : "Ad spend proposal submitted for approval"
      )
      onCreated(res.data)
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {revising ? `Revise proposal (creates v${revising.version + 1})` : "New ad campaign proposal"}
          </DialogTitle>
          <DialogDescription>
            Any change to budget, targeting or creative copy produces a new SHA-256 payload hash that requires explicit spend approval.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select
                value={draft.platform}
                onValueChange={(v) => setDraft((d) => ({ ...d, platform: v as AdPlatform }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{AD_PLATFORM_LABELS[draft.platform]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AD_PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {AD_PLATFORM_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-name">Campaign name</Label>
              <Input
                id="ad-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Bengaluru Catering Search — Nov"
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-obj">Objective</Label>
              <Input
                id="ad-obj"
                value={draft.objective}
                onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-daily">Daily budget (₹ INR)</Label>
              <Input
                id="ad-daily"
                type="number"
                min={100}
                step={100}
                value={draft.dailyBudgetInr}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, dailyBudgetInr: Math.max(100, Number(e.target.value) || 100) }))
                }
              />
              {errors.dailyBudgetInr ? (
                <p className="text-xs text-destructive">{errors.dailyBudgetInr}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-days">Duration (days)</Label>
              <Input
                id="ad-days"
                type="number"
                min={1}
                max={365}
                value={draft.durationDays}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, durationDays: Math.max(1, Number(e.target.value) || 7) }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ad-loc">Target locations</Label>
              <Input
                id="ad-loc"
                value={draft.targetLocations}
                onChange={(e) => setDraft((d) => ({ ...d, targetLocations: e.target.value }))}
                placeholder="e.g. Indiranagar, Koramangala, HSR Layout (8 km)"
              />
              {errors.targetLocations ? (
                <p className="text-xs text-destructive">{errors.targetLocations}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-cta">Call to action</Label>
              <Input
                id="ad-cta"
                value={draft.callToAction}
                onChange={(e) => setDraft((d) => ({ ...d, callToAction: e.target.value }))}
                placeholder="e.g. Book Now, Get Quote, Order Online"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-aud">Audience & targeting criteria</Label>
            <Textarea
              id="ad-aud"
              rows={2}
              value={draft.targetAudience}
              onChange={(e) => setDraft((d) => ({ ...d, targetAudience: e.target.value }))}
            />
            {errors.targetAudience ? (
              <p className="text-xs text-destructive">{errors.targetAudience}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-headlines">Ad headlines (press Enter after each)</Label>
            <TagInput
              id="ad-headlines"
              value={draft.headlines}
              onChange={(headlines) => setDraft((d) => ({ ...d, headlines }))}
              placeholder="Add headline (e.g. Artisanal Winter Menu)"
              maxItems={8}
            />
            {errors.headlines ? <p className="text-xs text-destructive">{errors.headlines}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-descs">Ad descriptions (press Enter after each)</Label>
            <TagInput
              id="ad-descs"
              value={draft.descriptions}
              onChange={(descriptions) => setDraft((d) => ({ ...d, descriptions }))}
              placeholder="Add description line"
              maxItems={4}
            />
            {errors.descriptions ? (
              <p className="text-xs text-destructive">{errors.descriptions}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ad-url">Landing page URL (optional)</Label>
              <Input
                id="ad-url"
                value={draft.landingPageUrl}
                onChange={(e) => setDraft((d) => ({ ...d, landingPageUrl: e.target.value }))}
                placeholder="https://example.in/offer"
              />
              {errors.landingPageUrl ? (
                <p className="text-xs text-destructive">{errors.landingPageUrl}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-ab">A/B test hypothesis</Label>
              <Input
                id="ad-ab"
                value={draft.abTestHypothesis}
                onChange={(e) => setDraft((d) => ({ ...d, abTestHypothesis: e.target.value }))}
              />
            </div>
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {revising ? "Submit revised version" : "Submit for spend approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
