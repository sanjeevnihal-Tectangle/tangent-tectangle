import "server-only"

import { SHARED_RULES } from "@/lib/ai/agents/handlers"
import type { ModelProvider, TokenUsage } from "@/lib/ai/provider"
import { CREATIVE_OBJECTIVES, PLATFORM_LABELS, type CreativeFormat } from "@/lib/creative/formats"
import { composeDocument, DESIGN_LAYOUTS, designSpecSchema, LAYOUT_LABELS, type ComposeContext, type DesignSpec } from "@/lib/creative/layout"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { BrandProfile } from "@/lib/domain/brand"
import type { CreativeProject } from "@/lib/domain/creative"

/**
 * Turning a brief into an editable Creative Studio design: the model picks the
 * layout, copy and palette (a DesignSpec); the layout engine computes the
 * layers. Shared by the Studio wizard and the Command Centre agents.
 */

export const DESIGN_SYSTEM = `${SHARED_RULES}

You are the Graphic Designer composing a finished marketing design. A layout engine positions everything; you decide:
- layout: one of ${DESIGN_LAYOUTS.map((l) => `${l} (${LAYOUT_LABELS[l]})`).join(", ")}. Prefer split when a photo is available,
  bold_type for punchy announcements and thumbnails, centered_hero for offers, corner_minimal for quotes and premium tone.
- copy: headline ≤ 8 words, subheadline ≤ 16 words, CTA 2–4 words, optional very short badge. Follow the brand voice.
  When the user asked for specific wording, a product name, an offer, a price or a CTA, use it exactly.
- palette: background, text and accent hex colours chosen ONLY from the brand palette; text must contrast strongly with background.
- backgroundStyle: "image" only if told a photo is available, otherwise "solid" or "gradient".
- imagePrompt: a photographic prompt matching the concept (no text in the image).
- slides: for carousel formats, 3–6 slides (headline + 1–2 sentence body) after the cover; otherwise an empty list.`

/** Default brand profile and business name used to compose designs. */
export async function loadDesignBrand(repository: WorkspaceRepository, fallbackName: string) {
  const [brands, profile] = await Promise.all([repository.listBrandProfiles(), repository.getBusinessProfile()])
  const brand: BrandProfile | null = brands.find((b) => b.isDefault) ?? brands[0] ?? null
  return { brand, brands, businessName: profile?.name ?? fallbackName }
}

export async function designComposeContext(
  repository: WorkspaceRepository,
  fallbackName: string,
  format: CreativeFormat,
  imageAssetId: string | null
): Promise<{ ctx: ComposeContext; brandProfileId: string | null }> {
  const { brand, businessName } = await loadDesignBrand(repository, fallbackName)
  return {
    ctx: { format, brandColors: brand?.colors ?? [], businessName, logoAssetId: brand?.logoAssetId ?? null, imageAssetId },
    brandProfileId: brand?.id ?? null,
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
      `A photo is ${compose.imageAssetId ? "available" : "NOT available"} for this design.`,
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
