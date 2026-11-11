"use client"

import { formatDistanceToNowStrict } from "date-fns"
import {
  Clapperboard,
  Copy,
  GalleryHorizontalEnd,
  ImageIcon,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { AssetUrls } from "@/components/creative/design-renderer"
import { FitThumbnail } from "@/components/creative/fit-thumbnail"
import { PageHeader } from "@/components/page/page-header"
import { EmptyState } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createFromTemplate, deleteProject, duplicateProject } from "@/features/studio/actions"
import type { DesignDocument } from "@/lib/creative/document"
import { getFormat } from "@/lib/creative/formats"
import type { BrandProfile } from "@/lib/domain/brand"
import type { CreativeProjectSummary } from "@/lib/domain/creative"
import { workspaceHref } from "@/lib/navigation"

export interface TemplatePreview {
  id: string
  name: string
  description: string
  formatId: string
  document: DesignDocument
}

const ENTRY_POINTS = [
  { title: "Create new", description: "Guided: objective → concepts → design", icon: Sparkles, query: "" },
  { title: "Image Studio", description: "Photo-led posts and AI imagery", icon: ImageIcon, query: "?category=image" },
  { title: "Social designs", description: "Posts, stories and covers", icon: Share2, query: "?category=social" },
  { title: "Ad creatives", description: "Feed, display and LinkedIn ads", icon: Megaphone, query: "?category=ad" },
  { title: "Carousel builder", description: "Multi-slide Instagram carousels", icon: GalleryHorizontalEnd, query: "?format=instagram_carousel" },
] as const

