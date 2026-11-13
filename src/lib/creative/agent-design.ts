import "server-only"

import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import type { ModelProvider, TokenUsage } from "@/lib/ai/provider"
import { CREATIVE_OBJECTIVES, PLATFORM_LABELS, type CreativeFormat } from "@/lib/creative/formats"
import { composeDocument, DESIGN_LAYOUTS, designSpecSchema, LAYOUT_LABELS, type ComposeContext, type DesignSpec } from "@/lib/creative/layout"
import type { WorkspaceRepository } from "@/lib/data/types"
import { IMAGE_STYLE_LABELS, type BrandProfile } from "@/lib/domain/brand"
import type { CreativeProject } from "@/lib/domain/creative"

/**
 * Turning a brief into an editable Creative Studio design: the model picks the
 * layout, copy and palette (a DesignSpec); the layout engine computes the
 * layers. Shared by the Studio wizard and the Command Centre agents.
 */

export const DESIGN_SYSTEM = `${SHARED_RULES}

You are the Graphic Designer composing a finished marketing design. A layout engine positions everything; you decide:
- layout: one of ${DESIGN_LAYOUTS.map((l) => `${l} (${LAYOUT_LABELS[l]})`).join(", ")}.
  feature_list for products/services with clear benefits (SaaS, apps, services), showcase to present a product image or
  screenshot in a card, split when a photo is available, bold_type for punchy announcements, centered_hero for offers,
  corner_minimal for quotes and premium tone. Vary layouts; don't default to the same one.
- features: 0–4 short benefit callouts (2–5 words) with the best-matching icon. Use them for products and services,
  taken from the product's real benefits/features; never invent claims.
- pattern: one of the brand's patterns (if it lists any) as a subtle texture, otherwise none.
- decoration: graphic accents that match the brand's graphic elements (blobs for friendly brands, circles or lines for
  modern/tech, frame for premium); none for very minimal brands.
- imageTreatment: framed for product images, screenshots and illustrations; full_bleed for atmospheric photos; none
  when no image is available or the design should be purely graphic.
- copy: headline ≤ 8 words, subheadline ≤ 16 words, CTA 2–4 words, optional very short badge. Follow the brand voice.
  When the user asked for specific wording, a product name, an offer, a price or a CTA, use it exactly.
- palette: background, text and accent hex colours chosen ONLY from the brand palette; text must contrast strongly with background.
- backgroundStyle: "image" only if told an image is available and it should fill the background (imageTreatment
  full_bleed); otherwise "solid", "gradient" or "pattern".
- imagePrompt: a photographic prompt matching the concept (no text in the image).
- slides: for carousel formats, 3–6 slides (headline + 1–2 sentence body) after the cover; otherwise an empty list.`

/** Default brand profile and business name used to compose designs. */
export async function loadDesignBrand(repository: WorkspaceRepository, fallbackName: string, brandProfileId?: string | null) {
  const [brands, profile] = await Promise.all([repository.listBrandProfiles(), repository.getBusinessProfile()])
  const brand: BrandProfile | null =
    (brandProfileId ? brands.find((b) => b.id === brandProfileId) : undefined) ?? brands.find((b) => b.isDefault) ?? brands[0] ?? null
  return { brand, brands, businessName: profile?.name ?? fallbackName }
}

