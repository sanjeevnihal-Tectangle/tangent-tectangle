"use client"

import { AlertTriangle, CheckCircle2, ExternalLink, ImageIcon, Loader2, PenLine, PlugZap, RotateCcw, Send, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { DesignThumbnail } from "@/components/creative/design-renderer"
import {
  approvePublish,
  loadCreativePreview,
  loadPublishStatuses,
  publishDesign,
  refreshAssetUrls,
  rejectPublish,
  retryPublish,
  type CreativePreview,
} from "@/features/command-centre/actions"
import { renderDesignJpeg } from "@/features/command-centre/design-render"
import type { GeneratedAsset, RequiredAction } from "@/lib/ai/events"
import { EXTERNAL_ACTION_LABELS } from "@/lib/approvals/engine"
import { workspaceHref } from "@/lib/navigation"
import type { PublishStatus } from "@/lib/publishing/payload"
import { cn } from "@/lib/utils"

/** Generated image with a signed URL that is refreshed once it expires (or was never stored). */
export function AssetImage({ asset, className }: { asset: Pick<GeneratedAsset, "assetId" | "name" | "url">; className?: string }) {
  const { workspace } = useWorkspace()
  const [src, setSrc] = useState<string | null>(asset.url)
  const [refreshed, setRefreshed] = useState(false)

  const refresh = () => {
    if (refreshed) return
    setRefreshed(true)
    void refreshAssetUrls(workspace.slug, [asset.assetId]).then((result) => {
      if (result.ok && result.data[asset.assetId]) setSrc(result.data[asset.assetId]!)
    })
  }

  useEffect(() => {
    if (asset.url) return
    let cancelled = false
    void refreshAssetUrls(workspace.slug, [asset.assetId]).then((result) => {
      if (!cancelled && result.ok && result.data[asset.assetId]) setSrc(result.data[asset.assetId]!)
    })
    return () => {
      cancelled = true
    }
  }, [asset.assetId, asset.url, workspace.slug])

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageIcon className="size-5" />
      </div>
    )
  }
  // Signed Supabase URLs are short-lived and already sized; next/image would need remote config per project.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={asset.name} className={cn("bg-muted object-cover", className)} onError={refresh} />
}

