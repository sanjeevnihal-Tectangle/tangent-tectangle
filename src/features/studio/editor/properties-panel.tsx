"use client"

import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Loader2, Wand2 } from "lucide-react"
import { useState, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DESIGN_FONT_LABELS,
  DESIGN_FONTS,
  type Background,
  type DesignDocument,
  type DesignPage,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/creative/document"
import { cn } from "@/lib/utils"

const HEX = /^#[0-9a-fA-F]{6}$/

export function ColorField({ label, value, onChange, swatches }: { label: string; value: string; onChange: (hex: string) => void; swatches: string[] }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const shown = focused ? draft : value
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input type="color" value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" aria-label={`${label} colour picker`} />
        <Input
          value={shown}
          onFocus={() => {
            setDraft(value)
            setFocused(true)
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setDraft(e.target.value)
            if (HEX.test(e.target.value)) onChange(e.target.value.toUpperCase())
          }}
          className="h-8 font-mono text-xs"
          aria-label={`${label} hex`}
        />
      </div>
      {swatches.length ? (
        <div className="flex flex-wrap gap-1">
          {swatches.map((hex) => (
            <button key={hex} type="button" onClick={() => onChange(hex)} className={cn("size-5 rounded-sm border", value.toUpperCase() === hex.toUpperCase() && "ring-2 ring-brand ring-offset-1 ring-offset-background")} style={{ backgroundColor: hex }} aria-label={`Use ${hex}`} title={hex} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="space-y-1">
      <span className="block text-[0.7rem] text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n)
        }}
        className="h-8 text-xs"
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b p-3 last:border-0">
      <h2 className="font-sans text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function ImageSource({
  onPick,
  onGenerate,
  generating,
  imageConfigured,
  defaultPrompt,
}: {
  onPick: () => void
  onGenerate: (prompt: string) => void
  generating: boolean
  imageConfigured: boolean
  defaultPrompt: string
}) {
  const [prompt, setPrompt] = useState(defaultPrompt)
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" className="w-full" onClick={onPick}>
        <ImagePlus /> Choose from library
      </Button>
      <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe an image to generate" className="text-xs" disabled={!imageConfigured} />
      <Button size="sm" variant="outline" className="w-full" onClick={() => onGenerate(prompt)} disabled={!imageConfigured || generating || prompt.trim().length < 10}>
        {generating ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate with AI
      </Button>
      {!imageConfigured ? <p className="text-[0.7rem] text-muted-foreground">AI images need IMAGE_PROVIDER=openai and an OpenAI key with credits.</p> : null}
    </div>
  )
}

export function PropertiesPanel({
  document,
  page,
  layer,
  swatches,
  textInputRef,
  imageConfigured,
  generatingImage,
  defaultImagePrompt,
  onLayerPatch,
  onBackground,
  onPickImage,
  onGenerateImage,
}: {
  document: DesignDocument
  page: DesignPage
  layer: Layer | null
  swatches: string[]
  textInputRef: RefObject<HTMLTextAreaElement | null>
  imageConfigured: boolean
  generatingImage: boolean
  defaultImagePrompt: string
  /** coalesceKey groups rapid edits (typing, sliders) into one undo step */
  onLayerPatch: (patch: Partial<Layer>, coalesceKey?: string) => void
  onBackground: (background: Background, coalesceKey?: string) => void
  onPickImage: (target: "layer" | "background") => void
  onGenerateImage: (target: "layer" | "background", prompt: string) => void
}) {
  if (!layer) {
    const bg = page.background
    const baseColor = bg.type === "solid" ? bg.color : bg.type === "gradient" ? bg.from : bg.fallback
    return (
      <div>
        <Section title="Page background">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={bg.type}
            onValueChange={(type) => {
              if (type === "solid") onBackground({ type: "solid", color: baseColor })
              else if (type === "gradient") onBackground({ type: "gradient", from: baseColor, to: swatches[1] ?? "#111111", angle: 160 })
              else if (type === "image") onPickImage("background")
            }}
            className="w-full"
          >
            <ToggleGroupItem value="solid" className="flex-1 text-xs">Solid</ToggleGroupItem>
            <ToggleGroupItem value="gradient" className="flex-1 text-xs">Gradient</ToggleGroupItem>
            <ToggleGroupItem value="image" className="flex-1 text-xs">Image</ToggleGroupItem>
          </ToggleGroup>
          {bg.type === "solid" ? <ColorField label="Colour" value={bg.color} swatches={swatches} onChange={(color) => onBackground({ ...bg, color }, "bg-color")} /> : null}
          {bg.type === "gradient" ? (
            <>
              <ColorField label="From" value={bg.from} swatches={swatches} onChange={(from) => onBackground({ ...bg, from }, "bg-from")} />
              <ColorField label="To" value={bg.to} swatches={swatches} onChange={(to) => onBackground({ ...bg, to }, "bg-to")} />
              <NumberField label="Angle (°)" value={bg.angle} min={0} max={360} onChange={(angle) => onBackground({ ...bg, angle }, "bg-angle")} />
            </>
          ) : null}
          {bg.type === "image" ? (
            <>
              <ColorField label="Overlay colour" value={bg.overlayColor} swatches={["#000000", "#FFFFFF", ...swatches]} onChange={(overlayColor) => onBackground({ ...bg, overlayColor }, "bg-overlay")} />
              <label className="block space-y-1">
                <span className="text-[0.7rem] text-muted-foreground">Overlay opacity {Math.round(bg.overlayOpacity * 100)}%</span>
                <input type="range" min={0} max={0.9} step={0.05} value={bg.overlayOpacity} onChange={(e) => onBackground({ ...bg, overlayOpacity: Number(e.target.value) }, "bg-opacity")} className="w-full accent-[var(--brand)]" />
              </label>
            </>
          ) : null}
        </Section>
        <Section title="Background image">
          <ImageSource onPick={() => onPickImage("background")} onGenerate={(p) => onGenerateImage("background", p)} generating={generatingImage} imageConfigured={imageConfigured} defaultPrompt={defaultImagePrompt} />
        </Section>
        <p className="p-3 text-xs text-muted-foreground">Select a layer on the canvas to edit it. Double-click text to edit the words.</p>
      </div>
    )
  }

  const geometry = (
    <Section title="Position & size">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={layer.x} onChange={(x) => onLayerPatch({ x }, "x")} />
        <NumberField label="Y" value={layer.y} onChange={(y) => onLayerPatch({ y }, "y")} />
        <NumberField label="Width" value={layer.width} min={8} onChange={(width) => onLayerPatch({ width }, "w")} />
        <NumberField label="Height" value={layer.height} min={8} onChange={(height) => onLayerPatch({ height }, "h")} />
        <NumberField label="Rotation" value={layer.rotation} min={-360} max={360} onChange={(rotation) => onLayerPatch({ rotation }, "rot")} />
        <NumberField label="Opacity %" value={Math.round(layer.opacity * 100)} min={0} max={100} onChange={(o) => onLayerPatch({ opacity: o / 100 }, "opacity")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="xs" onClick={() => onLayerPatch({ x: Math.round((document.width - layer.width) / 2) })}>Centre horizontally</Button>
        <Button variant="outline" size="xs" onClick={() => onLayerPatch({ y: Math.round((document.height - layer.height) / 2) })}>Centre vertically</Button>
      </div>
    </Section>
  )

  switch (layer.type) {
    case "text": {
      const t: TextLayer = layer
      return (
        <div>
          <Section title="Text">
            <Textarea ref={textInputRef} rows={4} value={t.text} onChange={(e) => onLayerPatch({ text: e.target.value }, `text-${t.id}`)} aria-label="Text content" />
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <span className="block text-[0.7rem] text-muted-foreground">Typeface</span>
                <Select value={t.font} onValueChange={(font) => onLayerPatch({ font: font as TextLayer["font"] })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue>{DESIGN_FONT_LABELS[t.font]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {DESIGN_FONTS.map((f) => <SelectItem key={f} value={f}>{DESIGN_FONT_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <NumberField label="Size" value={t.fontSize} min={4} max={800} onChange={(fontSize) => onLayerPatch({ fontSize }, "size")} />
              <div className="space-y-1">
                <span className="block text-[0.7rem] text-muted-foreground">Weight</span>
                <Select value={String(t.fontWeight)} onValueChange={(w) => onLayerPatch({ fontWeight: Number(w) as TextLayer["fontWeight"] })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue>{t.fontWeight}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {[400, 500, 600, 700, 800].map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <NumberField label="Line height" value={t.lineHeight} min={0.6} max={3} step={0.05} onChange={(lineHeight) => onLayerPatch({ lineHeight }, "lh")} />
              <NumberField label="Letter spacing" value={t.letterSpacing} min={-0.2} max={1} step={0.01} onChange={(letterSpacing) => onLayerPatch({ letterSpacing }, "ls")} />
            </div>
            <div className="flex items-center justify-between">
              <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={t.align} onValueChange={(align) => align && onLayerPatch({ align: align as TextLayer["align"] })} aria-label="Text alignment">
                <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft /></ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Align centre"><AlignCenter /></ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Align right"><AlignRight /></ToggleGroupItem>
              </ToggleGroup>
              <label className="flex items-center gap-2 text-xs">
                Uppercase <Switch checked={t.uppercase} onCheckedChange={(uppercase) => onLayerPatch({ uppercase })} />
              </label>
            </div>
            <ColorField label="Text colour" value={t.color} swatches={["#FFFFFF", "#111111", ...swatches]} onChange={(color) => onLayerPatch({ color }, "color")} />
          </Section>
          <Section title="Highlight box">
            <label className="flex items-center justify-between text-xs">
              Background behind text
              <Switch checked={t.background !== null} onCheckedChange={(on) => onLayerPatch({ background: on ? swatches[0] ?? "#111111" : null, padding: on ? Math.max(t.padding, Math.round(t.fontSize * 0.5)) : t.padding })} />
            </label>
            {t.background !== null ? (
              <>
                <ColorField label="Box colour" value={t.background} swatches={swatches} onChange={(background) => onLayerPatch({ background }, "box")} />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Padding" value={t.padding} min={0} max={200} onChange={(padding) => onLayerPatch({ padding }, "pad")} />
                  <NumberField label="Corner radius" value={t.radius} min={0} max={1000} onChange={(radius) => onLayerPatch({ radius }, "rad")} />
                </div>
              </>
            ) : null}
          </Section>
          {geometry}
        </div>
      )
    }
    case "shape": {
      const s: ShapeLayer = layer
      return (
        <div>
          <Section title="Shape">
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={s.shape} onValueChange={(shape) => shape && onLayerPatch({ shape: shape as ShapeLayer["shape"] })} className="w-full">
              <ToggleGroupItem value="rect" className="flex-1 text-xs">Rectangle</ToggleGroupItem>
              <ToggleGroupItem value="ellipse" className="flex-1 text-xs">Ellipse</ToggleGroupItem>
            </ToggleGroup>
            <ColorField label="Fill" value={s.fill} swatches={["#FFFFFF", "#111111", ...swatches]} onChange={(fill) => onLayerPatch({ fill }, "fill")} />
            {s.shape === "rect" ? <NumberField label="Corner radius" value={s.radius} min={0} max={2000} onChange={(radius) => onLayerPatch({ radius }, "rad")} /> : null}
          </Section>
          {geometry}
        </div>
      )
    }
    case "image": {
      const img: ImageLayer = layer
      return (
        <div>
          <Section title="Image">
            <ImageSource onPick={() => onPickImage("layer")} onGenerate={(p) => onGenerateImage("layer", p)} generating={generatingImage} imageConfigured={imageConfigured} defaultPrompt={defaultImagePrompt} />
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={img.fit} onValueChange={(fit) => fit && onLayerPatch({ fit: fit as ImageLayer["fit"] })} className="w-full">
              <ToggleGroupItem value="cover" className="flex-1 text-xs">Fill frame</ToggleGroupItem>
              <ToggleGroupItem value="contain" className="flex-1 text-xs">Fit inside</ToggleGroupItem>
            </ToggleGroup>
            <NumberField label="Corner radius" value={img.radius} min={0} max={2000} onChange={(radius) => onLayerPatch({ radius }, "rad")} />
          </Section>
          {geometry}
        </div>
      )
    }
    default: {
      const unreachable: never = layer
      return unreachable
    }
  }
}