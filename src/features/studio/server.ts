import "server-only"

import type { CreativeFormat } from "@/lib/creative/formats"
import type { ComposeContext } from "@/lib/creative/layout"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { BrandProfile } from "@/lib/domain/brand"
import type { WorkspaceContext } from "@/lib/domain/workspace"

export async function loadStudioBrand(repository: WorkspaceRepository, context: WorkspaceContext) {
  const [brands, profile] = await Promise.all([repository.listBrandProfiles(), repository.getBusinessProfile()])
  const brand: BrandProfile | null = brands.find((b) => b.isDefault) ?? brands[0] ?? null
  return { brand, brands, businessName: profile?.name ?? context.workspace.name }
}

export async function composeContext(
  repository: WorkspaceRepository,
  context: WorkspaceContext,
  format: CreativeFormat,
  imageAssetId: string | null
): Promise<{ ctx: ComposeContext; brandProfileId: string | null }> {
  const { brand, businessName } = await loadStudioBrand(repository, context)
  return {
    ctx: {
      format,
      brandColors: brand?.colors ?? [],
      businessName,
      logoAssetId: brand?.logoAssetId ?? null,
      imageAssetId,
    },
    brandProfileId: brand?.id ?? null,
  }
}
