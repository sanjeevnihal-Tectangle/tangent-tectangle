import "server-only"

import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"

import {
  ProviderError,
  type ModelProvider,
  type ModelTier,
  type ProviderErrorKind,
  type TokenUsage,
} from "@/lib/ai/provider-types"

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError("The request was cancelled.", "cancelled", "openai", error)
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status
    let kind: ProviderErrorKind = "unknown"
    let message = `OpenAI error (${status ?? "network"}): ${error.message}`
    if (status === 401 || status === 403) {
      kind = "auth"
      message = "The OpenAI API key was rejected."
    } else if (status === 429 && (error.type === "insufficient_quota" || error.code === "credit_balance_exhausted")) {
      kind = "quota"
      message = "The OpenAI account has no credits remaining."
    } else if (status === 429) {
      kind = "rate_limit"
      message = "OpenAI is rate limiting requests."
    } else if (status === undefined || status >= 500) {
      kind = "unavailable"
      message = "OpenAI is temporarily unavailable."
    } else if (status === 400 || status === 404) {
      kind = "invalid_request"
      message = status === 404 ? "The configured OpenAI model is not available to this key." : `OpenAI rejected the request: ${error.message}`
    }
    return new ProviderError(message, kind, "openai", error)
  }
  console.error("[tangent] unexpected OpenAI error", error)
  const detail = error instanceof Error && error.message ? ` (${error.name}: ${error.message.replace(/\s+/g, " ").slice(0, 200)})` : ""
  return new ProviderError(`Unexpected error from OpenAI${detail}.`, "unknown", "openai", error)
}

export function createOpenAIProvider(apiKey: string, models: Record<ModelTier, string>): ModelProvider {
  const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 120_000 })
  const modelFor = (tier: ModelTier) => models[tier]

  return {
    id: "openai",
    modelFor,

    async generateStructured(request) {
      const model = modelFor(request.tier)
      try {
        const response = await client.responses.parse(
          {
            model,
            instructions: request.system,
            input: request.images?.length
              ? [
                  {
                    role: "user" as const,
                    content: [
                      { type: "input_text" as const, text: request.input },
                      ...request.images.map((image) => ({
                        type: "input_image" as const,
                        image_url: `data:${image.mimeType};base64,${image.data}`,
                        detail: "auto" as const,
                      })),
                    ],
                  },
                ]
              : request.input,
            max_output_tokens: request.maxOutputTokens,
            text: { format: zodTextFormat(request.schema, request.schemaName) },
          },
          { signal: request.signal }
        )
        if (response.output_parsed == null) {
          const refusal = response.output
            .flatMap((item) => (item.type === "message" ? item.content : []))
            .find((part) => part.type === "refusal")
          const reason =
            response.status === "incomplete"
              ? response.incomplete_details?.reason === "max_output_tokens"
                ? ` (${model} ran out of output tokens before finishing)`
                : ` (response incomplete: ${response.incomplete_details?.reason ?? "unknown reason"})`
              : refusal
                ? " (the model refused the request)"
                : ` (status: ${response.status ?? "unknown"})`
          console.error("[tangent] OpenAI structured output missing", { model, status: response.status, incomplete: response.incomplete_details })
          throw new ProviderError(`OpenAI did not return a valid structured response${reason}.`, "invalid_response", "openai")
        }
        return {
          data: request.schema.parse(response.output_parsed),
          usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
          model,
        }
      } catch (error) {
        throw toProviderError(error)
      }
    },

    async *streamText(request) {
      const model = modelFor(request.tier)
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
      try {
        const stream = await client.responses.create(
          {
            model,
            instructions: request.system,
            input: request.input,
            max_output_tokens: request.maxOutputTokens,
            stream: true,
          },
          { signal: request.signal }
        )
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            yield { type: "delta", text: event.delta }
          } else if (event.type === "response.completed") {
            usage = {
              inputTokens: event.response.usage?.input_tokens ?? 0,
              outputTokens: event.response.usage?.output_tokens ?? 0,
            }
          } else if (event.type === "response.failed" || event.type === "error") {
            throw new ProviderError("OpenAI failed while generating the response.", "unavailable", "openai")
          }
        }
      } catch (error) {
        throw toProviderError(error)
      }
      yield { type: "done", usage, model }
    },
  }
}
