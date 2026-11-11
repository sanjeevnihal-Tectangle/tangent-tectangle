"use client"

import {
  CalendarPlus,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Globe,
  Loader2,
  SearchCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page/page-header"
import { ConnectionRequired, EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { runSeoResearch, saveBlogTopicToPlanner } from "@/features/seo/actions"
import type { SeoOutput } from "@/lib/ai/outputs"
import type { AnalyticsEventRecord } from "@/lib/domain/analytics"
import type { BusinessProfile } from "@/lib/domain/business"
import type { ConnectedAccountView } from "@/lib/domain/social"
import { workspaceHref } from "@/lib/navigation"

export function SeoWorkspace({
  business,
  searchConsoleAccounts,
  searchEvents,
}: {
  business: BusinessProfile | null
  searchConsoleAccounts: ConnectedAccountView[]
  searchEvents: AnalyticsEventRecord[]
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const canRunAi = useCan("ai.run")
  const canCreate = useCan("content.create")

  const defaultTopic = business
    ? `${business.industry} — ${business.productsAndServices.slice(0, 3).join(", ")}`
    : ""
  const [topic, setTopic] = useState(defaultTopic)
  const [targetCity, setTargetCity] = useState(business?.city ?? "Bengaluru")
  const [websiteUrl, setWebsiteUrl] = useState(business?.website || "https://example.in")
  const [seoData, setSeoData] = useState<SeoOutput | null>(null)
  const [pending, startTransition] = useTransition()

  // Snippet optimizer state
  const [serpTitle, setSerpTitle] = useState(
    business ? `${business.name} — ${business.industry} in ${business.city}` : "Your Business Name — Primary Keyword & City"
  )
  const [serpDesc, setSerpDesc] = useState(
    business?.description.slice(0, 150) ??
      "Discover authentic offerings crafted for you. Book online or visit us today."
  )
  const [serpSlug, setSerpSlug] = useState("/")
  const [copiedMeta, setCopiedMeta] = useState(false)
  const [copiedSchema, setCopiedSchema] = useState(false)

  const runResearch = () =>
    startTransition(async () => {
      const res = await runSeoResearch(workspace.slug, { topic, targetCity, websiteUrl })
      if (res.ok) {
        setSeoData(res.data)
        const firstMeta = res.data.metaSuggestions[0]
        if (firstMeta) {
          setSerpTitle(firstMeta.titleTag)
          setSerpDesc(firstMeta.metaDescription)
          setSerpSlug(firstMeta.slug)
        }
      } else {
        toast.error(res.error)
      }
    })

  const titleLen = serpTitle.trim().length
  const descLen = serpDesc.trim().length
  const isHttps = websiteUrl.trim().startsWith("https://")

  const deterministicChecks = [
    {
      label: "HTTPS protocol",
      ok: isHttps,
      detail: isHttps ? "Target URL uses HTTPS." : "URL should start with https:// for secure indexing.",
    },
    {
      label: "Title tag length (30–60 chars)",
      ok: titleLen >= 30 && titleLen <= 60,
      detail: `Current length: ${titleLen} characters.`,
    },
    {
      label: "Meta description length (120–160 chars)",
      ok: descLen >= 120 && descLen <= 160,
      detail: `Current length: ${descLen} characters.`,
    },
    {
      label: "Local city signal in title or description",
      ok:
        !targetCity ||
        serpTitle.toLowerCase().includes(targetCity.toLowerCase()) ||
        serpDesc.toLowerCase().includes(targetCity.toLowerCase()),
      detail: targetCity
        ? `Checks whether "${targetCity}" appears in the snippet for local search visibility.`
        : "No target city specified.",
    },
  ]

  const metaHtmlSnippet = `<title>${serpTitle}</title>\n<meta name="description" content="${serpDesc.replace(/"/g, "&quot;")}" />\n<meta property="og:title" content="${serpTitle.replace(/"/g, "&quot;")}" />\n<meta property="og:description" content="${serpDesc.replace(/"/g, "&quot;")}" />`

  const jsonLdSnippet = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: business?.name ?? workspace.name,
      description: serpDesc,
      url: websiteUrl || "https://example.in",
      address: {
        "@type": "PostalAddress",
        addressLocality: targetCity || business?.city || "Bengaluru",
        addressRegion: business?.region || "Karnataka",
        addressCountry: business?.country || "IN",
      },
    },
    null,
    2
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO Studio"
        description="Keyword research, SERP snippet optimisation, blog outlines and technical SEO checks tailored to your business."
        meta={<Badge variant="outline">Keyword volumes labelled as AI estimates until Search Console connects</Badge>}
      />

      {!aiConfigured ? (
        <NotConfigured
          title="AI SEO Specialist is not configured"
          description="Add an AI provider key to run keyword research and content planning. The SERP Snippet Optimizer and JSON-LD generator work without AI."
          envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]}
        />
      ) : null}

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">Keyword Research & Content</TabsTrigger>
          <TabsTrigger value="serp">SERP Snippet & Schema</TabsTrigger>
          <TabsTrigger value="audit">Technical Audit</TabsTrigger>
          <TabsTrigger value="gsc">
            Google Search Console ({searchConsoleAccounts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="space-y-6 pt-4">
          <form
            className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_12rem_14rem_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              runResearch()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="seo-topic">Products, services or seed topic</Label>
              <Input
                id="seo-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Specialty coffee roasters, artisanal bakery, corporate gifting"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-city">Target city / market</Label>
              <Input
                id="seo-city"
                value={targetCity}
                onChange={(e) => setTargetCity(e.target.value)}
                placeholder="e.g. Bengaluru"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-url">Website URL</Label>
              <Input
                id="seo-url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourbrand.in"
              />
            </div>
            <Button
              type="submit"
              variant="brand"
              disabled={!aiConfigured || !canRunAi || pending || topic.trim().length < 3}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {pending ? "Researching…" : "Run SEO research"}
            </Button>
          </form>

          {seoData ? (
            <div className="space-y-6">
              <Card size="sm">
                <CardContent className="pt-4 text-sm text-muted-foreground">
                  {seoData.summary}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Target keyword clusters ({seoData.keywords.length})
                  </h3>
                  <Badge variant="warning">Volume & difficulty: AI Estimate</Badge>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Keyword</th>
                        <th className="py-2 font-medium">Search intent</th>
                        <th className="py-2 font-medium">Est. monthly volume</th>
                        <th className="py-2 font-medium">Difficulty</th>
                        <th className="px-3 py-2 font-medium">Recommended page</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {seoData.keywords.map((kw) => (
                        <tr key={kw.keyword}>
                          <td className="px-3 py-2 font-medium">{kw.keyword}</td>
                          <td className="py-2">
                            <Badge variant="outline" className="capitalize">
                              {kw.intent}
                            </Badge>
                          </td>
                          <td className="tabular py-2 text-xs text-muted-foreground">
                            {kw.estimatedMonthlyVolume}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={
                                kw.difficulty === "low"
                                  ? "success"
                                  : kw.difficulty === "medium"
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {kw.difficulty}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {kw.targetPage}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">SEO blog & content plan</h3>
                  {seoData.blogTopics.map((blog) => (
                    <BlogTopicCard
                      key={blog.title}
                      blog={blog}
                      canCreate={canCreate}
                      slug={workspace.slug}
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Page meta tag recommendations</h3>
                  {seoData.metaSuggestions.map((meta) => (
                    <Card key={meta.slug} size="sm">
                      <CardContent className="space-y-2 pt-4 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {meta.pageName}{" "}
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-muted-foreground">
                              {meta.slug}
                            </code>
                          </span>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setSerpTitle(meta.titleTag)
                              setSerpDesc(meta.metaDescription)
                              setSerpSlug(meta.slug)
                              toast.success("Loaded into SERP Snippet Optimizer")
                            }}
                          >
                            Load in preview
                          </Button>
                        </div>
                        <p className="font-medium text-brand-emphasis">{meta.titleTag}</p>
                        <p className="text-xs text-muted-foreground">{meta.metaDescription}</p>
                        <p className="text-xs">
                          <span className="text-muted-foreground">H1: </span>
                          {meta.h1}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={SearchCheck}
              title="Run keyword & content research"
              description="The SEO Specialist generates local and commercial keyword clusters, page meta tags and blog outlines using your business profile."
            />
          )}
        </TabsContent>

        <TabsContent value="serp" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Meta tag editor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="serp-title">Title tag</Label>
                    <span
                      className={
                        titleLen >= 30 && titleLen <= 60
                          ? "tabular text-xs text-success"
                          : "tabular text-xs text-warning"
                      }
                    >
                      {titleLen}/60 chars
                    </span>
                  </div>
                  <Input
                    id="serp-title"
                    value={serpTitle}
                    onChange={(e) => setSerpTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="serp-desc">Meta description</Label>
                    <span
                      className={
                        descLen >= 120 && descLen <= 160
                          ? "tabular text-xs text-success"
                          : "tabular text-xs text-warning"
                      }
                    >
                      {descLen}/160 chars
                    </span>
                  </div>
                  <Textarea
                    id="serp-desc"
                    rows={3}
                    value={serpDesc}
                    onChange={(e) => setSerpDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="serp-slug">URL path</Label>
                  <Input
                    id="serp-slug"
                    value={serpSlug}
                    onChange={(e) => setSerpSlug(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(metaHtmlSnippet)
                      setCopiedMeta(true)
                      setTimeout(() => setCopiedMeta(false), 1500)
                    }}
                  >
                    {copiedMeta ? <Check /> : <Copy />}
                    {copiedMeta ? "Copied HTML tags" : "Copy HTML <meta> tags"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `<script type="application/ld+json">\n${jsonLdSnippet}\n</script>`
                      )
                      setCopiedSchema(true)
                      setTimeout(() => setCopiedSchema(false), 1500)
                    }}
                  >
                    {copiedSchema ? <Check /> : <Code2 />}
                    {copiedSchema ? "Copied JSON-LD" : "Copy LocalBusiness JSON-LD"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" /> Google Search SERP preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="rounded-lg border bg-background p-4">
                    <p className="truncate text-xs text-muted-foreground">
                      {websiteUrl.replace(/\/$/, "")}
                      {serpSlug.startsWith("/") ? serpSlug : `/${serpSlug}`}
                    </p>
                    <p className="mt-1 line-clamp-1 font-sans text-lg font-medium text-info hover:underline">
                      {serpTitle || "Untitled page"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {serpDesc || "Add a meta description to preview how Google renders your page snippet."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="text-sm">Generated JSON-LD structured data</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                    {jsonLdSnippet}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>On-page & snippet checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deterministicChecks.map((check) => (
                  <div key={check.label} className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
                    {check.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                    )}
                    <div>
                      <p className="font-medium">{check.label}</p>
                      <p className="text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI technical & local SEO priorities</CardTitle>
              </CardHeader>
              <CardContent>
                {seoData?.technicalChecks.length ? (
                  <ul className="space-y-2 text-sm">
                    {seoData.technicalChecks.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-brand">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run SEO research in the first tab to generate tailored technical and Google Business Profile recommendations.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gsc" className="space-y-4 pt-4">
          {searchConsoleAccounts.length === 0 ? (
            <ConnectionRequired
              provider="Google Search Console"
              description="Connect Google Search Console via OAuth or direct property setup to ingest real search queries, clicks, impressions and average ranking positions."
              href={`${workspaceHref(workspace.slug, "integrations")}?connect=search_console`}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Connected Search Console properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {searchConsoleAccounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between rounded border p-2.5 text-sm">
                    <span className="font-medium">{acc.displayName}</span>
                    <Badge variant="success">Connected</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {searchEvents.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Query / Entity</th>
                    <th className="py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {searchEvents.map((ev) => (
                    <tr key={ev.id}>
                      <td className="tabular px-3 py-2 text-xs text-muted-foreground">{ev.occurredOn}</td>
                      <td className="py-2 font-medium">{ev.entityId ?? ev.entityType}</td>
                      <td className="py-2 text-xs">{ev.metric}</td>
                      <td className="tabular px-3 py-2">{ev.value.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BlogTopicCard({
  blog,
  canCreate,
  slug,
}: {
  blog: SeoOutput["blogTopics"][number]
  canCreate: boolean
  slug: string
}) {
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <Card size="sm">
      <CardContent className="space-y-2 pt-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{blog.title}</p>
            <Badge variant="outline" className="mt-1">
              Keyword: {blog.primaryKeyword}
            </Badge>
          </div>
          {canCreate ? (
            <Button
              variant="outline"
              size="xs"
              disabled={pending || saved}
              onClick={() =>
                startTransition(async () => {
                  const res = await saveBlogTopicToPlanner(slug, blog)
                  if (res.ok) {
                    setSaved(true)
                    toast.success("Saved blog outline to Content Planner")
                  } else {
                    toast.error(res.error)
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : saved ? <Check /> : <CalendarPlus />}
              {saved ? "In planner" : "Add to planner"}
            </Button>
          ) : null}
        </div>
        {blog.outline.length ? (
          <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
            {blog.outline.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  )
}

