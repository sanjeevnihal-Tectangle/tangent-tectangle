import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"

import {
  ProviderError,
  type ModelProvider,
  type ModelTier,
  type ProviderErrorKind,
} from "@/lib/ai/provider-types"

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError("The request was cancelled.", "cancelled", "anthropic", error)
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status
    let kind: ProviderErrorKind = "unknown"
    let message = `Anthropic error (${status ?? "network"}): ${error.message}`
    if (status === 401 || status === 403) {
      kind = "auth"
      message = "The Anthropic API key was rejected."
    } else if (/credit balance/i.test(error.message)) {
      // Anthropic reports exhausted credits as a 400 invalid_request_error.
      kind = "quota"
      message = "The Anthropic account has no credits remaining."
    } else if (status === 429) {
      kind = "rate_limit"
      message = "Anthropic is rate limiting requests."
    } else if (status === undefined || status >= 500) {
      kind = "unavailable"
      message = "Anthropic is temporarily unavailable."
    } else if (status === 400 || status === 404) {
      kind = "invalid_request"
      message = status === 404 ? "The configured Anthropic model is not available to this key." : `Anthropic rejected the request: ${error.message}`
    }
    return new ProviderError(message, kind, "anthropic", error)
  }
  console.error("[tangent] unexpected Anthropic error", error)
  const detail = error instanceof Error && error.message ? ` (${error.name}: ${error.message.replace(/\s+/g, " ").slice(0, 200)})` : ""
  return new ProviderError(`Unexpected error from Anthropic${detail}.`, "unknown", "anthropic", error)
}

export function createAnthropicProvider(apiKey: string, models: Record<ModelTier, string>): ModelProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 })
  const modelFor = (tier: ModelTier) => models[tier]

  return {
    id: "anthropic",
    modelFor,

    async generateStructured(request) {
      const model = modelFor(request.tier)
      try {
        const message = await client.messages.parse(
          {
            model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [
              {
                role: "user",
                content: request.images?.length
                  ? [
                      ...request.images.map((image) => ({
                        type: "image" as const,
                        source: { type: "base64" as const, media_type: image.mimeType, data: image.data },
                      })),
                      { type: "text" as const, text: request.input },
                    ]
                  : request.input,
              },
            ],
            output_config: { format: zodOutputFormat(request.schema) },
          },
          { signal: request.signal }
        )
        if (message.parsed_output == null) {
          throw new ProviderError(
            message.stop_reason === "max_tokens"
              ? "Anthropic stopped before finishing the structured response."
              : "Anthropic did not return a valid structured response.",
            "invalid_response",
            "anthropic"
          )
        }
        return {
          data: request.schema.parse(message.parsed_output),
          usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
          model,
        }
      } catch (error) {
        throw toProviderError(error)
      }
    },

    async *streamText(request) {
      const model = modelFor(request.tier)
      let inputTokens = 0
      let outputTokens = 0
      try {
        const stream = client.messages.stream(
          {
            model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: "user", content: request.input }],
          },
          { signal: request.signal }
        )
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "delta", text: event.delta.text }
          } else if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens
          } else if (event.type === "message_delta") {
            outputTokens = event.usage.output_tokens
          }
        }
      } catch (error) {
        throw toProviderError(error)
      }
      yield { type: "done", usage: { inputTokens, outputTokens }, model }
    },
  }
}
