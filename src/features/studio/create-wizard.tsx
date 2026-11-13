"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, ImagePlus, Lightbulb, Loader2, RefreshCw, Sparkles, Wand2, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { BrandProductPicker } from "@/components/brand/brand-product-picker"
import { NotConfigured } from "@/components/states/states"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AssetPicker } from "@/features/assets/asset-picker"
import { composeDesign, createBlank, generateConcepts, generateImage, suggestIdeas } from "@/features/studio/actions"
import type { CreativeOutput } from "@/lib/ai/outputs"
import {
  CREATIVE_FORMATS,
  CREATIVE_OBJECTIVES,
  CREATIVE_PLATFORMS,
  PLATFORM_LABELS,
  type CreativeFormat,
  type CreativePlatform,
} from "@/lib/creative/formats"
import type { BrandOption, ProductOption } from "@/lib/domain/brand-options"
import type { MediaAsset } from "@/lib/domain/media"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

type Concept = CreativeOutput["concepts"][number]
const STEPS = ["Objective", "Format", "Brief", "Concepts"] as const

function FormatShape({ format }: { format: CreativeFormat }) {
  const max = 34
  const ratio = format.width / format.height
  const w = ratio >= 1 ? max : max * ratio
  const h = ratio >= 1 ? max / ratio : max
  return <span className="block rounded-[3px] border-2 border-current" style={{ width: w, height: Math.max(6, h) }} aria-hidden />
}

