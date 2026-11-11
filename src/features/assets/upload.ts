"use client"

import { uploadAsset } from "@/features/assets/actions"
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type MediaAsset } from "@/lib/domain/media"

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (file.type === "image/svg+xml") return null
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

/** Validates in the browser, measures and uploads one file. Server re-validates. */
export async function uploadFile(workspace: string, file: File, tags: string[] = []): Promise<{ ok: true; asset: MediaAsset } | { ok: false; error: string }> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name}: only PNG, JPEG, WebP, GIF and SVG images are supported.` }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is larger than 10 MB.` }
  const size = await imageDimensions(file)
  const form = new FormData()
  form.set("file", file)
  form.set("name", file.name.replace(/\.[^.]+$/, ""))
  if (size) {
    form.set("width", String(size.width))
    form.set("height", String(size.height))
  }
  for (const tag of tags) form.append("tags", tag)
  const result = await uploadAsset(workspace, form)
  return result.ok ? { ok: true, asset: result.data } : { ok: false, error: result.error }
}
