"use client"

import { ImagePlus, Loader2, Plus, Save, Star, Trash2 } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { TagInput } from "@/components/forms/tag-input"
import { PageHeader } from "@/components/page/page-header"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AssetPicker } from "@/features/assets/asset-picker"
import { deleteBrandProfile, saveBrandProfile } from "@/features/brand/actions"
import { DESIGN_FONT_LABELS, DESIGN_FONTS, type DesignFont } from "@/lib/creative/document"
import {
  BRAND_COLOR_ROLES,
  CORNER_STYLES,
  emptyBrandProfile,
  ICON_STYLES,
  IMAGE_STYLE_LABELS,
  IMAGE_STYLES,
  PATTERN_KINDS,
  type BrandProfile,
  type BrandVisualStyle,
} from "@/lib/domain/brand"
import { cn } from "@/lib/utils"

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function FieldError({ errors, path }: { errors: Record<string, string>; path: string }) {
  const message = errors[path]
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null
}

function BrandPreview({ brand }: { brand: BrandProfile }) {
  const color = (role: string, fallback: string) => brand.colors.find((c) => c.role === role)?.hex ?? fallback
  const background = color("background", "#FAFAF9")
  const primary = color("primary", "#111111")
  const neutral = color("neutral", "#1C1917")
  const accent = color("accent", primary)
  return (
    <div className="overflow-hidden rounded-lg border" aria-label="Brand preview">
      <div className="space-y-3 p-5" style={{ backgroundColor: background, color: neutral }}>
        <p className="text-[0.65rem] tracking-[0.2em] uppercase opacity-70">{brand.name}</p>
        <p className="text-xl leading-tight font-semibold" style={{ color: primary, fontFamily: brand.typography.heading || undefined }}>
          {brand.messaging.tagline || "Your tagline appears here"}
        </p>
        <p className="line-clamp-3 text-xs opacity-80" style={{ fontFamily: brand.typography.body || undefined }}>
          {brand.messaging.elevatorPitch || "Add an elevator pitch to see how your brand reads."}
        </p>
        <span className="inline-block rounded px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: accent, color: background }}>
          {brand.messaging.keyMessages[0] ? "Learn more" : "Call to action"}
        </span>
      </div>
      <div className="flex h-6">
        {brand.colors.map((c) => (
          <div key={`${c.name}-${c.hex}`} className="flex-1" style={{ backgroundColor: c.hex }} title={`${c.name} ${c.hex}`} />
        ))}
      </div>
    </div>
  )
}

