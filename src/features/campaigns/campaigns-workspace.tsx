"use client"

import {
  ArrowRight,
  CalendarDays,
  Loader2,
  Megaphone,
  PenLine,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DemoBadge } from "@/components/data/demo-badge"
import { StatCard } from "@/components/data/stat-card"
import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import {
  deleteCampaignAction,
  generateCampaignWithAi,
  saveCampaignAction,
  setCampaignStatus,
} from "@/features/campaigns/actions"
import {
  CHANNEL_LABELS,
  MARKETING_CHANNELS,
  type MarketingChannel,
} from "@/lib/domain/business"
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  type Campaign,
  type CampaignStatus,
} from "@/lib/domain/campaigns"
import { formatINR } from "@/lib/format"
import { workspaceHref } from "@/lib/navigation"

const STATUS_BADGE: Record<CampaignStatus, "muted" | "info" | "warning" | "success" | "brand"> = {
  draft: "muted",
  planning: "info",
  production: "warning",
  review: "warning",
  approved: "success",
  active: "brand",
  completed: "muted",
}

const NEXT_STATUS: Record<CampaignStatus, CampaignStatus | null> = {
  draft: "planning",
  planning: "production",
  production: "review",
  review: "approved",
  approved: "active",
  active: "completed",
  completed: null,
}

function emptyCampaign(): Campaign {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: crypto.randomUUID(),
    name: "",
    objective: CAMPAIGN_OBJECTIVES[0],
    audience: "",
    channels: ["instagram"],
    startDate: today,
    endDate: null,
    budgetInr: 25000,
    landingPageUrl: "",
    conversionGoal: "",
    kpis: [{ metric: "Qualified leads", target: "100", current: "0" }],
    status: "draft",
    brandProfileId: null,
    updatedAt: new Date().toISOString(),
  }
}

