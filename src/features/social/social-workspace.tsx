"use client"

import {
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Loader2,
  PlugZap,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { StatCard } from "@/components/data/stat-card"
import { PageHeader } from "@/components/page/page-header"
import { ConnectionRequired, EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { decideApproval } from "@/features/approvals/actions"
import { copyToPlanner } from "@/features/copy/actions"
import { requestPublishApproval } from "@/features/planner/actions"
import { generateSocialPack } from "@/features/social/actions"
import type { CopyOutput } from "@/lib/ai/outputs"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import type { ApprovalDecision, ApprovalView } from "@/lib/domain/approvals"
import {
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  type ContentItem,
  type ContentPlatform,
} from "@/lib/domain/content"
import {
  CONNECTION_STATUS_LABELS,
  PUBLISHING_JOB_STATUS_LABELS,
  type ConnectedAccountView,
  type PublishingJobView,
} from "@/lib/domain/social"
import { workspaceHref } from "@/lib/navigation"

const SOCIAL_CHANNELS = [
  { id: "instagram", name: "Instagram Business", description: "Feed posts, Carousels, Reels and Stories via Meta Graph API." },
  { id: "facebook", name: "Facebook Pages", description: "Page posts, videos, stories and page engagement insights." },
  { id: "youtube", name: "YouTube", description: "YouTube Shorts, long-form videos and channel analytics." },
  { id: "linkedin", name: "LinkedIn Pages", description: "Company page updates, document carousels and B2B reach." },
] as const

export function SocialWorkspace({
  initialAccounts,
  initialApprovedPosts,
  initialApprovals,
  initialJobs,
}: {
  initialAccounts: ConnectedAccountView[]
  initialApprovedPosts: ContentItem[]
  initialApprovals: ApprovalView[]
  initialJobs: PublishingJobView[]
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canPublish = useCan("content.publish")
  const canCreate = useCan("content.create")
  const canRunAi = useCan("ai.run")

  const [approvals, setApprovals] = useState(
    initialApprovals.filter(
      (a) => a.actionType === "publish_post" || a.actionType === "schedule_post" || a.actionType === "delete_published_content"
    )
  )
  const [approvedPosts] = useState(initialApprovedPosts)
  const [pending, startTransition] = useTransition()

  // AI Social Pack state
  const [theme, setTheme] = useState("")
  const [platforms, setPlatforms] = useState<ContentPlatform[]>(["instagram", "facebook"])
  const [count, setCount] = useState(4)
  const [packOutput, setPackOutput] = useState<CopyOutput | null>(null)
  const [packPending, startPackTransition] = useTransition()

  const activeAccounts = initialAccounts.filter((a) => a.status === "active")
  const pendingApprovals = approvals.filter((a) => a.status === "pending")

  const requestPublish = (post: ContentItem) =>
    startTransition(async () => {
      const res = await requestPublishApproval(workspace.slug, post.id)
      if (res.ok) {
        setApprovals((list) => [res.data, ...list])
        toast.success(`Created publishing approval request for "${post.title}"`)
      } else {
        toast.error(res.error)
      }
    })

  const decide = (approvalId: string, decision: ApprovalDecision) =>
    startTransition(async () => {
      const note =
        decision === "request_changes"
          ? window.prompt("Describe the changes needed before publishing:")
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
        toast.success(`Decision recorded: ${decision.replace("_", " ")}`)
      } else {
        toast.error(res.error)
      }
    })

  const togglePlatform = (p: ContentPlatform) => {
    setPlatforms((curr) =>
      curr.includes(p) ? (curr.length > 1 ? curr.filter((x) => x !== p) : curr) : [...curr, p]
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Media"
        description="Manage connected social channels, review publishing approvals and generate multi-platform social packs."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={workspaceHref(workspace.slug, "planner")}>
                <CalendarClock /> Content Planner
              </Link>
            </Button>
            <Button asChild variant="brand" size="sm">
              <Link href={workspaceHref(workspace.slug, "integrations")}>
                <PlugZap /> Manage connections
              </Link>
            </Button>
          </>
        }
      />

      {activeAccounts.length === 0 ? (
        <ConnectionRequired
          provider="Instagram, Facebook & YouTube"
          description="No social accounts are connected yet. You can prepare posts, approve content and lock publishing approval payloads now; live dispatch executes only after you connect an account via OAuth."
          href={workspaceHref(workspace.slug, "integrations")}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Connected channels"
          value={String(activeAccounts.length)}
          change={null}
          hint={activeAccounts.length ? "Active OAuth tokens" : "Connect in Integrations"}
        />
        <StatCard
          label="Approved posts"
          value={String(approvedPosts.length)}
          change={null}
          hint="Ready for publish sign-off"
        />
        <StatCard
          label="Pending sign-off"
          value={String(pendingApprovals.length)}
          change={null}
          hint="Awaiting publishing approval"
        />
        <StatCard
          label="Publishing jobs"
          value={String(initialJobs.length)}
          change={null}
          hint="Executed or queued by worker"
        />
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            Publishing queue & approvals ({approvals.length})
          </TabsTrigger>
          <TabsTrigger value="channels">
            Channels ({initialAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="ai-pack">
            AI Social Pack Generator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Approved posts in Planner ({approvedPosts.length})
                </h3>
                <Button asChild variant="link" size="xs" className="h-auto px-0">
                  <Link href={workspaceHref(workspace.slug, "planner")}>View calendar</Link>
                </Button>
              </div>
              {approvedPosts.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No approved posts waiting"
                  description="Move a draft post to Approved in the Content Planner, then request final publishing sign-off here."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href={workspaceHref(workspace.slug, "planner")}>Open Content Planner</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {approvedPosts.map((post) => (
                    <Card key={post.id} size="sm">
                      <CardContent className="flex items-start justify-between gap-3 pt-4">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline">
                              {CONTENT_PLATFORM_LABELS[post.platform]} · {post.format}
                            </Badge>
                            <Badge variant="success">Content approved</Badge>
                          </div>
                          <p className="truncate text-sm font-medium">{post.title}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {post.caption || "No caption"}
                          </p>
                          {post.scheduledFor ? (
                            <p className="tabular text-[0.7rem] text-muted-foreground">
                              Scheduled slot: {new Date(post.scheduledFor).toLocaleString("en-IN")}
                            </p>
                          ) : null}
                        </div>
                        {canRunAi ? (
                          <Button
                            size="xs"
                            variant="brand"
                            disabled={pending}
                            onClick={() => requestPublish(post)}
                          >
                            <Send /> Request sign-off
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                Publishing approval requests ({approvals.length})
              </h3>
              {approvals.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No publishing approvals yet"
                  description="Every external publish or schedule request locks a SHA-256 hash of the exact caption, media and time before execution."
                />
              ) : (
                <div className="space-y-3">
                  {approvals.map((approval) => (
                    <Card key={approval.id} size="sm">
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
                            <CardTitle className="mt-1 text-sm">{approval.title}</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 rounded-md border bg-muted/20 p-2.5 text-xs">
                          {approval.details.slice(0, 5).map((d) => (
                            <div key={d.label} className="contents">
                              <dt className="truncate text-muted-foreground capitalize">{d.label}</dt>
                              <dd className="line-clamp-2 font-medium">{d.value}</dd>
                            </div>
                          ))}
                        </dl>

                        {approval.decisionNote ? (
                          <p className="text-xs text-muted-foreground">
                            Note: {approval.decisionNote}
                          </p>
                        ) : null}

                        {approval.status === "approved" && !approval.account?.connected ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlugZap className="size-3.5 text-info" />
                            Signed off. Connect the target social account in Integrations to dispatch this job.
                          </p>
                        ) : null}

                        {approval.status === "pending" && canPublish ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <Button
                              size="xs"
                              variant="brand"
                              disabled={pending}
                              onClick={() => decide(approval.id, "approve")}
                            >
                              <Check /> Approve publish
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
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {initialJobs.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Worker dispatch history</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Post</th>
                      <th className="py-2 font-medium">Account</th>
                      <th className="py-2 font-medium">Scheduled</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {initialJobs.map((job) => (
                      <tr key={job.id}>
                        <td className="px-3 py-2 font-medium">{job.contentTitle}</td>
                        <td className="py-2 text-xs text-muted-foreground">{job.accountName}</td>
                        <td className="tabular py-2 text-xs text-muted-foreground">
                          {new Date(job.scheduledFor).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={job.status === "succeeded" ? "success" : job.status === "failed" ? "danger" : "info"}>
                            {PUBLISHING_JOB_STATUS_LABELS[job.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="channels" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {SOCIAL_CHANNELS.map((ch) => {
              const matching = initialAccounts.filter((a) => a.provider === ch.id)
              return (
                <Card key={ch.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{ch.name}</CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">{ch.description}</p>
                      </div>
                      <Badge variant={matching.some((m) => m.status === "active") ? "success" : "muted"}>
                        {matching.some((m) => m.status === "active") ? "Connected" : "Not connected"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {matching.length > 0 ? (
                      <ul className="space-y-2 text-xs">
                        {matching.map((acc) => (
                          <li key={acc.id} className="flex items-center justify-between rounded-md border p-2">
                            <span className="font-medium">{acc.displayName}</span>
                            <Badge variant={acc.status === "active" ? "success" : "warning"}>
                              {CONNECTION_STATUS_LABELS[acc.status]}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Connect {ch.name} in Integrations via official OAuth to publish approved posts and ingest insights.
                      </p>
                    )}
                    <Button asChild variant="outline" size="xs">
                      <Link href={`${workspaceHref(workspace.slug, "integrations")}?connect=${ch.id}`}>
                        <PlugZap /> Connect {ch.name}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="ai-pack" className="space-y-4 pt-4">
          {!aiConfigured ? (
            <NotConfigured
              title="AI Social Media Manager is not configured"
              description="Add an AI provider key to generate multi-platform social packs."
              envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
            />
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <form
              className="space-y-4 self-start rounded-lg border p-4"
              onSubmit={(e) => {
                e.preventDefault()
                startPackTransition(async () => {
                  const res = await generateSocialPack(workspace.slug, { theme, platforms, count })
                  if (res.ok) setPackOutput(res.data)
                  else toast.error(res.error)
                })
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="social-theme">Campaign or weekly theme</Label>
                <Textarea
                  id="social-theme"
                  rows={4}
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="e.g. Weekend chef specials, behind-the-scenes kitchen stories and customer review highlights."
                />
              </div>
              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_PLATFORMS.map((p) => (
                    <label
                      key={p}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <Checkbox
                        checked={platforms.includes(p)}
                        onCheckedChange={() => togglePlatform(p)}
                      />
                      <span>{CONTENT_PLATFORM_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="social-count">Number of posts</Label>
                <Input
                  id="social-count"
                  type="number"
                  min={2}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Math.max(2, Math.min(10, Number(e.target.value) || 4)))}
                  className="w-24"
                />
              </div>
              <Button
                type="submit"
                variant="brand"
                className="w-full"
                disabled={!aiConfigured || !canRunAi || packPending || theme.trim().length < 5}
              >
                {packPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {packPending ? "Drafting pack…" : "Generate social pack"}
              </Button>
            </form>

            <div className="min-w-0 space-y-3">
              {packOutput ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {packOutput.variants.map((v, i) => (
                    <SocialVariantCard key={`${i}-${v.headline}`} variant={v} canCreate={canCreate} slug={workspace.slug} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Share2}
                  title="Generate a multi-platform social pack"
                  description="The Social Media Manager drafts coordinated posts across Instagram, Facebook, YouTube and LinkedIn that you can send straight to the Content Planner."
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SocialVariantCard({
  variant,
  canCreate,
  slug,
}: {
  variant: CopyOutput["variants"][number]
  canCreate: boolean
  slug: string
}) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const full = [variant.headline, variant.body, variant.callToAction, variant.hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n")

  const matchPlatform = (): ContentPlatform => {
    const found = CONTENT_PLATFORMS.find(
      (p) => CONTENT_PLATFORM_LABELS[p].toLowerCase() === variant.platform.toLowerCase()
    )
    return found ?? "instagram"
  }

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span>
          {variant.platform} · {variant.format}
        </span>
        {variant.suggestedDate ? <span>{variant.suggestedDate}</span> : null}
      </div>
      <div className="flex-1 space-y-2 p-3 text-sm">
        {variant.headline ? <p className="font-medium">{variant.headline}</p> : null}
        <p className="whitespace-pre-wrap">{variant.body}</p>
        {variant.callToAction ? <p className="text-brand-emphasis">{variant.callToAction}</p> : null}
        {variant.hashtags.length ? (
          <p className="text-xs text-muted-foreground">{variant.hashtags.join(" ")}</p>
        ) : null}
      </div>
      <div className="flex gap-1 border-t p-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            await navigator.clipboard.writeText(full)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        {canCreate ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={pending || saved}
            onClick={() =>
              startTransition(async () => {
                const res = await copyToPlanner(slug, {
                  platform: matchPlatform(),
                  headline: variant.headline,
                  body: variant.body,
                  callToAction: variant.callToAction,
                  hashtags: variant.hashtags,
                })
                if (res.ok) {
                  setSaved(true)
                  toast.success("Saved to Content Planner")
                } else {
                  toast.error(res.error)
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : saved ? <Check /> : <CalendarPlus />}
            {saved ? "In planner" : "Send to planner"}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
