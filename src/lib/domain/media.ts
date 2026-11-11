export const MEDIA_KINDS = ["image", "video", "audio", "document"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const MEDIA_SOURCES = ["upload", "ai_generated", "imported"] as const
export type MediaSource = (typeof MEDIA_SOURCES)[number]

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  source: MediaSource
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  tags: string[]
  /** Short-lived signed URL (null if the file could not be signed). */
  url: string | null
  generation: { provider: string; model: string; prompt: string } | null
  createdAt: string
}

export interface NewMediaAsset {
  name: string
  mimeType: string
  bytes: Uint8Array
  width: number | null
  height: number | null
  tags: string[]
  source: MediaSource
  generation: MediaAsset["generation"]
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png"
    case "image/jpeg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "image/svg+xml":
      return "svg"
    default:
      return "bin"
  }
}
