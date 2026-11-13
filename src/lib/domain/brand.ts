import { z } from "zod"

import { DESIGN_FONTS } from "@/lib/creative/document"

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex colour, e.g. #E4572E")

const lines = (maxItems: number, maxLength = 280) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems)

export const BRAND_COLOR_ROLES = ["primary", "secondary", "accent", "neutral", "background"] as const

export const IMAGE_STYLES = ["photo", "illustration", "3d", "graphic", "mixed"] as const
export const IMAGE_STYLE_LABELS: Record<(typeof IMAGE_STYLES)[number], string> = {
  photo: "Photography",
  illustration: "Illustrations",
  "3d": "3D renders",
  graphic: "Graphic shapes & icons (no photos)",
  mixed: "Mix, chosen per creative",
}
export const ICON_STYLES = ["outline", "filled", "duotone"] as const
export const PATTERN_KINDS = ["dots", "grid", "diagonal", "waves", "circles", "confetti"] as const
export type PatternKind = (typeof PATTERN_KINDS)[number]
export const CORNER_STYLES = ["rounded", "sharp", "pill"] as const

/** How the brand looks beyond colours: imagery, illustration, icons, patterns, fonts and shapes. */
export const brandVisualStyleSchema = z.object({
  imageStyle: z.enum(IMAGE_STYLES).default("mixed"),
  illustrationStyle: z.string().trim().max(300).default(""),
  iconStyle: z.enum(ICON_STYLES).default("outline"),
  patterns: z.array(z.enum(PATTERN_KINDS)).max(4).default([]),
  graphicElements: z.string().trim().max(400).default(""),
  headingFont: z.enum(DESIGN_FONTS).default("heading"),
  bodyFont: z.enum(DESIGN_FONTS).default("body"),
  cornerStyle: z.enum(CORNER_STYLES).default("rounded"),
})
export type BrandVisualStyle = z.infer<typeof brandVisualStyleSchema>
export const DEFAULT_VISUAL_STYLE: BrandVisualStyle = brandVisualStyleSchema.parse({})

export const brandProfileSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, "Name the brand profile").max(80),
  isDefault: z.boolean(),
  /** Media asset id of the logo (chosen from the Asset Library). */
  logoAssetId: z.string().nullable(),
  /** Resolved signed URL for display; never persisted. */
  logoUrl: z.string().nullable(),
  colors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        hex: hexColor,
        role: z.enum(BRAND_COLOR_ROLES),
      })
    )
    .max(12),
  typography: z.object({
    heading: z.string().trim().max(60),
    body: z.string().trim().max(60),
    notes: z.string().trim().max(400),
  }),
  voice: z.object({
    traits: lines(8, 40),
    description: z.string().trim().max(1200),
    doList: lines(12),
    dontList: lines(12),
  }),
  messaging: z.object({
    tagline: z.string().trim().max(140),
    elevatorPitch: z.string().trim().max(800),
    keyMessages: lines(10),
  }),
  approvedCopy: lines(20, 600),
  prohibitedMessaging: lines(30, 200),
  visualReferences: lines(20, 400),
  guidelines: z.string().trim().max(4000),
  visualStyle: brandVisualStyleSchema.prefault({}),
  updatedAt: z.string(),
})

export type BrandProfile = z.infer<typeof brandProfileSchema>

export function emptyBrandProfile(id: string, name: string): BrandProfile {
  return {
    id,
    name,
    isDefault: false,
    logoAssetId: null,
    logoUrl: null,
    colors: [],
    typography: { heading: "", body: "", notes: "" },
    voice: { traits: [], description: "", doList: [], dontList: [] },
    messaging: { tagline: "", elevatorPitch: "", keyMessages: [] },
    approvedCopy: [],
    prohibitedMessaging: [],
    visualReferences: [],
    guidelines: "",
    visualStyle: { ...DEFAULT_VISUAL_STYLE },
    updatedAt: new Date().toISOString(),
  }
}

/** Case-insensitive scan for prohibited phrases in generated copy. */
export function findProhibitedPhrases(text: string, prohibited: readonly string[]): string[] {
  const haystack = text.toLowerCase()
  return prohibited.filter((phrase) => {
    const needle = phrase.trim().toLowerCase()
    return needle.length > 0 && haystack.includes(needle)
  })
}