export function GeneratedImages({ assets }: { assets: GeneratedAsset[] }) {
  const { workspace } = useWorkspace()
  if (assets.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {assets.map((asset) => (
          <figure key={asset.assetId} className="w-full max-w-72 overflow-hidden rounded-md border">
            <AssetImage asset={asset} className="aspect-square w-full" />
            <figcaption className="px-2 py-1.5 text-xs text-muted-foreground">{asset.name}</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Saved to the{" "}
        <Link className="underline underline-offset-2" href={workspaceHref(workspace.slug, "assets")}>
          Asset Library
        </Link>
        .
      </p>
    </div>
  )
}

function StatusLine({ status, platform }: { status: PublishStatus; platform: string }) {
  switch (status.approvalStatus) {
    case "executed":
      return (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" /> Published to {platform}
          {status.permalink ? (
            <a href={status.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              View post <ExternalLink className="size-3" />
            </a>
          ) : status.externalPostId ? (
            <span className="text-xs text-muted-foreground">Post ID {status.externalPostId}</span>
          ) : null}
        </p>
      )
    case "approved":
    case "executing":
      return (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Publishing to {platform}…
        </p>
      )
    case "failed":
      return (
        <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {status.error ?? `Publishing to ${platform} failed.`}
        </p>
      )
    case "rejected":
      return <p className="text-sm text-muted-foreground">Rejected — nothing was published.</p>
    case "superseded":
      return <p className="text-sm text-muted-foreground">Replaced by a newer version.</p>
    case "expired":
      return <p className="text-sm text-muted-foreground">This approval expired. Ask Tangent to prepare the post again.</p>
    case "changes_requested":
      return <p className="text-sm text-muted-foreground">Changes requested — ask Tangent to revise the post.</p>
    case "pending":
      return null
    default: {
      const unreachable: never = status.approvalStatus
      return unreachable
    }
  }
}


/** The current Creative Studio design (refetched so edits made in the Studio show up). */
function useCreativePreview(projectId: string | null | undefined) {
  const { workspace } = useWorkspace()
  const [preview, setPreview] = useState<CreativePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = () =>
      void loadCreativePreview(workspace.slug, projectId).then((result) => {
        if (cancelled) return
        if (result.ok) {
          setPreview(result.data)
          setError(null)
        } else setError(result.error)
      })
    load()
    // Pick up edits made in Creative Studio in another tab.
    window.addEventListener("focus", load)
    return () => {
      cancelled = true
      window.removeEventListener("focus", load)
    }
  }, [projectId, workspace.slug])
  return { preview, error }
}

/** Editable design preview with a link to edit it in Creative Studio. */
export function CreativeDesignPreview({ projectId, width = 144 }: { projectId: string; width?: number }) {
  const { workspace } = useWorkspace()
  const { preview, error } = useCreativePreview(projectId)
  return (
    <div className="flex shrink-0 flex-col gap-1.5" style={{ width }}>
      {preview ? (
        <DesignThumbnail document={preview.document} assetUrls={preview.assetUrls} width={width} />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground" style={{ width }}>
          {error ?? <Loader2 className="size-4 animate-spin" />}
        </div>
      )}
      <Button asChild size="sm" variant="outline" className="w-full">
        <Link href={workspaceHref(workspace.slug, `studio/${projectId}`)} target="_blank">
          <PenLine /> Edit in Creative Studio
        </Link>
      </Button>
    </div>
  )
}

/** Renders the latest version of the design and publishes it (used for approve and retry). */
async function publishCreativePost(workspaceSlug: string, approvalId: string, projectId: string) {
  const fresh = await loadCreativePreview(workspaceSlug, projectId)
  if (!fresh.ok) return fresh
  let image: Blob
  try {
    image = await renderDesignJpeg(fresh.data)
  } catch (error) {
    console.error(error)
    return { ok: false as const, error: "Couldn't render the design. Open it in Creative Studio, check its images load, and try again." }
  }
  const form = new FormData()
  form.set("image", new File([image], "design.jpg", { type: "image/jpeg" }))
  return publishDesign(workspaceSlug, approvalId, form)
}

interface CardProps {
  action: RequiredAction
  assets: GeneratedAsset[]
  status: PublishStatus | undefined
  busy: boolean
  canPublish: boolean
  onApprove: () => void
  onReject: () => void
  onRetry: () => void
}

function ApprovalCard({ action, assets, status, busy, canPublish, onApprove, onReject, onRetry }: CardProps) {
  const image = action.preview?.imageAssetId ? assets.find((a) => a.assetId === action.preview?.imageAssetId) : undefined
  const pending = !status || status.approvalStatus === "pending"

  return (
    <div className="rounded-lg border border-brand/30 bg-card p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand" />
        <p className="text-sm font-medium">
          {EXTERNAL_ACTION_LABELS[action.actionType]} on {action.platform}
          {action.account ? <span className="font-normal text-muted-foreground"> · {action.account.name}</span> : null}
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {action.preview?.creativeProjectId ? (
          <CreativeDesignPreview projectId={action.preview.creativeProjectId} />
        ) : action.preview?.imageAssetId ? (
          <AssetImage
            asset={{ assetId: action.preview.imageAssetId, name: image?.name ?? "Post image", url: image?.url ?? null }}
            className="aspect-square w-full shrink-0 rounded-md border sm:w-36"
          />
        ) : null}
        <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{action.preview?.caption}</p>
      </div>
      {action.reason ? <p className="mt-2 text-xs text-muted-foreground">Note: {action.reason}</p> : null}
      <div className="mt-3 border-t pt-3">
        {status ? <StatusLine status={status} platform={action.platform} /> : null}
        {pending ? (
          canPublish ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="brand" onClick={onApprove} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                Approve &amp; publish
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>
                <X /> Reject
              </Button>
              <span className="text-xs text-muted-foreground">
                {action.preview?.creativeProjectId ? "Publishes the design as shown. Edit it first if you like. " : ""}Nothing is posted until you approve.
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Waiting for a workspace owner or admin to approve publishing.</p>
          )
        ) : status?.approvalStatus === "failed" && canPublish ? (
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetry} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function NoticeCard({ action }: { action: RequiredAction }) {
  const { workspace } = useWorkspace()
  const needsConnection = action.state === "connection_required" || action.state === "blocked"
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center",
        action.state === "blocked" ? "border-warning/30 bg-warning-subtle/40" : "border-info/30 bg-info-subtle/50"
      )}
    >
      {action.state === "blocked" ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : <PlugZap className="size-4 shrink-0 text-info" />}
      <div className="flex-1 text-sm">
        <p className="font-medium">
          {EXTERNAL_ACTION_LABELS[action.actionType]} on {action.platform} —{" "}
          {action.state === "connection_required" ? "not connected" : action.state === "blocked" ? "needs attention" : "not automated yet"}
        </p>
        <p className="text-xs text-muted-foreground">
          {action.description}. {action.reason ?? (action.state === "connection_required" ? `No ${action.platform} account is connected in this workspace.` : "")}
        </p>
      </div>
      {needsConnection ? (
        <Button asChild size="sm" variant="outline">
          <Link href={workspaceHref(workspace.slug, "integrations")}>
            {action.state === "connection_required" ? `Connect ${action.platform}` : "Open Integrations"}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

/** External actions from a run: approval cards that publish on approval, or why an action can't run. */
export function ActionCards({ actions, assets }: { actions: RequiredAction[]; assets: GeneratedAsset[] }) {
  const { workspace } = useWorkspace()
  const canPublish = useCan("content.publish")
  const [statuses, setStatuses] = useState<Record<string, PublishStatus>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const idsKey = actions.flatMap((a) => (a.state === "awaiting_approval" && a.approvalId ? [a.approvalId] : [])).join(",")

  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    void loadPublishStatuses(workspace.slug, idsKey.split(",")).then((result) => {
      // Results of clicks made in this session win over the loaded snapshot.
      if (!cancelled && result.ok) setStatuses((prev) => ({ ...result.data, ...prev }))
    })
    return () => {
      cancelled = true
    }
  }, [idsKey, workspace.slug])

  const run = async (
    approvalId: string,
    platform: string,
    fn: (workspace: string, id: string) => ReturnType<typeof approvePublish>
  ): Promise<void> => {
    setBusy((b) => ({ ...b, [approvalId]: true }))
    setStatuses((s) => ({ ...s, [approvalId]: { approvalId, approvalStatus: "executing", externalPostId: null, permalink: null, error: null } }))
    const result = await fn(workspace.slug, approvalId)
    setBusy((b) => ({ ...b, [approvalId]: false }))
    if (!result.ok) {
      toast.error(result.error)
      // Show what the approval's state actually is now (e.g. replaced by a retry).
      const fresh = await loadPublishStatuses(workspace.slug, [approvalId])
      setStatuses((s) => {
        const next = { ...s }
        const current = fresh.ok ? fresh.data[approvalId] : undefined
        if (current) next[approvalId] = current
        else delete next[approvalId]
        return next
      })
      return
    }
    setStatuses((s) => ({ ...s, [approvalId]: result.data }))
    if (result.data.approvalStatus === "executed") toast.success(`Published to ${platform}.`)
    else if (result.data.approvalStatus === "rejected") toast.message("Rejected. Nothing was published.")
    else if (result.data.error) toast.error(result.data.error)
  }

  // Posts with a Creative Studio design publish the rendered design; others publish their image as is.
  const approveFor = (action: RequiredAction) => {
    const projectId = action.preview?.creativeProjectId
    return projectId ? (slug: string, id: string) => publishCreativePost(slug, id, projectId) : approvePublish
  }
  const retryFor = (action: RequiredAction) => (action.preview?.creativeProjectId ? approveFor(action) : retryPublish)

  const pendingApprovals = actions.filter(
    (a) => a.state === "awaiting_approval" && a.approvalId && (!statuses[a.approvalId] || statuses[a.approvalId]?.approvalStatus === "pending")
  )
  const approveAll = async () => {
    for (const action of pendingApprovals) {
      await run(action.approvalId!, action.platform, approveFor(action))
    }
  }

  if (actions.length === 0) return null
  return (
    <div className="space-y-2">
      {pendingApprovals.length > 1 && canPublish ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2.5 text-sm">
          <span className="flex-1">
            {pendingApprovals.length} posts are ready: {pendingApprovals.map((a) => a.platform).join(" and ")}.
          </span>
          <Button size="sm" variant="brand" onClick={() => void approveAll()} disabled={Object.values(busy).some(Boolean)}>
            <Send /> Approve &amp; publish all
          </Button>
        </div>
      ) : null}
      {actions.map((action, i) =>
        action.state === "awaiting_approval" && action.approvalId ? (
          <ApprovalCard
            key={action.approvalId}
            action={action}
            assets={assets}
            status={statuses[action.approvalId]}
            busy={Boolean(busy[action.approvalId])}
            canPublish={canPublish}
            onApprove={() => void run(action.approvalId!, action.platform, approveFor(action))}
            onReject={() => void run(action.approvalId!, action.platform, rejectPublish)}
            onRetry={() => void run(action.approvalId!, action.platform, retryFor(action))}
          />
        ) : (
          <NoticeCard key={`${action.actionType}-${action.platform}-${i}`} action={action} />
        )
      )}
    </div>
  )
}
