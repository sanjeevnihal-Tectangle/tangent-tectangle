"use client"

import { ArrowLeft, CalendarPlus, Check, Copy, Loader2, PenLine, Sparkles } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page/page-header"
import { EmptyState, NotConfigured } from "@/components/states/states"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { copyToPlanner, generateCopy } from "@/features/copy/actions"
import { COPY_PURPOSES } from "@/features/copy/purposes"
import type { CopyOutput } from "@/lib/ai/outputs"
import { CONTENT_PLATFORM_LABELS, CONTENT_PLATFORMS, type ContentPlatform } from "@/lib/domain/content"
import { workspaceHref } from "@/lib/navigation"

const PLATFORMS = ["Instagram", "Facebook", "YouTube", "LinkedIn", "Google Ads", "WhatsApp", "Website"] as const

function plannerPlatform(platform: string): ContentPlatform {
  const match = CONTENT_PLATFORMS.find((p) => CONTENT_PLATFORM_LABELS[p].toLowerCase() === platform.toLowerCase())
  return match ?? "instagram"
}

type Variant = CopyOutput["variants"][number]

function VariantCard({ variant }: { variant: Variant }) {
  const { workspace } = useWorkspace()
  const canCreate = useCan("content.create")
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const full = [variant.headline, variant.body, variant.callToAction, variant.hashtags.join(" ")].filter(Boolean).join("\n\n")

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span>{variant.platform} · {variant.format}</span>
        <span className="tabular">{variant.body.length} chars</span>
      </div>
      <div className="flex-1 space-y-2 p-3 text-sm">
        {variant.headline ? <p className="font-medium">{variant.headline}</p> : null}
        <p className="whitespace-pre-wrap">{variant.body}</p>
        {variant.callToAction ? <p className="text-brand-emphasis">{variant.callToAction}</p> : null}
        {variant.hashtags.length ? <p className="text-xs text-muted-foreground">{variant.hashtags.join(" ")}</p> : null}
      </div>
      <div className="flex gap-1 border-t p-2">
        <Button
          variant="ghost"
          size="sm"
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
            size="sm"
            disabled={pending || saved}
            onClick={() =>
              startTransition(async () => {
                const result = await copyToPlanner(workspace.slug, {
                  platform: plannerPlatform(variant.platform),
                  headline: variant.headline,
                  body: variant.body,
                  callToAction: variant.callToAction,
                  hashtags: variant.hashtags,
                })
                if (result.ok) {
                  setSaved(true)
                  toast.success("Saved as a draft post", { action: { label: "Open planner", onClick: () => (window.location.href = workspaceHref(workspace.slug, "planner")) } })
                } else toast.error(result.error)
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : saved ? <Check /> : <CalendarPlus />} {saved ? "In planner" : "Add to planner"}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function CopyStudio() {
  const { workspace, aiConfigured } = useWorkspace()
  const canRun = useCan("ai.run")
  const [purpose, setPurpose] = useState<(typeof COPY_PURPOSES)[number]>("Organic social post")
  const [platform, setPlatform] = useState<string>("Instagram")
  const [brief, setBrief] = useState("")
  const [guidance, setGuidance] = useState("")
  const [variants, setVariants] = useState(3)
  const [output, setOutput] = useState<CopyOutput | null>(null)
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      const result = await generateCopy(workspace.slug, { purpose, platform, brief, variants, guidance })
      if (result.ok) setOutput(result.data)
      else toast.error(result.error)
    })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Creative Studio">
          <Link href={workspaceHref(workspace.slug, "studio")}><ArrowLeft /></Link>
        </Button>
        <PageHeader title="Copy Studio" description="Platform-native captions, ads and descriptions in your brand voice — checked against your prohibited phrases." />
      </div>

      {!aiConfigured ? <NotConfigured title="AI is not configured" description="Add an AI provider key to generate copy." envVars={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]} /> : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <form
          className="space-y-4 self-start rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <div className="space-y-1.5">
            <Label>What are you writing?</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
              <SelectTrigger className="w-full"><SelectValue>{purpose}</SelectValue></SelectTrigger>
              <SelectContent>{COPY_PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-full"><SelectValue>{platform}</SelectValue></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brief">Brief</Label>
            <Textarea id="brief" rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Weekday ₹299 lunch combos at all three outlets, starting Monday. Target office workers nearby." maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guidance">Extra guidance (optional)</Label>
            <Input id="guidance" value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="e.g. Playful, mention free delivery" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variants">Variants</Label>
            <Input id="variants" type="number" min={1} max={10} value={variants} onChange={(e) => setVariants(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className="w-24" />
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={!aiConfigured || !canRun || pending || brief.trim().length < 5}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Writing…" : "Generate copy"}
          </Button>
        </form>

        <div className="min-w-0 space-y-3">
          {pending && !output ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: Math.min(variants, 4) }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted/40" />)}
            </div>
          ) : output ? (
            <>
              {output.brief ? <p className="text-sm text-muted-foreground">{output.brief}</p> : null}
              <div className="grid gap-3 md:grid-cols-2">
                {output.variants.map((v, i) => <VariantCard key={`${i}-${v.headline}`} variant={v} />)}
              </div>
              {output.notes.length ? <p className="text-xs text-muted-foreground">Notes: {output.notes.join(" ")}</p> : null}
            </>
          ) : (
            <EmptyState icon={PenLine} title="Your copy will appear here" description="Every variant follows the voice, key messages and guardrails in Brand Intelligence." />
          )}
        </div>
      </div>
    </div>
  )
}