export function CampaignsWorkspace({
  initialCampaigns,
  isSampleSeed = false,
}: {
  initialCampaigns: Campaign[]
  isSampleSeed?: boolean
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canManage = useCan("campaigns.manage")
  const canRunAi = useCan("ai.run")
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all")
  const [editing, setEditing] = useState<{ campaign: Campaign; isNew: boolean } | null>(null)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const visible = campaigns.filter((c) => statusFilter === "all" || c.status === statusFilter)
  const activeCount = campaigns.filter((c) => c.status === "active").length
  const totalBudget = campaigns.reduce((sum, c) => sum + c.budgetInr, 0)
  const uniqueChannels = new Set(campaigns.flatMap((c) => c.channels)).size

  const upsert = (saved: Campaign) => {
    setCampaigns((list) => [saved, ...list.filter((c) => c.id !== saved.id)])
    setEditing(null)
  }

  const advance = (campaign: Campaign, next: CampaignStatus) =>
    startTransition(async () => {
      const result = await setCampaignStatus(workspace.slug, { id: campaign.id, status: next })
      if (result.ok) {
        toast.success(`Moved "${campaign.name}" to ${CAMPAIGN_STATUS_LABELS[next]}`)
        setCampaigns((list) => list.map((c) => (c.id === campaign.id ? result.data : c)))
      } else {
        toast.error(result.error)
      }
    })

  const remove = (campaign: Campaign) =>
    startTransition(async () => {
      if (!window.confirm(`Delete campaign "${campaign.name}"?`)) return
      const result = await deleteCampaignAction(workspace.slug, campaign.id)
      if (result.ok) {
        toast.success("Campaign deleted")
        setCampaigns((list) => list.filter((c) => c.id !== campaign.id))
      } else {
        toast.error(result.error)
      }
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Plan, produce and track multi-channel marketing campaigns across organic social, search and paid ads."
        meta={isSampleSeed ? <DemoBadge /> : null}
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setAiDialogOpen(true)}>
                <Sparkles /> Plan with AI
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setEditing({ campaign: emptyCampaign(), isNew: true })}
              >
                <Plus /> New campaign
              </Button>
            </>
          ) : null
        }
      />

      {!aiConfigured ? (
        <NotConfigured
          title="AI Campaign Strategist is not configured"
          description="You can create and manage campaigns manually. Add an AI provider key to generate campaign blueprints automatically."
          envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total campaigns" value={String(campaigns.length)} change={null} hint="Across all lifecycle stages" />
        <StatCard label="Active campaigns" value={String(activeCount)} change={null} hint="Currently live" />
        <StatCard label="Planned budget" value={formatINR(totalBudget)} change={null} hint="Allocated across campaigns" />
        <StatCard label="Channels covered" value={String(uniqueChannels)} change={null} hint="Organic & paid channels" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setStatusFilter("all")}
          >
            All ({campaigns.length})
          </Button>
          {CAMPAIGN_STATUSES.map((s) => {
            const count = campaigns.filter((c) => c.status === s).length
            return (
              <Button
                key={s}
                variant={statusFilter === s ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setStatusFilter(s)}
              >
                {CAMPAIGN_STATUS_LABELS[s]} ({count})
              </Button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={statusFilter === "all" ? "No campaigns yet" : `No ${CAMPAIGN_STATUS_LABELS[statusFilter].toLowerCase()} campaigns`}
          description="Create a campaign manually or let the Marketing Strategist generate a channel mix, budget and KPIs from a short brief."
          action={
            canManage ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAiDialogOpen(true)}>
                  <Sparkles /> Plan with AI
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setEditing({ campaign: emptyCampaign(), isNew: true })}
                >
                  <Plus /> Create campaign
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((campaign) => {
            const nextStatus = NEXT_STATUS[campaign.status]
            return (
              <Card key={campaign.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_BADGE[campaign.status]}>
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                        {campaign.startDate ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" />
                            {campaign.startDate}
                            {campaign.endDate ? ` → ${campaign.endDate}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{campaign.objective}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-heading text-base font-semibold">
                        {formatINR(campaign.budgetInr)}
                      </p>
                      <p className="text-[0.7rem] text-muted-foreground">Budget</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {campaign.audience ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.audience}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5">
                    {campaign.channels.map((ch) => (
                      <Badge key={ch} variant="outline">
                        {CHANNEL_LABELS[ch] ?? ch}
                      </Badge>
                    ))}
                  </div>

                  {campaign.kpis.length > 0 ? (
                    <div className="grid gap-2 rounded-md border bg-muted/20 p-2.5 sm:grid-cols-3">
                      {campaign.kpis.slice(0, 3).map((kpi, i) => (
                        <div key={`${kpi.metric}-${i}`} className="min-w-0">
                          <p className="truncate text-[0.7rem] text-muted-foreground">{kpi.metric}</p>
                          <p className="tabular truncate text-xs font-medium">
                            {kpi.current ? `${kpi.current} / ` : "Target: "}
                            <span className="text-foreground">{kpi.target}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {canManage ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setEditing({ campaign, isNew: false })}
                        >
                          <PenLine /> Edit
                        </Button>
                      ) : null}
                      {canManage && nextStatus ? (
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={pending}
                          onClick={() => advance(campaign, nextStatus)}
                        >
                          Move to {CAMPAIGN_STATUS_LABELS[nextStatus]} <ArrowRight />
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="xs">
                        <Link
                          href={`${workspaceHref(workspace.slug, "command-centre")}?prompt=${encodeURIComponent(`Create social posts and ad copy for our "${campaign.name}" campaign (${campaign.objective}).`)}`}
                        >
                          <Sparkles /> Generate assets
                        </Link>
                      </Button>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() => remove(campaign)}
                          aria-label={`Delete ${campaign.name}`}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {editing ? (
        <CampaignEditorDialog
          campaign={editing.campaign}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={upsert}
        />
      ) : null}

      <AiCampaignDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        canRun={canManage && canRunAi && aiConfigured}
        onCreated={(created) => {
          setCampaigns((list) => [created, ...list])
          setAiDialogOpen(false)
        }}
      />
    </div>
  )
}

function CampaignEditorDialog({
  campaign,
  isNew,
  onClose,
  onSaved,
}: {
  campaign: Campaign
  isNew: boolean
  onClose: () => void
  onSaved: (c: Campaign) => void
}) {
  const { workspace } = useWorkspace()
  const [draft, setDraft] = useState<Campaign>(campaign)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const toggleChannel = (channel: MarketingChannel) => {
    setDraft((d) => ({
      ...d,
      channels: d.channels.includes(channel)
        ? d.channels.filter((c) => c !== channel)
        : [...d.channels, channel],
    }))
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveCampaignAction(workspace.slug, draft)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success(isNew ? "Campaign created" : "Campaign updated")
      onSaved(result.data)
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New campaign" : `Edit "${campaign.name}"`}</DialogTitle>
          <DialogDescription>
            Every AI agent in this workspace can reference this campaign’s objective, audience and KPIs.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Campaign name</Label>
              <Input
                id="camp-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Winter Comfort Menu Launch"
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>Lifecycle stage</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => ({ ...d, status: v as CampaignStatus }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{CAMPAIGN_STATUS_LABELS[draft.status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CAMPAIGN_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-objective">Objective</Label>
              <Input
                id="camp-objective"
                value={draft.objective}
                onChange={(e) => setDraft((d) => ({ ...d, objective: e.target.value }))}
                placeholder="e.g. Drive dine-in footfall and table bookings"
              />
              {errors.objective ? <p className="text-xs text-destructive">{errors.objective}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Total budget (₹ INR)</Label>
              <Input
                id="camp-budget"
                type="number"
                min={0}
                step={1000}
                value={draft.budgetInr}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, budgetInr: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-start">Start date</Label>
              <Input
                id="camp-start"
                type="date"
                value={draft.startDate ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-end">End date</Label>
              <Input
                id="camp-end"
                type="date"
                value={draft.endDate ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value || null }))}
              />
              {errors.endDate ? <p className="text-xs text-destructive">{errors.endDate}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="camp-audience">Target audience</Label>
            <Textarea
              id="camp-audience"
              rows={2}
              value={draft.audience}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value }))}
              placeholder="Who is this campaign targeting?"
            />
          </div>

          <div className="space-y-2">
            <Label>Channels</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MARKETING_CHANNELS.map((ch) => (
                <label
                  key={ch}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/40"
                >
                  <Checkbox
                    checked={draft.channels.includes(ch)}
                    onCheckedChange={() => toggleChannel(ch)}
                  />
                  <span>{CHANNEL_LABELS[ch]}</span>
                </label>
              ))}
            </div>
            {errors.channels ? <p className="text-xs text-destructive">{errors.channels}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-goal">Conversion goal</Label>
              <Input
                id="camp-goal"
                value={draft.conversionGoal}
                onChange={(e) => setDraft((d) => ({ ...d, conversionGoal: e.target.value }))}
                placeholder="e.g. Table reservations or WhatsApp enquiries"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-url">Landing page URL (optional)</Label>
              <Input
                id="camp-url"
                value={draft.landingPageUrl}
                onChange={(e) => setDraft((d) => ({ ...d, landingPageUrl: e.target.value }))}
                placeholder="https://example.com/offer"
              />
              {errors.landingPageUrl ? (
                <p className="text-xs text-destructive">{errors.landingPageUrl}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Target className="size-3.5 text-muted-foreground" /> KPIs
              </Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={draft.kpis.length >= 6}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    kpis: [...d.kpis, { metric: "", target: "", current: "0" }],
                  }))
                }
              >
                <Plus /> Add KPI
              </Button>
            </div>
            <div className="space-y-2">
              {draft.kpis.map((kpi, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_7rem_7rem_auto] items-center gap-2">
                  <Input
                    placeholder="Metric (e.g. Leads)"
                    value={kpi.metric}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        kpis: d.kpis.map((k, i) => (i === idx ? { ...k, metric: e.target.value } : k)),
                      }))
                    }
                  />
                  <Input
                    placeholder="Target"
                    value={kpi.target}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        kpis: d.kpis.map((k, i) => (i === idx ? { ...k, target: e.target.value } : k)),
                      }))
                    }
                  />
                  <Input
                    placeholder="Current"
                    value={kpi.current}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        kpis: d.kpis.map((k, i) => (i === idx ? { ...k, current: e.target.value } : k)),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() =>
                      setDraft((d) => ({ ...d, kpis: d.kpis.filter((_, i) => i !== idx) }))
                    }
                    aria-label="Remove KPI"
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isNew ? "Create campaign" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AiCampaignDialog({
  open,
  onOpenChange,
  canRun,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canRun: boolean
  onCreated: (campaign: Campaign) => void
}) {
  const { workspace } = useWorkspace()
  const [brief, setBrief] = useState("")
  const [budgetInr, setBudgetInr] = useState(50000)
  const [durationDays, setDurationDays] = useState(30)
  const [pending, startTransition] = useTransition()

  const generate = () =>
    startTransition(async () => {
      const result = await generateCampaignWithAi(workspace.slug, {
        brief,
        budgetInr,
        durationDays,
      })
      if (result.ok) {
        toast.success(`Created "${result.data.name}"`)
        setBrief("")
        onCreated(result.data)
      } else {
        toast.error(result.error)
      }
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan a campaign with AI</DialogTitle>
          <DialogDescription>
            The Marketing Strategist uses your business and brand context to build a campaign structure, channel mix and KPIs.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending || !canRun} className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-camp-brief">What are you promoting?</Label>
            <Textarea
              id="ai-camp-brief"
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Launch our festive catering packages for corporate offices and family gatherings across Bengaluru."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-camp-budget">Total budget (₹ INR)</Label>
              <Input
                id="ai-camp-budget"
                type="number"
                min={0}
                step={5000}
                value={budgetInr}
                onChange={(e) => setBudgetInr(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-camp-days">Duration (days)</Label>
              <Input
                id="ai-camp-days"
                type="number"
                min={3}
                max={180}
                value={durationDays}
                onChange={(e) => setDurationDays(Math.max(3, Math.min(180, Number(e.target.value) || 30)))}
              />
            </div>
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={pending || !canRun || brief.trim().length < 5}
            onClick={generate}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? "Planning…" : "Generate campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
