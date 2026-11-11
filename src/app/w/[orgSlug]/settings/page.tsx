import { History } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { PageContainer, PageHeader } from "@/components/page/page-header"
import { EmptyState } from "@/components/states/states"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { AI_PROVIDER_LABELS, configuredProviderIds } from "@/lib/ai/provider"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import { DEFAULT_PLANS, ENTITLEMENT_LABELS, PLAN_IDS } from "@/lib/billing/plans"
import { formatINR, formatNumber } from "@/lib/format"
import { resolveWorkspace } from "@/lib/workspace/server"

export const metadata: Metadata = { title: "Settings" }

async function SettingsContent({ params }: { params: PageProps<"/w/[orgSlug]/settings">["params"] }) {
  const { orgSlug } = await params
  const { context, repository } = await resolveWorkspace(orgSlug)
  const canViewAudit = context.permissions.includes("audit.view")
  const audit = canViewAudit ? await repository.listAudit(30) : []
  const plan = DEFAULT_PLANS[context.workspace.planId]
  const aiProviders = configuredProviderIds()

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{context.workspace.name}</dd>
            <dt className="text-muted-foreground">URL</dt>
            <dd className="font-mono text-xs">/w/{context.workspace.slug}</dd>
            <dt className="text-muted-foreground">Your role</dt>
            <dd>{ROLE_LABELS[context.role]}</dd>
            <dt className="text-muted-foreground">Data mode</dt>
            <dd>
              {context.mode === "demo" ? (
                <Badge variant="warning">Demo · stored locally ({repository.persistence === "demo-file" ? "file" : "memory"})</Badge>
              ) : (
                <Badge variant="success">Live · Supabase</Badge>
              )}
            </dd>
            <dt className="text-muted-foreground">AI providers</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {aiProviders.length ? (
                aiProviders.map((id, index) => (
                  <Badge key={id} variant={index === 0 ? "success" : "outline"}>
                    {index === 0 ? "Primary" : "Failover"}: {AI_PROVIDER_LABELS[id]}
                  </Badge>
                ))
              ) : (
                <Badge variant="muted">Not configured</Badge>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card id="usage">
        <CardHeader>
          <CardTitle>
            {plan.name} plan {plan.monthlyPricePaise !== null ? `· ${formatINR(plan.monthlyPricePaise / 100)}/month` : "· custom"}
          </CardTitle>
          <CardDescription>Usage this month. Advertising spend is billed by ad platforms, never through Tangent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {context.usage.map((u) => (
            <div key={u.key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{ENTITLEMENT_LABELS[u.key]}</span>
                <span className="tabular text-muted-foreground">
                  {formatNumber(u.used)} / {u.limit === null ? "Unlimited" : formatNumber(u.limit)}
                </span>
              </div>
              <Progress value={u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0} aria-label={`${ENTITLEMENT_LABELS[u.key]} used`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Online checkout via Razorpay ships in Phase 6. Limits are configuration, not code.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const p = DEFAULT_PLANS[id]
            const current = id === context.workspace.planId
            return (
              <div key={id} className={current ? "rounded-lg border-2 border-brand p-4" : "rounded-lg border p-4"}>
                <div className="flex items-center justify-between">
                  <p className="font-heading font-semibold">{p.name}</p>
                  {current ? <Badge variant="brand">Current</Badge> : null}
                </div>
                <p className="mt-1 font-heading text-xl font-semibold">
                  {p.monthlyPricePaise === null ? "Custom" : formatINR(p.monthlyPricePaise / 100)}
                  {p.monthlyPricePaise !== null ? <span className="text-xs font-normal text-muted-foreground"> /month</span> : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                <ul className="mt-3 space-y-1 text-xs">
                  {(["ai_credits_monthly", "image_generations_monthly", "connected_accounts", "team_members"] as const).map((key) => (
                    <li key={key} className="flex justify-between">
                      <span className="text-muted-foreground">{ENTITLEMENT_LABELS[key]}</span>
                      <span className="tabular">{p.entitlements[key] === null ? "Custom" : formatNumber(p.entitlements[key] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>Immutable record of changes, AI runs and approval decisions.</CardDescription>
        </CardHeader>
        <CardContent>
          {!canViewAudit ? (
            <p className="text-sm text-muted-foreground">Your role cannot view audit history.</p>
          ) : audit.length === 0 ? (
            <EmptyState icon={History} title="No activity recorded yet" description="Edits, AI runs and approval decisions will appear here." />
          ) : (
            <ul className="divide-y text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className="tabular w-36 shrink-0 text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.68rem]">{entry.action}</code>
                  <span className="min-w-0 flex-1">{entry.summary}</span>
                  <span className="text-xs text-muted-foreground capitalize">{entry.actor.type}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function SettingsPage({ params }: PageProps<"/w/[orgSlug]/settings">) {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Workspace, plan, usage and audit history." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SettingsContent params={params} />
      </Suspense>
    </PageContainer>
  )
}