export function CreateWizard({
  initialFormatId,
  category,
  initialImage,
  initialBrief,
  imageConfigured,
  brands,
  products,
  initialBrandId,
  initialProductId,
}: {
  initialFormatId: string | null
  category: "image" | "social" | "ad" | null
  initialImage: MediaAsset | null
  initialBrief: string
  imageConfigured: boolean
  brands: BrandOption[]
  products: ProductOption[]
  initialBrandId: string | null
  initialProductId: string | null
}) {
  const { workspace, aiConfigured } = useWorkspace()
  const router = useRouter()
  const studio = workspaceHref(workspace.slug, "studio")

  const initialFormat = CREATIVE_FORMATS.find((f) => f.id === initialFormatId) ?? null
  const [step, setStep] = useState(0)
  const [objective, setObjective] = useState<string>("awareness")
  const [platform, setPlatform] = useState<CreativePlatform | "all">(initialFormat?.platform ?? "all")
  const [format, setFormat] = useState<CreativeFormat | null>(initialFormat)
  const [description, setDescription] = useState(initialBrief)
  const [image, setImage] = useState<MediaAsset | null>(initialImage)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [imagePrompt, setImagePrompt] = useState("")
  const [ideas, setIdeas] = useState<string[]>([])
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [target, setTarget] = useState<{ brandId: string | null; productId: string | null | undefined }>({
    brandId: initialBrandId,
    productId: initialProductId,
  })
  const designTarget = { brandProfileId: target.brandId, productId: target.productId ?? null }
  const [busy, setBusy] = useState<null | "ideas" | "concepts" | "design" | "image" | "blank">(null)
  const [, startTransition] = useTransition()

  const formats = useMemo(
    () =>
      CREATIVE_FORMATS.filter((f) => {
        if (platform !== "all" && f.platform !== platform) return false
        if (category === "social") return f.category === "social" || f.category === "video_cover"
        if (category === "ad") return f.category === "ad" || f.category === "banner"
        return true
      }),
    [platform, category]
  )

  const run = <T,>(kind: NonNullable<typeof busy>, task: () => Promise<T>) => {
    setBusy(kind)
    startTransition(async () => {
      try {
        await task()
      } finally {
        setBusy(null)
      }
    })
  }

  const loadIdeas = () =>
    run("ideas", async () => {
      if (!format) return
      const result = await suggestIdeas(workspace.slug, { objective, formatId: format.id, ...designTarget })
      if (result.ok) setIdeas(result.data)
      else toast.error(result.error)
    })

  const loadConcepts = () => {
    if (!format) return
    // Show the loading state right away; updates inside the transition only commit when it finishes.
    setStep(3)
    setConcepts(null)
    setSelected(null)
    run("concepts", async () => {
      const result = await generateConcepts(workspace.slug, { objective, formatId: format.id, description, ...designTarget })
      if (result.ok) {
        setConcepts(result.data)
        setSelected(0)
      } else {
        toast.error(result.error)
        setStep(2)
      }
    })
  }

  const makeImage = () =>
    run("image", async () => {
      if (!format) return
      const result = await generateImage(workspace.slug, { prompt: imagePrompt || description, formatId: format.id })
      if (result.ok) {
        setImage(result.data)
        toast.success("Image generated and saved to your Asset Library")
      } else toast.error(result.error)
    })

  const makeDesign = () =>
    run("design", async () => {
      if (!format) return
      const concept = selected !== null && concepts ? concepts[selected] : null
      const result = await composeDesign(workspace.slug, {
        objective,
        formatId: format.id,
        description,
        concept: concept ? { name: concept.name, visualDirection: concept.visualDirection, imagePrompt: concept.imagePrompt } : null,
        imageAssetId: image?.id ?? null,
        ...designTarget,
      })
      if (result.ok) router.push(`${studio}/${result.data.projectId}`)
      else toast.error(result.error)
    })

  const makeBlank = () =>
    run("blank", async () => {
      if (!format) return
      const result = await createBlank(workspace.slug, format.id, designTarget)
      if (result.ok) router.push(`${studio}/${result.data.projectId}`)
      else toast.error(result.error)
    })

  const canContinue = step === 0 ? Boolean(objective) : step === 1 ? Boolean(format) : true

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Creative Studio">
          <Link href={studio}><X /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create a design</h1>
          <p className="text-sm text-muted-foreground">Tangent&apos;s Graphic Designer and Copywriter work from your brand kit.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">Designing for</span>
        <BrandProductPicker
          brands={brands}
          products={products}
          brandId={target.brandId}
          productId={target.productId ?? null}
          onChange={(next) => {
            setTarget(next)
            // Ideas and concepts were written for the previous brand/product.
            setIdeas([])
            setConcepts(null)
            setSelected(null)
            if (step === 3) setStep(2)
          }}
          size="sm"
          disabled={busy !== null}
        />
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", i === step && "border-foreground font-medium", i < step && "border-brand/40 text-brand-emphasis")}>
            <span className={cn("flex size-4 items-center justify-center rounded-full text-[0.6rem]", i < step ? "bg-brand text-brand-foreground" : "bg-muted")}>
              {i < step ? <Check className="size-2.5" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.section key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-4">
          {step === 0 ? (
            <>
              <h2 className="font-sans text-sm font-medium">What should this design achieve?</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CREATIVE_OBJECTIVES.map((o) => (
                  <button key={o.id} type="button" aria-pressed={objective === o.id} onClick={() => setObjective(o.id)} className={cn("rounded-lg border p-3 text-left text-sm transition-colors", objective === o.id ? "border-brand bg-brand-subtle/50 font-medium" : "hover:bg-muted")}>
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="font-sans text-sm font-medium">Where will it run?</h2>
              <div className="flex flex-wrap gap-1.5">
                {(["all", ...CREATIVE_PLATFORMS] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)} className={cn("rounded-full border px-3 py-1 text-xs", platform === p ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
                    {p === "all" ? "All platforms" : PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {formats.map((f) => (
                  <button key={f.id} type="button" aria-pressed={format?.id === f.id} onClick={() => setFormat(f)} className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors", format?.id === f.id ? "border-brand bg-brand-subtle/50" : "hover:bg-muted")}>
                    <span className="flex size-10 shrink-0 items-center justify-center text-muted-foreground"><FormatShape format={f} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{f.label}</span>
                      <span className="block text-xs text-muted-foreground">{PLATFORM_LABELS[f.platform]} · {f.maxPages > 1 ? `up to ${f.maxPages} slides` : `${f.width}×${f.height}`}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 2 && format ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-3">
                <Label htmlFor="brief">Describe the design</Label>
                <Textarea id="brief" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Announce our winter menu — slow-cooked nihari and sarson da saag, available from Friday at all outlets." maxLength={2000} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={loadIdeas} disabled={!aiConfigured || busy !== null}>
                    {busy === "ideas" ? <Loader2 className="animate-spin" /> : <Lightbulb />} Suggest ideas
                  </Button>
                  <span className="text-xs text-muted-foreground">Uses your business profile, brand and the current season.</span>
                </div>
                {ideas.length ? (
                  <ul className="space-y-1.5">
                    {ideas.map((idea) => (
                      <li key={idea}>
                        <button type="button" onClick={() => setDescription(idea)} className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">{idea}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Photo (optional)</Label>
                {image?.url ? (
                  <div className="relative overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img src={image.url} alt={image.name} className="aspect-square w-full object-cover" />
                    <Button size="icon-xs" variant="secondary" className="absolute top-2 right-2" onClick={() => setImage(null)} aria-label="Remove photo"><X /></Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPickerOpen(true)} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted">
                    <ImagePlus className="size-5" /> Choose from library
                  </button>
                )}
                <div className="space-y-1.5 rounded-lg border p-2.5">
                  <Textarea rows={2} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="…or describe a photo to generate" className="text-xs" disabled={!imageConfigured} />
                  <Button size="sm" variant="outline" className="w-full" onClick={makeImage} disabled={!imageConfigured || busy !== null || (imagePrompt || description).trim().length < 10}>
                    {busy === "image" ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate photo
                  </Button>
                  {!imageConfigured ? <p className="text-[0.7rem] text-muted-foreground">Image generation needs IMAGE_PROVIDER=openai and an OpenAI key with credits.</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-sm font-medium">Choose a visual direction</h2>
                <Button variant="ghost" size="sm" onClick={loadConcepts} disabled={busy !== null}>
                  <RefreshCw /> New concepts
                </Button>
              </div>
              {concepts === null ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-56 animate-pulse rounded-lg border bg-muted/50" />
                  ))}
                  <p className="text-sm text-muted-foreground md:col-span-3">
                    <Loader2 className="mr-2 inline size-4 animate-spin" />The Graphic Designer is exploring three directions for your {format?.label.toLowerCase()}…
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {concepts.map((c, i) => (
                    <button key={c.name} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)} className={cn("flex flex-col rounded-lg border p-4 text-left transition-colors", selected === i ? "border-brand bg-brand-subtle/40 ring-1 ring-brand" : "hover:bg-muted")}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        {selected === i ? <Check className="size-4 text-brand" /> : null}
                      </span>
                      <span className="mt-2 text-sm text-muted-foreground">{c.visualDirection}</span>
                      <span className="mt-3 text-xs"><span className="text-muted-foreground">Copy: </span>{c.copyOverlay}</span>
                      <span className="mt-3 flex flex-wrap gap-1">
                        {c.colorUsage.slice(0, 3).map((u) => {
                          const hex = u.match(/#[0-9a-fA-F]{6}/)?.[0]
                          return hex ? <span key={u} className="size-4 rounded-sm border" style={{ backgroundColor: hex }} title={u} /> : null
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </motion.section>
      </AnimatePresence>

      {!aiConfigured && step >= 2 ? (
        <NotConfigured title="AI design generation is not configured" description="You can still start from a blank canvas or a template." envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy !== null}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-wrap gap-2">
          {step >= 2 && format ? (
            <Button variant="outline" onClick={makeBlank} disabled={busy !== null}>
              {busy === "blank" ? <Loader2 className="animate-spin" /> : null} Blank canvas
            </Button>
          ) : null}
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continue <ArrowRight />
            </Button>
          ) : step === 2 ? (
            <Button variant="brand" onClick={loadConcepts} disabled={!aiConfigured || busy !== null || description.trim().length < 5}>
              {busy === "concepts" ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate concepts
            </Button>
          ) : (
            <Button variant="brand" onClick={makeDesign} disabled={busy !== null || !concepts}>
              {busy === "design" ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {busy === "design" ? "Designing…" : "Generate design"}
            </Button>
          )}
        </div>
      </div>
      {image ? <p className="text-right text-xs text-muted-foreground">Using photo: <Badge variant="outline">{image.name}</Badge></p> : null}

      <AssetPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setImage} title="Choose a photo for this design" />
    </div>
  )
}
