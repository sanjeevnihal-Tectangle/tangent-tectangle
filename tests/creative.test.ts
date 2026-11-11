import { describe, expect, it } from "vitest"

import { addLayer, defaultText, duplicateLayer, duplicatePage, moveLayer, removePage, updateLayer } from "@/features/studio/editor/document-ops"
import { designDocumentSchema, referencedAssetIds, resizeDocument } from "@/lib/creative/document"
import { CREATIVE_FORMATS, getFormat } from "@/lib/creative/formats"
import { composeDocument, contrastRatio, DESIGN_LAYOUTS, resolvePalette, type DesignSpec } from "@/lib/creative/layout"
import { CREATIVE_TEMPLATES, templateSpec } from "@/lib/creative/templates"
import { contentItemSchema, normalizeHashtag } from "@/lib/domain/content"
import { DEMO_BRAND_PROFILES } from "@/lib/demo/seed-business"

const brandColors = DEMO_BRAND_PROFILES[0]!.colors

const spec: DesignSpec = {
  layout: "centered_hero",
  headline: "Slow-cooked since sunrise",
  subheadline: "Our winter menu is here, at all three outlets",
  callToAction: "Book a table",
  badge: "New",
  palette: { background: "#FAF6EF", text: "#2B2B2B", accent: "#E4572E" },
  backgroundStyle: "solid",
  imagePrompt: "",
  slides: [
    { headline: "Nihari", body: "Eight hours on the stove." },
    { headline: "Sarson da saag", body: "Churned by hand." },
  ],
}

function ctx(formatId: string, imageAssetId: string | null = null) {
  return { format: getFormat(formatId), brandColors, businessName: "Saffron & Sage", logoAssetId: null, imageAssetId }
}

describe("layout engine", () => {
  it("produces a valid document for every format and layout", () => {
    for (const format of CREATIVE_FORMATS) {
      for (const layout of DESIGN_LAYOUTS) {
        const document = composeDocument({ ...spec, layout }, ctx(format.id, "asset-1"))
        expect(designDocumentSchema.safeParse(document).success, `${format.id}/${layout}`).toBe(true)
        expect(document.width).toBe(format.width)
        expect(document.pages[0]!.layers.some((l) => l.type === "text" && l.text === spec.headline)).toBe(true)
      }
    }
  })

  it("keeps the headline inside the canvas", () => {
    for (const format of CREATIVE_FORMATS) {
      const document = composeDocument(spec, ctx(format.id))
      const headline = document.pages[0]!.layers.find((l) => l.name === "Headline")!
      expect(headline.x).toBeGreaterThanOrEqual(0)
      expect(headline.x + headline.width).toBeLessThanOrEqual(format.width + 1)
      expect(headline.y).toBeGreaterThanOrEqual(0)
    }
  })

  it("adds carousel slides only for multi-page formats", () => {
    expect(composeDocument(spec, ctx("instagram_carousel")).pages).toHaveLength(3)
    expect(composeDocument(spec, ctx("instagram_post")).pages).toHaveLength(1)
  })

  it("uses the photo as background when requested and available", () => {
    const withImage = composeDocument({ ...spec, backgroundStyle: "image" }, ctx("instagram_post", "photo-1"))
    expect(withImage.pages[0]!.background).toMatchObject({ type: "image", assetId: "photo-1" })
    const without = composeDocument({ ...spec, backgroundStyle: "image" }, ctx("instagram_post", null))
    expect(without.pages[0]!.background.type).not.toBe("image")
    expect(referencedAssetIds(withImage)).toEqual(["photo-1"])
  })

  it("repairs invalid or low-contrast palettes from the AI", () => {
    const palette = resolvePalette({ background: "not-a-colour", text: "#FAF6EF", accent: "#FAF6EF" }, brandColors)
    expect(palette.background).toBe("#FAF6EF")
    expect(contrastRatio(palette.background, palette.text)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(palette.accent, palette.onAccent)).toBeGreaterThanOrEqual(4.5)
  })

  it("composes every template with the brand palette", () => {
    for (const template of CREATIVE_TEMPLATES) {
      const document = composeDocument(templateSpec(template, "Saffron & Sage", brandColors), ctx(template.formatId))
      expect(designDocumentSchema.safeParse(document).success, template.id).toBe(true)
    }
  })
})

describe("resize", () => {
  it("re-lays out a design for another format", () => {
    const square = composeDocument(spec, ctx("instagram_post"))
    const story = resizeDocument(square, "instagram_story", 1080, 1920)
    expect(story).toMatchObject({ formatId: "instagram_story", width: 1080, height: 1920 })
    expect(designDocumentSchema.safeParse(story).success).toBe(true)
    for (const layer of story.pages[0]!.layers) {
      expect(layer.x + layer.width / 2).toBeGreaterThan(0)
      expect(layer.x + layer.width / 2).toBeLessThan(1080)
    }
  })
})

describe("document operations", () => {
  const base = composeDocument(spec, ctx("instagram_carousel"))

  it("adds, updates, duplicates and reorders layers immutably", () => {
    const text = defaultText(base, "#111111")
    const added = addLayer(base, 0, text)
    expect(added.pages[0]!.layers.at(-1)!.id).toBe(text.id)
    expect(base.pages[0]!.layers).not.toContain(text)

    const moved = updateLayer(added, 0, text.id, { x: 10 })
    expect(moved.pages[0]!.layers.find((l) => l.id === text.id)!.x).toBe(10)

    const { document: duplicated, id } = duplicateLayer(moved, 0, text.id)
    expect(id).not.toBe(text.id)
    expect(duplicated.pages[0]!.layers).toHaveLength(moved.pages[0]!.layers.length + 1)

    const back = moveLayer(added, 0, text.id, -1)
    expect(back.pages[0]!.layers.at(-2)!.id).toBe(text.id)
  })

  it("duplicates pages with fresh ids and never removes the last page", () => {
    const doubled = duplicatePage(base, 0)
    expect(doubled.pages).toHaveLength(base.pages.length + 1)
    expect(doubled.pages[1]!.id).not.toBe(base.pages[0]!.id)
    const single = composeDocument(spec, ctx("instagram_post"))
    expect(removePage(single, 0).pages).toHaveLength(1)
  })
})

describe("content items", () => {
  it("normalises hashtags", () => {
    expect(normalizeHashtag("WinterMenu")).toBe("#WinterMenu")
    expect(normalizeHashtag(" #Bengaluru Food ")).toBe("#BengaluruFood")
  })

  it("validates captions and hashtags", () => {
    const item = {
      id: "1",
      title: "Winter menu",
      platform: "instagram",
      format: "Post",
      caption: "Hello",
      hashtags: ["#WinterMenu"],
      scheduledFor: "2026-11-12T06:30:00.000Z",
      status: "draft",
      creativeProjectId: null,
      mediaAssetIds: [],
      reviewNote: null,
      updatedAt: "2026-11-11T00:00:00.000Z",
    }
    expect(contentItemSchema.safeParse(item).success).toBe(true)
    expect(contentItemSchema.safeParse({ ...item, caption: "x".repeat(2201) }).success).toBe(false)
    expect(contentItemSchema.safeParse({ ...item, hashtags: ["#not valid!"] }).success).toBe(false)
  })
})
