"use server"

import { z } from "zod"

import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import { loadBusinessContext } from "@/lib/ai/context"
import { aiQuotaError, meterAi } from "@/lib/ai/metering"
import { getModelProvider, ProviderError } from "@/lib/ai/provider"
import type { ModelImage } from "@/lib/ai/provider-types"
import { DESIGN_FONT_LABELS, DESIGN_FONTS } from "@/lib/creative/document"
import {
  BRAND_COLOR_ROLES,
  brandProfileSchema,
  CORNER_STYLES,
  ICON_STYLES,
  IMAGE_STYLES,
  PATTERN_KINDS,
  type BrandProfile,
} from "@/lib/domain/brand"
import { resolveWorkspace } from "@/lib/workspace/server"

export type GenerateBrandResult = { ok: true; data: BrandProfile; imagesUsed: number } | { ok: false; error: string }

/** What the model fills in. All fields required so it works as a strict structured output. */
const generatedBrandSchema = z.object({
  name: z.string().describe("Short brand kit name, e.g. the brand or product name"),
  colors: z
    .array(
      z.object({
        name: z.string().describe("Evocative colour name"),
        hex: z.string().describe("6-digit hex like #1D4ED8, taken from the logo/references when given"),
        role: z.enum(BRAND_COLOR_ROLES),
      })
    )
    .describe("4-6 colours: one primary, one secondary, one accent, one neutral (text), one light background"),
  typography: z.object({
    heading: z.string().describe("Heading typeface name"),
    body: z.string().describe("Body typeface name"),
    notes: z.string(),
  }),
  voice: z.object({
    traits: z.array(z.string()).describe("3-5 one-word traits"),
    description: z.string(),
    doList: z.array(z.string()).describe("3-6 rules"),
    dontList: z.array(z.string()).describe("3-6 rules"),
  }),
  messaging: z.object({
    tagline: z.string(),
    elevatorPitch: z.string(),
    keyMessages: z.array(z.string()).describe("3-5 messages"),
  }),
  prohibitedMessaging: z.array(z.string()).describe("Phrases to avoid (e.g. unverifiable claims); may be empty"),
  visualReferences: z.array(z.string()).describe("2-5 short descriptions of the visual direction seen in the references"),
  guidelines: z.string().describe("A short paragraph of brand guidelines"),
  visualStyle: z.object({
    imageStyle: z.enum(IMAGE_STYLES),
    illustrationStyle: z.string(),
    iconStyle: z.enum(ICON_STYLES),
    patterns: z.array(z.enum(PATTERN_KINDS)).describe("0-3 background patterns that fit the brand"),
    graphicElements: z.string(),
    headingFont: z.enum(DESIGN_FONTS).describe("Closest available design font for headings"),
    bodyFont: z.enum(DESIGN_FONTS).describe("Closest available design font for body text"),
    cornerStyle: z.enum(CORNER_STYLES),
  }),
})

const generateInput = z.object({
  prompt: z.string().trim().max(3000),
  logoAssetId: z.string().max(64).nullable(),
  referenceAssetIds: z.array(z.string().max(64)).max(5),
  /** Dominant colours measured from the images in the browser (exact hexes). */
  measuredColors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(12),
})

const fontList = DESIGN_FONTS.map((f) => `${f} = ${DESIGN_FONT_LABELS[f]}`).join(", ")

const BRAND_SYSTEM = `${SHARED_RULES}

You are the Brand Strategist building a complete brand kit. Use the user's description, the business context and the
attached images (the first image is the logo when a logo is provided; the others are visual references).
- Colours: base them on the logo and references. When measured colours are given, use those exact hex values and pick
  roles sensibly: the strongest brand colour is primary, a very light tint is background, a dark tone is neutral (text).
- Typography: name typefaces that match the logo lettering and references, and map them to the closest available design
  fonts (${fontList}).
- Visual style: infer imagery (photo, illustration, 3d, graphic or mixed), icon style, patterns, graphic elements and
  corner style from the references.
- Voice and messaging: specific to this business, never generic; no unverifiable claims.`

async function imageForModel(url: string): Promise<ModelImage | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim()
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > 5 * 1024 * 1024) return null
    return { mimeType: type as ModelImage["mimeType"], data: Buffer.from(bytes).toString("base64") }
  } catch {
    return null
  }
}

const clip = (items: string[], maxItems: number, maxLength: number) =>
  items.map((t) => t.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems)

