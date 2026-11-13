import { describe, expect, it } from "vitest"

import { designDocumentSchema } from "@/lib/creative/document"
import { getFormat } from "@/lib/creative/formats"
import { composeDocument, contrastRatio, SPEC_GRAPHIC_DEFAULTS, type DesignSpec } from "@/lib/creative/layout"
import { applyBrandKit, colorMapper, type BrandKitStyle } from "@/lib/creative/rebrand"

const oldKit: BrandKitStyle = {
  id: "a",
  name: "Old",
  colors: [
    { hex: "#1D4ED8", role: "primary" },
    { hex: "#F59E0B", role: "accent" },
    { hex: "#FAFAF9", role: "background" },
    { hex: "#111827", role: "neutral" },
  ],
  logoAssetId: "logo-old",
  style: { headingFont: "heading", bodyFont: "body", iconVariant: "outline", cornerStyle: "rounded" },
}

const newKit: BrandKitStyle = {
  id: "b",
  name: "New",
  colors: [
    { hex: "#16A34A", role: "primary" },
    { hex: "#DB2777", role: "accent" },
    { hex: "#FFF7ED", role: "background" },
    { hex: "#1C1917", role: "neutral" },
  ],
  logoAssetId: "logo-new",
  style: { headingFont: "serif", bodyFont: "display", iconVariant: "filled", cornerStyle: "sharp" },
}

const spec: DesignSpec = {
  layout: "feature_list",
  headline: "Grow faster",
  subheadline: "Everything you need in one place",
  callToAction: "Start free",
  badge: "New",
  palette: { background: "#FAFAF9", text: "#111827", accent: "#1D4ED8" },
  backgroundStyle: "solid",
  imagePrompt: "",
  slides: [],
  ...SPEC_GRAPHIC_DEFAULTS,
  features: [{ label: "Fast setup", icon: "zap" }, { label: "Secure", icon: "shield-check" }],
}

describe("brand kit switching", () => {
  it("swaps brand colours by role and keeps tints related", () => {
    const map = colorMapper(oldKit.colors, newKit.colors)
    expect(map("#1D4ED8")).toBe("#16A34A")
    expect(map("#F59E0B")).toBe("#DB2777")
    expect(map("#FFFFFF")).not.toBe("#16A34A")
  })

  it("re-skins a composed design: colours, fonts, logo, icons and corners", () => {
    const ctx = {
      format: getFormat("instagram_post"),
      brandColors: oldKit.colors,
      businessName: "Acme",
      logoAssetId: "logo-old",
      imageAssetId: null,
      style: { headingFont: "heading", bodyFont: "body", iconVariant: "outline", cornerStyle: "rounded" } as const,
    }
    const doc = composeDocument(spec, ctx)
    const next = applyBrandKit(doc, oldKit, newKit)
    expect(designDocumentSchema.safeParse(next).success).toBe(true)

    const page = next.pages[0]!
    expect(page.background.type === "solid" && page.background.color).toBe("#FFF7ED")
    const texts = page.layers.filter((l) => l.type === "text")
    expect(texts.some((t) => t.font === "serif")).toBe(true)
    expect(texts.some((t) => t.font === "heading" || t.font === "body")).toBe(false)
    for (const t of texts) {
      const behind = t.background ?? "#FFF7ED"
      expect(contrastRatio(behind, t.color)).toBeGreaterThanOrEqual(3)
    }
    const logo = page.layers.find((l) => l.type === "image" && l.name === "Logo")
    expect(logo && logo.type === "image" && logo.assetId).toBe("logo-new")
    for (const icon of page.layers.filter((l) => l.type === "icon")) {
      expect(icon.type === "icon" && icon.variant).toBe("filled")
    }
    const allColors = JSON.stringify(next)
    expect(allColors).not.toContain("#1D4ED8")
  })

  it("hides the old logo when the new kit has none", () => {
    const doc = composeDocument(spec, {
      format: getFormat("instagram_post"),
      brandColors: oldKit.colors,
      businessName: "Acme",
      logoAssetId: "logo-old",
      imageAssetId: null,
    })
    const next = applyBrandKit(doc, oldKit, { ...newKit, logoAssetId: null })
    const logo = next.pages[0]!.layers.find((l) => l.type === "image" && l.name === "Logo")
    expect(logo?.hidden).toBe(true)
  })
})