export async function designComposeContext(
  repository: WorkspaceRepository,
  fallbackName: string,
  format: CreativeFormat,
  imageAssetId: string | null,
  brandProfileId?: string | null
): Promise<{ ctx: ComposeContext; brandProfileId: string | null; brandStyleText: string }> {
  const { brand, businessName } = await loadDesignBrand(repository, fallbackName, brandProfileId)
  const style = brand?.visualStyle
  return {
    ctx: {
      format,
      brandColors: brand?.colors ?? [],
      businessName,
      logoAssetId: brand?.logoAssetId ?? null,
      imageAssetId,
      style: style
        ? { headingFont: style.headingFont, bodyFont: style.bodyFont, iconVariant: style.iconStyle, cornerStyle: style.cornerStyle }
        : undefined,
    },
    brandProfileId: brand?.id ?? null,
    brandStyleText: style
      ? [
          `Imagery: ${IMAGE_STYLE_LABELS[style.imageStyle]}`,
          `Patterns allowed: ${style.patterns.length ? style.patterns.join(", ") : "none"}`,
          style.illustrationStyle ? `Illustration style: ${style.illustrationStyle}` : null,
          style.graphicElements ? `Graphic elements: ${style.graphicElements}` : null,
          `Icons: ${style.iconStyle}; corners: ${style.cornerStyle}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "",
  }
}

export function objectiveLabel(id: string): string {
  return CREATIVE_OBJECTIVES.find((o) => o.id === id)?.label ?? id
}

export function describeDesignTask(format: CreativeFormat, objective: string, description: string): string {
  return [
    `Format: ${format.label} for ${PLATFORM_LABELS[format.platform]} (${format.width}×${format.height}px${format.maxPages > 1 ? `, carousel up to ${format.maxPages} slides` : ""})`,
    `Objective: ${objectiveLabel(objective)}`,
    `Brief: ${description || "(no brief — propose something fitting the business)"}`,
  ].join("\n")
}

export interface AgentDesignInput {
  provider: ModelProvider
  repository: WorkspaceRepository
  format: CreativeFormat
  objective: string
  /** What the user asked for, including specifics the planner extracted. */
  request: string
  businessContext: string
  concept: { name: string; visualDirection: string; imagePrompt: string; copyOverlay?: string } | null
  /** The approved-to-be caption copy, so the design and the post say the same thing. */
  copy: { headline: string; body: string; callToAction: string } | null
  compose: ComposeContext
  brandProfileId: string | null
  /** The brand kit's visual style, described for the model. */
  brandStyle?: string
  /** What kind of image is available (when compose.imageAssetId is set). */
  imageKind?: "photo" | "illustration" | "3d render" | "product image"
  signal?: AbortSignal
}

export interface AgentDesignResult {
  project: CreativeProject
  spec: DesignSpec
  usage: TokenUsage
  model: string
}

/** Designs and saves an editable Creative Studio project for an agent run. */
export async function createAgentDesign(input: AgentDesignInput): Promise<AgentDesignResult> {
  const { format, compose } = input
  const result = await input.provider.generateStructured({
    tier: "fast",
    system: DESIGN_SYSTEM,
    input: [
      `## Business and brand context\n${input.businessContext}`,
      `## What the user asked for\n${input.request}`,
      `## Task\n${describeDesignTask(format, input.objective, input.concept?.visualDirection ?? "")}`,
      input.concept
        ? `## Chosen concept\n${input.concept.name}: ${input.concept.visualDirection}${input.concept.copyOverlay ? `\nCopy overlay idea: ${input.concept.copyOverlay}` : ""}`
        : null,
      input.copy
        ? `## Post copy (keep the design consistent with it)\nHeadline: ${input.copy.headline}\nBody: ${input.copy.body.slice(0, 600)}\nCTA: ${input.copy.callToAction}`
        : null,
      input.brandStyle ? `## Brand visual style (follow it)\n${input.brandStyle}` : null,
      compose.imageAssetId
        ? `An image is available for this design: a ${input.imageKind ?? "photo"}.`
        : "No image is available: make a strong graphic design (layout, features with icons, pattern, decoration).",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: designSpecSchema,
    schemaName: "design_spec",
    maxOutputTokens: 4000,
    signal: input.signal,
  })
  const spec = result.data
  const document = composeDocument(spec, compose)
  const name = (input.concept?.name ? `${input.concept.name} — ${format.label}` : spec.headline || format.label).slice(0, 160)
  const project: CreativeProject = {
    id: crypto.randomUUID(),
    name,
    objective: input.objective,
    platform: format.platform,
    formatId: format.id,
    brandProfileId: input.brandProfileId,
    status: "draft",
    document,
    brief: {
      objective: input.objective,
      description: input.request.slice(0, 2000),
      concept: input.concept ? { name: input.concept.name, visualDirection: input.concept.visualDirection, imagePrompt: input.concept.imagePrompt } : null,
      spec,
      templateId: null,
    },
    updatedAt: new Date().toISOString(),
  }
  const saved = await input.repository.saveCreativeProject(project)
  return { project: saved, spec, usage: result.usage, model: result.model }
}