function ProjectCard({ project, assetUrls, onChanged }: { project: CreativeProjectSummary; assetUrls: AssetUrls; onChanged: () => void }) {
  const { workspace } = useWorkspace()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const href = `${workspaceHref(workspace.slug, "studio")}/${project.id}`

  return (
    <li className="group relative">
      <Link href={href} className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-3 transition-colors group-hover:bg-muted">
          <div className="w-full max-w-full" style={{ maxHeight: "100%", width: project.preview.width >= project.preview.height ? "100%" : `${(project.preview.width / project.preview.height) * 100}%` }}>
            <FitThumbnail document={project.preview} assetUrls={assetUrls} />
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {getFormat(project.formatId).label} · {formatDistanceToNowStrict(new Date(project.updatedAt))} ago
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${project.name}`} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={href}><PenLine /> Open editor</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await duplicateProject(workspace.slug, project.id)
                  if (result.ok) router.push(`${workspaceHref(workspace.slug, "studio")}/${result.data.projectId}`)
                  else toast.error(result.error)
                })
              }
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                if (!window.confirm(`Delete "${project.name}"?`)) return
                startTransition(async () => {
                  const result = await deleteProject(workspace.slug, project.id)
                  if (result.ok) {
                    toast.success("Project deleted")
                    onChanged()
                  } else toast.error(result.error)
                })
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

export function StudioHome({
  projects,
  templates,
  assetUrls,
  brand,
  businessName,
}: {
  projects: CreativeProjectSummary[]
  templates: TemplatePreview[]
  assetUrls: AssetUrls
  brand: BrandProfile | null
  businessName: string
}) {
  const { workspace } = useWorkspace()
  const canCreate = useCan("content.create")
  const router = useRouter()
  const [items, setItems] = useState(projects)
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null)
  const studio = workspaceHref(workspace.slug, "studio")

  const startFromTemplate = async (templateId: string) => {
    setUsingTemplate(templateId)
    const result = await createFromTemplate(workspace.slug, templateId)
    if (result.ok) router.push(`${studio}/${result.data.projectId}`)
    else {
      toast.error(result.error)
      setUsingTemplate(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Creative Studio"
        description="Concept, design and export on-brand creatives. Every design uses your brand kit automatically."
        actions={
          canCreate ? (
            <Button asChild variant="brand" size="sm">
              <Link href={`${studio}/new`}><Plus /> Create new</Link>
            </Button>
          ) : null
        }
      />

      <section aria-label="Start creating" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {ENTRY_POINTS.map((entry) => (
          <Link
            key={entry.title}
            href={`${studio}/new${entry.query}`}
            className="group rounded-lg border bg-card p-3.5 transition-colors hover:border-brand/40 hover:bg-brand-subtle/30"
          >
            <entry.icon className="size-4 text-brand" />
            <p className="mt-3 text-sm font-medium">{entry.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
          </Link>
        ))}
        <Link href={`${studio}/copy`} className="group rounded-lg border bg-card p-3.5 transition-colors hover:border-brand/40 hover:bg-brand-subtle/30">
          <PenLine className="size-4 text-brand" />
          <p className="mt-3 text-sm font-medium">Copy Studio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Captions, ad copy and headlines</p>
        </Link>
        <Link href={`${studio}/video`} className="group rounded-lg border bg-card p-3.5 transition-colors hover:border-brand/40 hover:bg-brand-subtle/30">
          <Clapperboard className="size-4 text-brand" />
          <p className="mt-3 text-sm font-medium">Video Studio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Reels & Shorts scripts & storyboards</p>
        </Link>
      </section>

      <Tabs defaultValue={items.length ? "projects" : "templates"}>
        <TabsList>
          <TabsTrigger value="projects">My projects{items.length ? ` (${items.length})` : ""}</TabsTrigger>
          <TabsTrigger value="templates">Template library</TabsTrigger>
          <TabsTrigger value="brand">Brand kit</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="pt-4">
          {items.length === 0 ? (
            <EmptyState
              icon={Palette}
              title="No designs yet"
              description="Start with the guided flow, or pick a template that's already styled with your brand."
              action={canCreate ? <Button asChild variant="brand"><Link href={`${studio}/new`}><Sparkles /> Create your first design</Link></Button> : undefined}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((project) => (
                <ProjectCard key={project.id} project={project} assetUrls={assetUrls} onChanged={() => setItems((list) => list.filter((p) => p.id !== project.id))} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="templates" className="pt-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Styled live with {brand ? <span className="font-medium text-foreground">{brand.name}</span> : "your brand"}. Using a template creates an editable copy.
          </p>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  disabled={!canCreate || usingTemplate !== null}
                  onClick={() => void startFromTemplate(template.id)}
                  className="group block w-full text-left disabled:cursor-not-allowed"
                >
                  <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-3 transition-colors group-hover:bg-muted">
                    <div style={{ width: template.document.width >= template.document.height ? "100%" : `${(template.document.width / template.document.height) * 100}%` }}>
                      <FitThumbnail document={template.document} assetUrls={{}} />
                    </div>
                    {usingTemplate === template.id ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <Loader2 className="size-5 animate-spin" />
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{getFormat(template.formatId).label} · {template.description}</p>
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="brand" className="pt-4">
          {brand ? (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {brand.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={brand.logoUrl} alt={`${businessName} logo`} className="h-10 w-auto max-w-32 object-contain" />
                  ) : (
                    <span className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">No logo</span>
                  )}
                  <div>
                    <p className="font-medium">{brand.name}</p>
                    <p className="text-xs text-muted-foreground">{brand.messaging.tagline || "No tagline"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {brand.colors.map((c) => (
                    <div key={`${c.name}-${c.hex}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                      <span className="size-4 rounded-sm border" style={{ backgroundColor: c.hex }} />
                      {c.name} <span className="font-mono text-muted-foreground">{c.hex}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {brand.voice.traits.map((t) => <Badge key={t} variant="muted">{t}</Badge>)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Typography: {brand.typography.heading || "—"} / {brand.typography.body || "—"}. Designs use the closest available typefaces.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={workspaceHref(workspace.slug, "brand")}>Edit in Brand Intelligence</Link>
              </Button>
            </div>
          ) : (
            <EmptyState icon={Palette} title="No brand profile" description="Create a brand profile so designs use your colours, logo and voice." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
