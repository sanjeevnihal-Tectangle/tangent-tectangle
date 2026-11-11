"use server"

import { z } from "zod"

import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type MediaAsset } from "@/lib/domain/media"
import { resolveWorkspace } from "@/lib/workspace/server"

export type AssetActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const metaSchema = z.object({
  name: z.string().trim().min(1).max(160),
  width: z.coerce.number().int().positive().max(20000).nullable(),
  height: z.coerce.number().int().positive().max(20000).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
})

/** Uploads one image (multipart: file, name, width, height, tags[]). */
export async function uploadAsset(workspace: string, formData: FormData): Promise<AssetActionResult<MediaAsset>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) return { ok: false, error: "Your role cannot upload assets." }

  const file = formData.get("file")
  if (!(file instanceof File)) return { ok: false, error: "No file received." }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name}: only PNG, JPEG, WebP, GIF and SVG images are supported.` }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is larger than 10 MB.` }

  const meta = metaSchema.safeParse({
    name: (formData.get("name") as string | null) || file.name.replace(/\.[^.]+$/, ""),
    width: formData.get("width") || null,
    height: formData.get("height") || null,
    tags: formData.getAll("tags").map(String),
  })
  if (!meta.success) return { ok: false, error: "Invalid file details." }

  try {
    const asset = await repository.uploadAsset({
      ...meta.data,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      source: "upload",
      generation: null,
    })
    await repository.recordAudit({
      action: "asset.uploaded",
      entityType: "media_asset",
      entityId: asset.id,
      summary: `Uploaded ${asset.name}`,
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: asset }
  } catch (error) {
    console.error("[tangent] asset upload failed", error)
    return { ok: false, error: error instanceof Error && context.mode === "demo" ? error.message : `Could not upload ${file.name}.` }
  }
}

export async function deleteAsset(workspace: string, id: string): Promise<AssetActionResult<null>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("content.create")) return { ok: false, error: "Your role cannot delete assets." }
  try {
    await repository.deleteAsset(id)
    await repository.recordAudit({
      action: "asset.deleted",
      entityType: "media_asset",
      entityId: id,
      summary: "Deleted an asset",
      actor: { type: "user", id: context.user.id },
    })
    return { ok: true, data: null }
  } catch {
    return { ok: false, error: "Could not delete the asset." }
  }
}

/** Fresh asset list (with signed URLs) for pickers. */
export async function searchAssets(workspace: string, search: string): Promise<AssetActionResult<MediaAsset[]>> {
  const { repository } = await resolveWorkspace(workspace)
  try {
    return { ok: true, data: await repository.listAssets({ search: search.slice(0, 80), limit: 60 }) }
  } catch {
    return { ok: false, error: "Could not load assets." }
  }
}
