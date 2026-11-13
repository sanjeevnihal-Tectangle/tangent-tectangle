import "server-only"

import { designComposeContext, loadDesignBrand } from "@/lib/creative/agent-design"
import type { CreativeFormat } from "@/lib/creative/formats"
import type { ComposeContext } from "@/lib/creative/layout"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { WorkspaceContext } from "@/lib/domain/workspace"

export function loadStudioBrand(repository: WorkspaceRepository, context: WorkspaceContext, brandProfileId?: string | null) {
  return loadDesignBrand(repository, context.workspace.name, brandProfileId)
}

export function composeContext(
  repository: WorkspaceRepository,
  context: WorkspaceContext,
  format: CreativeFormat,
  imageAssetId: string | null,
  brandProfileId?: string | null
): Promise<{ ctx: ComposeContext; brandProfileId: string | null; brandStyleText: string }> {
  return designComposeContext(repository, context.workspace.name, format, imageAssetId, brandProfileId)
}