/**
 * Drafts a full brand kit (colours, fonts, voice, messaging, visual style) from a
 * description, a logo and reference images. Returns an unsaved profile to review.
 */
export async function generateBrandProfile(
  workspace: string,
  input: z.input<typeof generateInput>,
  base: BrandProfile
): Promise<GenerateBrandResult> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("brand.edit")) return { ok: false, error: "Your role cannot edit brand profiles." }
  const parsed = generateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { prompt, logoAssetId, referenceAssetIds, measuredColors } = parsed.data
  if (!prompt && !logoAssetId && referenceAssetIds.length === 0) {
    return { ok: false, error: "Describe the brand, or add a logo or reference images." }
  }
  const provider = getModelProvider()
  if (!provider) return { ok: false, error: "AI is not configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY." }
  const quota = aiQuotaError(context)
  if (quota) return { ok: false, error: quota }

  try {
    const ids = [...(logoAssetId ? [logoAssetId] : []), ...referenceAssetIds]
    const urls = ids.length ? await repository.resolveAssetUrls(ids) : {}
    const images = (await Promise.all(ids.map((id) => (urls[id] ? imageForModel(urls[id]) : Promise.resolve(null))))).filter(
      (i): i is ModelImage => i !== null
    )
    const business = await loadBusinessContext(repository)
    const imageNote = logoAssetId && images.length
      ? `The logo is the first attached image${images.length > 1 ? "; the rest are visual references" : ""}.`
      : images.length
        ? "Visual reference images are attached."
        : "No images are attached."
    const result = await provider.generateStructured({
      tier: "reasoning",
      system: BRAND_SYSTEM,
      input: [
        `## Business context\n${business.text}`,
        `## What the user wants\n${prompt || "(no description: infer from the images and the business context)"}`,
        imageNote,
        measuredColors.length ? `Measured colours from the images (exact): ${measuredColors.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      images,
      schema: generatedBrandSchema,
      schemaName: "brand_kit",
      maxOutputTokens: 6000,
    })
    await meterAi(repository, result.usage, "brand.generate")
    const g = result.data
    const hex = /^#[0-9A-Fa-f]{6}$/
    const name = g.name.trim().slice(0, 80)
    const draft = brandProfileSchema.safeParse({
      ...base,
      name: name.length >= 2 ? name : base.name,
      logoAssetId: logoAssetId ?? base.logoAssetId,
      logoUrl: logoAssetId ? (urls[logoAssetId] ?? null) : base.logoUrl,
      colors: g.colors
        .filter((c) => hex.test(c.hex))
        .slice(0, 12)
        .map((c) => ({ name: c.name.trim().slice(0, 40) || "Colour", hex: c.hex.toUpperCase(), role: c.role })),
      typography: { heading: g.typography.heading.slice(0, 60), body: g.typography.body.slice(0, 60), notes: g.typography.notes.slice(0, 400) },
      voice: {
        traits: clip(g.voice.traits, 8, 40),
        description: g.voice.description.slice(0, 1200),
        doList: clip(g.voice.doList, 12, 280),
        dontList: clip(g.voice.dontList, 12, 280),
      },
      messaging: {
        tagline: g.messaging.tagline.slice(0, 140),
        elevatorPitch: g.messaging.elevatorPitch.slice(0, 800),
        keyMessages: clip(g.messaging.keyMessages, 10, 280),
      },
      prohibitedMessaging: clip(g.prohibitedMessaging, 30, 200),
      visualReferences: clip(g.visualReferences, 20, 400),
      guidelines: g.guidelines.slice(0, 4000),
      visualStyle: {
        ...g.visualStyle,
        illustrationStyle: g.visualStyle.illustrationStyle.slice(0, 300),
        graphicElements: g.visualStyle.graphicElements.slice(0, 400),
        patterns: [...new Set(g.visualStyle.patterns)].slice(0, 4),
      },
    })
    if (!draft.success) {
      console.error("[tangent] generated brand kit failed validation", draft.error.issues.slice(0, 3))
      return { ok: false, error: "The AI returned a brand kit that didn't validate. Try again." }
    }
    await repository.recordAudit({
      action: "brand_profile.generated",
      entityType: "brand_profile",
      entityId: base.id,
      summary: `Generated a brand kit draft with AI (${images.length} image${images.length === 1 ? "" : "s"})`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: draft.data, imagesUsed: images.length }
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.message }
    console.error("[tangent] generate brand failed", error)
    return { ok: false, error: "Could not generate the brand kit. Try again." }
  }
}
