import { Check, Layers, PlugZap, Sparkles } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PageContainer, PageHeader } from "@/components/page/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NAV_ITEMS, workspaceHref } from "@/lib/navigation"
import { MODULE_ROADMAP } from "@/lib/roadmap"

async function PlannedModule({ params }: { params: PageProps<"/w/[orgSlug]/[module]">["params"] }) {
  const { orgSlug, module } = await params
  const item = NAV_ITEMS.find((i) => i.segment === module && i.status === "planned")
  const roadmap = MODULE_ROADMAP[module]
  if (!item || !roadmap) notFound()

  return (
    <PageContainer>
      <PageHeader
        title={item.label}
        description={item.description}
        meta={<Badge variant="muted">Phase {item.phase} · planned</Badge>}
        actions={
          roadmap.tryNow ? (
            <Button asChild variant="brand" size="sm">
              <Link href={`${workspaceHref(orgSlug, "command-centre")}?prompt=${encodeURIComponent(roadmap.tryNow)}`}>
                <Sparkles /> Try it in Command Centre
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What this module will do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {roadmap.capabilities.map((capability) => (
                <li key={capability} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {capability}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" /> Already in place
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {roadmap.foundations.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {roadmap.connections.length ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlugZap className="size-4 text-muted-foreground" /> Requires connections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {roadmap.connections.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))}
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={workspaceHref(orgSlug, "integrations")}>View integrations</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageContainer>
  )
}

export default function PlannedModulePage({ params }: PageProps<"/w/[orgSlug]/[module]">) {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full" />
        </PageContainer>
      }
    >
      <PlannedModule params={params} />
    </Suspense>
  )
}
