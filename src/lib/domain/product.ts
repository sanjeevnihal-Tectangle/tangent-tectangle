import { z } from "zod"

const lines = (maxItems: number, maxLength = 200) => z.array(z.string().trim().min(1).max(maxLength)).max(maxItems)

export const PRODUCT_KINDS = ["product", "service"] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/**
 * A product or service the business markets. Each can use its own brand kit
 * (brand profile); agents use it whenever a request is about this product.
 */
export const productSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(2, "Name the product or service").max(120),
  kind: z.enum(PRODUCT_KINDS),
  category: z.string().trim().max(80),
  description: z.string().trim().max(1500),
  price: z.string().trim().max(60),
  audience: z.string().trim().max(400),
  benefits: lines(8),
  features: lines(12),
  url: z.union([z.literal(""), z.string().trim().url("Use a full URL, e.g. https://example.com/product").max(400)]),
  /** Brand kit for this product's creatives; null = the company's default brand kit. */
  brandProfileId: z.string().nullable(),
  /** Product photos / screenshots from the Asset Library. */
  imageAssetIds: z.array(z.string()).max(6),
  isActive: z.boolean(),
  updatedAt: z.string(),
})
export type Product = z.infer<typeof productSchema>

export function emptyProduct(id: string): Product {
  return {
    id,
    name: "",
    kind: "product",
    category: "",
    description: "",
    price: "",
    audience: "",
    benefits: [],
    features: [],
    url: "",
    brandProfileId: null,
    imageAssetIds: [],
    isActive: true,
    updatedAt: new Date().toISOString(),
  }
}

/** Finds the catalogue product a free-text name refers to (exact, then contained, case-insensitive). */
export function matchProduct(products: readonly Product[], name: string): Product | null {
  const needle = name.trim().toLowerCase()
  if (!needle) return null
  return (
    products.find((p) => p.name.toLowerCase() === needle) ??
    products.find((p) => needle.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(needle)) ??
    null
  )
}