function BrandEditor({
  brand,
  onChange,
  errors,
  disabled,
}: {
  brand: BrandProfile
  onChange: (next: BrandProfile) => void
  errors: Record<string, string>
  disabled: boolean
}) {
  const set = <K extends keyof BrandProfile>(key: K, value: BrandProfile[K]) => onChange({ ...brand, [key]: value })
  const setStyle = (patch: Partial<BrandVisualStyle>) => onChange({ ...brand, visualStyle: { ...brand.visualStyle, ...patch } })
  const [logoPickerOpen, setLogoPickerOpen] = useState(false)

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <Section title="Identity" description="Name and logo used across generated content.">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Profile name</Label>
            <Input id="brand-name" value={brand.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name)} />
            <FieldError errors={errors} path="name" />
          </div>
          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-2">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img src={brand.logoUrl} alt="Brand logo" className="h-9 w-auto max-w-28 rounded border bg-muted object-contain p-1" />
              ) : null}
              <Button type="button" variant="outline" onClick={() => setLogoPickerOpen(true)}>
                <ImagePlus /> {brand.logoAssetId ? "Change" : "Choose logo"}
              </Button>
              {brand.logoAssetId ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...brand, logoAssetId: null, logoUrl: null })}>
                  Remove
                </Button>
              ) : null}
            </div>
            <AssetPicker
              open={logoPickerOpen}
              onOpenChange={setLogoPickerOpen}
              title="Choose your logo"
              onSelect={(asset) => onChange({ ...brand, logoAssetId: asset.id, logoUrl: asset.url })}
            />
          </div>
        </div>
      </Section>

      <Section title="Colour palette" description="Agents reference these by name and hex in creative direction.">
        <div className="space-y-2">
          {brand.colors.map((color, index) => (
            <div key={index} className="grid grid-cols-[2.25rem_1fr_7rem_8rem_auto] items-center gap-2">
              <input
                type="color"
                aria-label={`${color.name || "Colour"} swatch`}
                value={/^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : "#000000"}
                onChange={(e) => set("colors", brand.colors.map((c, i) => (i === index ? { ...c, hex: e.target.value.toUpperCase() } : c)))}
                className="h-9 w-9 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <Input aria-label="Colour name" value={color.name} onChange={(e) => set("colors", brand.colors.map((c, i) => (i === index ? { ...c, name: e.target.value } : c)))} />
              <Input
                aria-label="Hex value"
                value={color.hex}
                onChange={(e) => set("colors", brand.colors.map((c, i) => (i === index ? { ...c, hex: e.target.value } : c)))}
                aria-invalid={Boolean(errors[`colors.${index}.hex`])}
                className="font-mono text-xs"
              />
              <Select value={color.role} onValueChange={(role) => set("colors", brand.colors.map((c, i) => (i === index ? { ...c, role: role as typeof c.role } : c)))}>
                <SelectTrigger aria-label="Colour role" className="w-full capitalize">
                  <SelectValue>{color.role}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BRAND_COLOR_ROLES.map((role) => (
                    <SelectItem key={role} value={role} className="capitalize">
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${color.name || "colour"}`} onClick={() => set("colors", brand.colors.filter((_, i) => i !== index))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {Object.keys(errors).some((k) => k.startsWith("colors.")) ? <p className="text-xs text-destructive">Use 6-digit hex colours, e.g. #E4572E.</p> : null}
          <Button type="button" variant="outline" size="sm" disabled={brand.colors.length >= 12} onClick={() => set("colors", [...brand.colors, { name: "", hex: "#888888", role: "accent" }])}>
            <Plus /> Add colour
          </Button>
        </div>
      </Section>

      <Section title="Typography">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="font-heading">Heading typeface</Label>
            <Input id="font-heading" value={brand.typography.heading} onChange={(e) => set("typography", { ...brand.typography, heading: e.target.value })} placeholder="e.g. Fraunces" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="font-body">Body typeface</Label>
            <Input id="font-body" value={brand.typography.body} onChange={(e) => set("typography", { ...brand.typography, body: e.target.value })} placeholder="e.g. Inter" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="font-notes">Typography notes</Label>
          <Input id="font-notes" value={brand.typography.notes} onChange={(e) => set("typography", { ...brand.typography, notes: e.target.value })} />
        </div>
      </Section>

      <Section title="Tone of voice" description="The Copywriter follows these rules on every draft.">
        <div className="space-y-1.5">
          <Label htmlFor="voice-traits">Voice traits</Label>
          <TagInput id="voice-traits" value={brand.voice.traits} onChange={(traits) => set("voice", { ...brand.voice, traits })} placeholder="e.g. Warm" maxItems={8} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voice-description">How we sound</Label>
          <Textarea id="voice-description" rows={3} value={brand.voice.description} onChange={(e) => set("voice", { ...brand.voice, description: e.target.value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="voice-do">Always</Label>
            <TagInput id="voice-do" value={brand.voice.doList} onChange={(doList) => set("voice", { ...brand.voice, doList })} placeholder="Add a rule" maxItems={12} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voice-dont">Never</Label>
            <TagInput id="voice-dont" value={brand.voice.dontList} onChange={(dontList) => set("voice", { ...brand.voice, dontList })} placeholder="Add a rule" maxItems={12} />
          </div>
        </div>
      </Section>

      <Section title="Brand messaging">
        <div className="space-y-1.5">
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" value={brand.messaging.tagline} onChange={(e) => set("messaging", { ...brand.messaging, tagline: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pitch">Elevator pitch</Label>
          <Textarea id="pitch" rows={3} value={brand.messaging.elevatorPitch} onChange={(e) => set("messaging", { ...brand.messaging, elevatorPitch: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key-messages">Key messages</Label>
          <TagInput id="key-messages" value={brand.messaging.keyMessages} onChange={(keyMessages) => set("messaging", { ...brand.messaging, keyMessages })} placeholder="Add a message" maxItems={10} />
        </div>
      </Section>

      <Section title="Copy guardrails" description="Prohibited phrases are checked automatically on every AI output.">
        <div className="space-y-1.5">
          <Label htmlFor="approved-copy">Approved copy</Label>
          <TagInput id="approved-copy" value={brand.approvedCopy} onChange={(approvedCopy) => set("approvedCopy", approvedCopy)} placeholder="Add an approved line" maxItems={20} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prohibited">Prohibited messaging</Label>
          <TagInput id="prohibited" value={brand.prohibitedMessaging} onChange={(prohibitedMessaging) => set("prohibitedMessaging", prohibitedMessaging)} placeholder="e.g. guaranteed" maxItems={30} />
        </div>
      </Section>

      <Section
        title="Visual style"
        description="How creatives look: the Graphic Designer and Creative Studio follow this for imagery, illustrations, icons, patterns and fonts."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Imagery</Label>
            <Select value={brand.visualStyle.imageStyle} onValueChange={(v) => setStyle({ imageStyle: v as BrandVisualStyle["imageStyle"] })}>
              <SelectTrigger aria-label="Imagery" className="w-full">
                <SelectValue>{IMAGE_STYLE_LABELS[brand.visualStyle.imageStyle]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {IMAGE_STYLES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {IMAGE_STYLE_LABELS[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Icon style</Label>
            <Select value={brand.visualStyle.iconStyle} onValueChange={(v) => setStyle({ iconStyle: v as BrandVisualStyle["iconStyle"] })}>
              <SelectTrigger aria-label="Icon style" className="w-full capitalize">
                <SelectValue>{brand.visualStyle.iconStyle}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ICON_STYLES.map((v) => (
                  <SelectItem key={v} value={v} className="capitalize">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Heading font (designs)</Label>
            <Select value={brand.visualStyle.headingFont} onValueChange={(v) => setStyle({ headingFont: v as DesignFont })}>
              <SelectTrigger aria-label="Heading font" className="w-full">
                <SelectValue>{DESIGN_FONT_LABELS[brand.visualStyle.headingFont]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DESIGN_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {DESIGN_FONT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Body font (designs)</Label>
            <Select value={brand.visualStyle.bodyFont} onValueChange={(v) => setStyle({ bodyFont: v as DesignFont })}>
              <SelectTrigger aria-label="Body font" className="w-full">
                <SelectValue>{DESIGN_FONT_LABELS[brand.visualStyle.bodyFont]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DESIGN_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {DESIGN_FONT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Corners</Label>
            <Select value={brand.visualStyle.cornerStyle} onValueChange={(v) => setStyle({ cornerStyle: v as BrandVisualStyle["cornerStyle"] })}>
              <SelectTrigger aria-label="Corners" className="w-full capitalize">
                <SelectValue>{brand.visualStyle.cornerStyle}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CORNER_STYLES.map((v) => (
                  <SelectItem key={v} value={v} className="capitalize">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Background patterns</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Background patterns">
            {PATTERN_KINDS.map((kind) => {
              const on = brand.visualStyle.patterns.includes(kind)
              return (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={on ? "brand" : "outline"}
                  aria-pressed={on}
                  className="capitalize"
                  disabled={!on && brand.visualStyle.patterns.length >= 4}
                  onClick={() =>
                    setStyle({ patterns: on ? brand.visualStyle.patterns.filter((p) => p !== kind) : [...brand.visualStyle.patterns, kind] })
                  }
                >
                  {kind}
                </Button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Pick up to 4. Designs use them as subtle backgrounds in your brand colours.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="illustration-style">Illustration style</Label>
          <Input
            id="illustration-style"
            value={brand.visualStyle.illustrationStyle}
            onChange={(e) => setStyle({ illustrationStyle: e.target.value })}
            placeholder="e.g. flat vector, rounded shapes, soft shadows, people with simple faces"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="graphic-elements">Graphic elements</Label>
          <Textarea
            id="graphic-elements"
            rows={2}
            value={brand.visualStyle.graphicElements}
            onChange={(e) => setStyle({ graphicElements: e.target.value })}
            placeholder="e.g. soft blobs in the corners, thin line accents, rounded cards for features, highlight the price in a badge"
          />
        </div>
      </Section>

      <Section title="Visual references & guidelines">
        <div className="space-y-1.5">
          <Label htmlFor="visual-refs">Visual references</Label>
          <TagInput id="visual-refs" value={brand.visualReferences} onChange={(visualReferences) => set("visualReferences", visualReferences)} placeholder="Describe a reference style" maxItems={20} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guidelines">Brand guidelines</Label>
          <Textarea id="guidelines" rows={4} value={brand.guidelines} onChange={(e) => set("guidelines", e.target.value)} />
        </div>
      </Section>
    </fieldset>
  )
}

export function BrandManager({ initial }: { initial: BrandProfile[] }) {
  const { workspace } = useWorkspace()
  const canEdit = useCan("brand.edit")
  const [brands, setBrands] = useState(initial)
  const [selectedId, setSelectedId] = useState(initial.find((b) => b.isDefault)?.id ?? initial[0]?.id ?? null)
  const [draft, setDraft] = useState<BrandProfile | null>(() => initial.find((b) => b.id === selectedId) ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const saved = brands.find((b) => b.id === draft?.id)
  const dirty = draft ? JSON.stringify(draft) !== JSON.stringify(saved) : false

  const select = (id: string) => {
    if (dirty && !window.confirm("Discard unsaved changes to this brand profile?")) return
    setSelectedId(id)
    setDraft(brands.find((b) => b.id === id) ?? null)
    setErrors({})
  }

  const create = () => {
    if (dirty && !window.confirm("Discard unsaved changes to this brand profile?")) return
    const fresh = emptyBrandProfile(crypto.randomUUID(), "New brand profile")
    setSelectedId(fresh.id)
    setDraft(fresh)
    setErrors({})
  }

  const save = (profile: BrandProfile, message = "Brand profile saved. New AI outputs will follow it.") =>
    startTransition(async () => {
      const result = await saveBrandProfile(workspace.slug, profile)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      setErrors({})
      setBrands(result.data)
      setDraft(result.data.find((b) => b.id === profile.id) ?? null)
      toast.success(message)
    })

  const remove = () => {
    if (!draft || !saved) {
      setDraft(brands.find((b) => b.id === selectedId) ?? brands[0] ?? null)
      return
    }
    if (!window.confirm(`Delete "${draft.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const result = await deleteBrandProfile(workspace.slug, draft.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBrands(result.data)
      const next = result.data.find((b) => b.isDefault) ?? result.data[0] ?? null
      setSelectedId(next?.id ?? null)
      setDraft(next)
      toast.success("Brand profile deleted.")
    })
  }

  const listed = draft && !saved ? [...brands, draft] : brands

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand Intelligence"
        description="Brand profiles define how Tangent writes and designs. Every AI output uses the selected (default) profile."
        actions={
          canEdit ? (
            <Button variant="outline" size="sm" onClick={create} disabled={pending}>
              <Plus /> New brand profile
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr] xl:grid-cols-[16rem_1fr_20rem]">
        <nav aria-label="Brand profiles" className="space-y-1">
          {listed.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => select(b.id)}
              aria-current={b.id === selectedId ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                b.id === selectedId ? "border-foreground/20 bg-muted" : "border-transparent hover:bg-muted/60"
              )}
            >
              <span className="flex -space-x-1">
                {(b.colors.length ? b.colors : [{ hex: "#d4d4d4", name: "", role: "neutral" as const }]).slice(0, 3).map((c, i) => (
                  <span key={i} className="size-4 rounded-full border-2 border-background" style={{ backgroundColor: c.hex }} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{b.id === draft?.id ? draft.name : b.name}</span>
              {b.isDefault ? <Badge variant="brand">Default</Badge> : null}
            </button>
          ))}
        </nav>

        {draft ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button size="sm" onClick={() => save(draft)} disabled={pending || (!dirty && Boolean(saved))}>
                    {pending ? <Loader2 className="animate-spin" /> : <Save />} {saved ? "Save changes" : "Create profile"}
                  </Button>
                  {saved && !draft.isDefault ? (
                    <Button size="sm" variant="outline" disabled={pending || dirty} onClick={() => save({ ...draft, isDefault: true }, "Default brand profile updated.")}>
                      <Star /> Make default
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
                    <Trash2 /> {saved ? "Delete" : "Discard"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Your role can view brand profiles but not edit them.</p>
              )}
              {dirty ? <span className="text-xs text-warning">Unsaved changes</span> : null}
            </div>
            <BrandEditor brand={draft} onChange={setDraft} errors={errors} disabled={!canEdit || pending} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No brand profiles yet.</p>
        )}

        {draft ? (
          <aside className="hidden space-y-3 xl:block" aria-label="Preview">
            <div className="sticky top-16 space-y-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Live preview</p>
              <BrandPreview brand={draft} />
              <p className="text-xs text-muted-foreground">
                Approximate preview using your palette and messaging. Fonts render only if installed on this device.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
