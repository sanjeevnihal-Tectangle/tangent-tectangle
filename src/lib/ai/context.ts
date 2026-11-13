import "server-only"

import type { WorkspaceRepository } from "@/lib/data/types"
import { IMAGE_STYLE_LABELS, type BrandProfile } from "@/lib/domain/brand"
import {
  BUSINESS_MODEL_LABELS,
  CHANNEL_LABELS,
  type BusinessProfile,
  type MarketingIntelligence,
} from "@/lib/domain/business"
import { formatINR } from "@/lib/format"
import type { Product } from "@/lib/domain/product"

export interface BusinessContext {
  /** Compact, model-ready context block shared by every agent. */
  text: string
  sources: { label: string; detail: string }[]
  brand: BrandProfile | null
  hasBusinessProfile: boolean
  /** Active catalogue products and services. */
  products: Product[]
  /** The product this request is about, when one was resolved. */
  product: Product | null
}

const list = (items: readonly string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)")

function describeBusiness(profile: BusinessProfile): string {
  return [
    `Business: ${profile.name} (${profile.industry})`,
    `Location: ${[profile.city, profile.region, profile.country].filter(Boolean).join(", ")}`,
    profile.website ? `Website: ${profile.website}` : null,
    `Business model: ${BUSINESS_MODEL_LABELS[profile.businessModel]}`,
    `Description: ${profile.description}`,
    `Products and services:\n${list(profile.productsAndServices)}`,
    `Target audience: ${profile.targetAudience}`,
    `Customer segments:\n${list(profile.customerSegments)}`,
    `Competitors:\n${list(profile.competitors.map((c) => c.name))}`,
    `Marketing objectives:\n${list(profile.objectives)}`,
    `Monthly marketing budget: ${formatINR(profile.monthlyBudgetInr)}`,
    `Preferred channels: ${profile.preferredChannels.map((c) => CHANNEL_LABELS[c]).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n")
}

function describeIntelligence(intelligence: MarketingIntelligence): string | null {
  const { content, sectionStatus } = intelligence
  const parts: string[] = []
  if (sectionStatus.valueProposition === "approved") parts.push(`Value proposition: ${content.valueProposition}`)
  if (sectionStatus.strategy === "approved") {
    parts.push(`Positioning: ${content.strategy.positioning}`)
    parts.push(`Content pillars:\n${list(content.strategy.pillars.map((p) => `${p.name}: ${p.description}`))}`)
  }
  if (sectionStatus.personas === "approved") {
    parts.push(`Personas:\n${list(content.personas.map((p) => `${p.name} — ${p.snapshot}`))}`)
  }
  return parts.length ? parts.join("\n") : null
}

function describeBrand(brand: BrandProfile): string {
  return [
    `Brand profile: ${brand.name}`,
    brand.messaging.tagline ? `Tagline: ${brand.messaging.tagline}` : null,
    brand.voice.traits.length ? `Voice traits: ${brand.voice.traits.join(", ")}` : null,
    brand.voice.description ? `Voice: ${brand.voice.description}` : null,
    brand.voice.doList.length ? `Always:\n${list(brand.voice.doList)}` : null,
    brand.voice.dontList.length ? `Never:\n${list(brand.voice.dontList)}` : null,
    brand.messaging.keyMessages.length ? `Key messages:\n${list(brand.messaging.keyMessages)}` : null,
    brand.prohibitedMessaging.length
      ? `PROHIBITED phrases (must never appear):\n${list(brand.prohibitedMessaging)}`
      : null,
    brand.colors.length
      ? `Brand colours: ${brand.colors.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ")}`
      : null,
    brand.typography.heading ? `Typography: ${brand.typography.heading} / ${brand.typography.body}` : null,
    brand.visualReferences.length ? `Visual references:\n${list(brand.visualReferences)}` : null,
    `Visual style: imagery ${IMAGE_STYLE_LABELS[brand.visualStyle.imageStyle]}; ${brand.visualStyle.iconStyle} icons; ${brand.visualStyle.cornerStyle} corners${
      brand.visualStyle.patterns.length ? `; patterns: ${brand.visualStyle.patterns.join(", ")}` : ""
    }`,
    brand.visualStyle.illustrationStyle ? `Illustration style: ${brand.visualStyle.illustrationStyle}` : null,
    brand.visualStyle.graphicElements ? `Graphic elements: ${brand.visualStyle.graphicElements}` : null,
    brand.guidelines ? `Guidelines: ${brand.guidelines.slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function describeCatalogue(products: Product[]): string {
  return `Products and services catalogue (use these exact names):\n${list(
    products.slice(0, 30).map((p) =>
      [`${p.name} (${p.kind}${p.category ? `, ${p.category}` : ""})`, p.price || null, p.description ? p.description.slice(0, 140) : null]
        .filter(Boolean)
        .join(" — ")
    )
  )}`
}

function describeProduct(product: Product): string {
  return [
    `PRODUCT IN FOCUS: ${product.name} (${product.kind}${product.category ? `, ${product.category}` : ""})`,
    product.description ? `Description: ${product.description}` : null,
    product.price ? `Price / offer: ${product.price}` : null,
    product.audience ? `For: ${product.audience}` : null,
    product.benefits.length ? `Key benefits:\n${list(product.benefits)}` : null,
    product.features.length ? `Features:\n${list(product.features)}` : null,
    product.url ? `Link: ${product.url}` : null,
    "Promote this product. Use its details exactly; don't invent features, prices or claims.",
  ]
    .filter(Boolean)
    .join("\n")
}

export async function loadBusinessContext(
  repository: WorkspaceRepository,
  brandProfileId?: string,
  productId?: string
): Promise<BusinessContext> {
  const [profile, intelligence, brands, allProducts] = await Promise.all([
    repository.getBusinessProfile(),
    repository.getIntelligence(),
    repository.listBrandProfiles(),
    repository.listProducts().catch((error: unknown) => {
      console.error("[tangent] could not load products", error)
      return [] as Product[]
    }),
  ])
  const products = allProducts.filter((p) => p.isActive)
  const product = productId ? (allProducts.find((p) => p.id === productId) ?? null) : null
  // A product's own brand kit wins over the company default.
  const brand =
    (brandProfileId ? brands.find((b) => b.id === brandProfileId) : undefined) ??
    (product?.brandProfileId ? brands.find((b) => b.id === product.brandProfileId) : undefined) ??
    brands.find((b) => b.isDefault) ??
    brands[0] ??
    null

  const sections: string[] = []
  const sources: BusinessContext["sources"] = []

  if (profile) {
    sections.push(describeBusiness(profile))
    sources.push({ label: "Business profile", detail: `${profile.name} · ${profile.industry} · ${profile.city}` })
  } else {
    sections.push("No business profile has been completed yet. Ask for missing details when they matter.")
  }

  if (products.length) {
    sections.push(describeCatalogue(products))
    sources.push({ label: "Products & services", detail: `${products.length} in the catalogue` })
  }
  if (product) {
    sections.push(describeProduct(product))
    sources.push({ label: "Product", detail: product.name })
  }

  const intelligenceText = intelligence ? describeIntelligence(intelligence) : null
  if (intelligenceText) {
    sections.push(intelligenceText)
    sources.push({ label: "Approved intelligence", detail: "Positioning, personas and pillars" })
  }

  if (brand) {
    sections.push(describeBrand(brand))
    sources.push({ label: "Brand profile", detail: brand.name })
  }

  sources.push({
    label: "Performance data",
    detail: "No connected accounts — live metrics unavailable",
  })

  return {
    text: sections.join("\n\n"),
    sources,
    brand,
    hasBusinessProfile: Boolean(profile),
    products,
    product,
  }
}
