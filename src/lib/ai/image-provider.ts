import "server-only"

import OpenAI from "openai"

import { ProviderError } from "@/lib/ai/provider-types"
import { toProviderError } from "@/lib/ai/providers/openai"
import { serverEnv } from "@/lib/env/server"

export type ImageAspect = "square" | "portrait" | "landscape"

const SIZES: Record<ImageAspect, { size: "1024x1024" | "1024x1536" | "1536x1024"; width: number; height: number }> = {
  square: { size: "1024x1024", width: 1024, height: 1024 },
  portrait: { size: "1024x1536", width: 1024, height: 1536 },
  landscape: { size: "1536x1024", width: 1536, height: 1024 },
}

export function aspectFor(width: number, height: number): ImageAspect {
  const ratio = width / height
  if (ratio > 1.15) return "landscape"
  if (ratio < 0.87) return "portrait"
  return "square"
}

export interface GeneratedImage {
  bytes: Uint8Array
  mimeType: "image/png" | "image/jpeg"
  width: number
  height: number
  provider: string
  model: string
}

export interface ImageProvider {
  readonly id: string
  readonly model: string
  /** `format` defaults to PNG; use JPEG for Instagram, whose publishing API only accepts JPEG. */
  generate(input: { prompt: string; aspect: ImageAspect; format?: "png" | "jpeg"; signal?: AbortSignal }): Promise<GeneratedImage>
}

function createOpenAIImageProvider(apiKey: string, model: string): ImageProvider {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 180_000 })
  return {
    id: "openai",
    model,
    async generate({ prompt, aspect, format = "png", signal }) {
      const { size, width, height } = SIZES[aspect]
      try {
        const response = await client.images.generate(
          { model, prompt, size, n: 1, output_format: format, quality: "medium" },
          { signal }
        )
        const b64 = response.data?.[0]?.b64_json
        if (!b64) throw new ProviderError("The image model returned no image.", "invalid_response", "openai")
        const mimeType = format === "jpeg" ? "image/jpeg" : "image/png"
        return { bytes: Uint8Array.from(Buffer.from(b64, "base64")), mimeType, width, height, provider: "openai", model }
      } catch (error) {
        throw toProviderError(error)
      }
    },
  }
}

/** Configured image generator, or null when IMAGE_PROVIDER is "none" or credentials are missing. */
export function getImageProvider(): ImageProvider | null {
  const env = serverEnv()
  switch (env.IMAGE_PROVIDER) {
    case "openai":
      return env.OPENAI_API_KEY ? createOpenAIImageProvider(env.OPENAI_API_KEY, env.IMAGE_MODEL) : null
    case "none":
      return null
    default: {
      const unreachable: never = env.IMAGE_PROVIDER
      throw new Error(`Unknown image provider ${String(unreachable)}`)
    }
  }
}
