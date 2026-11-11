import type { z } from "zod"

export type ModelTier = "fast" | "reasoning"

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface StructuredRequest<TSchema extends z.ZodType> {
  tier: ModelTier
  system: string
  input: string
  schema: TSchema
  schemaName: string
  maxOutputTokens: number
  signal?: AbortSignal
}

export interface TextStreamRequest {
  tier: ModelTier
  system: string
  input: string
  maxOutputTokens: number
  signal?: AbortSignal
}

export type TextStreamChunk =
  | { type: "delta"; text: string }
  | { type: "done"; usage: TokenUsage; model: string }

/** Provider abstraction so models/vendors can be swapped without touching agents. */
export interface ModelProvider {
  readonly id: string
  modelFor(tier: ModelTier): string
  generateStructured<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>
  ): Promise<{ data: z.infer<TSchema>; usage: TokenUsage; model: string }>
  streamText(request: TextStreamRequest): AsyncIterable<TextStreamChunk>
}

/**
 * auth: key rejected · quota: no credits · rate_limit: 429 · unavailable: 5xx /
 * overloaded / network · invalid_response: unparseable output · cancelled: user abort
 */
export type ProviderErrorKind =
  | "auth"
  | "quota"
  | "rate_limit"
  | "unavailable"
  | "invalid_request"
  | "invalid_response"
  | "cancelled"
  | "unknown"

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind = "unknown",
    readonly providerId: string | null = null,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = "ProviderError"
  }

  /** Whether another provider should be tried. Only a user cancellation stops failover. */
  get canFailOver(): boolean {
    return this.kind !== "cancelled"
  }
}
