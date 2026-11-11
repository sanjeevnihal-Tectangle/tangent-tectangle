import { z } from "zod"

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex colour, e.g. #E4572E")

const lines = (maxItems: number, maxLength = 280) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems)

export const BRAND_COLOR_ROLES = ["primary", "secondary", "accent", "neutral", "background"] as const

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
