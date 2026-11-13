import { describe, expect, it } from "vitest"

import { brandProfileSchema, DEFAULT_VISUAL_STYLE, emptyBrandProfile } from "@/lib/domain/brand"
import { emptyProduct, matchProduct, productSchema } from "@/lib/domain/product"

const product = (name: string) => ({ ...emptyProduct(name.toLowerCase().replace(/\W+/g, "-")), name })

describe("products", () => {
  const catalogue = [product("Tangent"), product("Tangent Ads"), product("Laundry Pro")]

  it("matches catalogue names exactly first, then loosely", () => {
    expect(matchProduct(catalogue, "tangent ads")?.name).toBe("Tangent Ads")
    expect(matchProduct(catalogue, "Tangent")?.name).toBe("Tangent")
    expect(matchProduct(catalogue, "our Laundry Pro app")?.name).toBe("Laundry Pro")
    expect(matchProduct(catalogue, "Something else")).toBeNull()
    expect(matchProduct(catalogue, "  ")).toBeNull()
  })

  it("validates product fields", () => {
    expect(productSchema.safeParse({ ...product("Tangent"), url: "not a url" }).success).toBe(false)
    expect(productSchema.safeParse({ ...product("Tangent"), url: "" }).success).toBe(true)
  })
})

describe("brand visual style", () => {
  it("fills defaults for brand kits saved before visual styles existed", () => {
    const { visualStyle: _style, ...legacy } = emptyBrandProfile("b1", "Legacy")
    const parsed = brandProfileSchema.parse(legacy)
    expect(parsed.visualStyle).toEqual(DEFAULT_VISUAL_STYLE)
    expect(brandProfileSchema.parse({ ...legacy, visualStyle: { patterns: ["dots"] } }).visualStyle.patterns).toEqual(["dots"])
  })
})
