import {
  ProviderError,
  type ModelProvider,
  type ProviderErrorKind,
} from "@/lib/ai/provider-types"

/** How long a provider is skipped after a failure of a given kind (ms). */
const COOLDOWN_MS: Partial<Record<ProviderErrorKind, number>> = {
  quota: 10 * 60_000,
  auth: 10 * 60_000,
  rate_limit: 30_000,
  unavailable: 30_000,
}

/** Shared, in-process record of providers that recently failed. */
export class ProviderHealth {
  private readonly coolingUntil = new Map<string, number>()

  constructor(private readonly now: () => number = Date.now) {}

  isCooling(providerId: string): boolean {
    return (this.coolingUntil.get(providerId) ?? 0) > this.now()
  }

  recordFailure(providerId: string, kind: ProviderErrorKind): void {
    const cooldown = COOLDOWN_MS[kind]
    if (cooldown) this.coolingUntil.set(providerId, this.now() + cooldown)
  }

  recordSuccess(providerId: string): void {
    this.coolingUntil.delete(providerId)
  }
}

const sharedHealth = new ProviderHealth()

function asProviderError(error: unknown, providerId: string): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError("The request was cancelled.", "cancelled", providerId, error)
  }
  return new ProviderError("Unexpected error from the AI provider.", "unknown", providerId, error)
}

function allFailed(errors: ProviderError[]): ProviderError {
  const last = errors.at(-1)
  if (errors.length <= 1 && last) return last
  return new ProviderError(
    `No AI provider could complete the request. ${errors.map((e) => e.message).join(" ")}`,
    last?.kind ?? "unknown",
    last?.providerId ?? null
  )
}

export interface FallbackOptions {
  health?: ProviderHealth
  onFailover?: (from: string, error: ProviderError) => void
}

/**
 * Tries providers in order. A provider that fails (no credits, bad key, rate
 * limit, outage, invalid output) is skipped and the next one is used; providers
 * that recently failed with quota/auth/rate-limit errors are tried last.
 * Streams only fail over before the first text delta, so text is never mixed.
 */
export function createFallbackProvider(providers: ModelProvider[], options: FallbackOptions = {}): ModelProvider {
  if (providers.length === 0) throw new Error("At least one provider is required")
  const health = options.health ?? sharedHealth

  const ordered = () => [
    ...providers.filter((p) => !health.isCooling(p.id)),
    ...providers.filter((p) => health.isCooling(p.id)),
  ]

  const fail = (provider: ModelProvider, error: ProviderError) => {
    health.recordFailure(provider.id, error.kind)
    options.onFailover?.(provider.id, error)
  }

  return {
    id: providers.map((p) => p.id).join("+"),
    modelFor: (tier) => ordered()[0]!.modelFor(tier),

    async generateStructured(request) {
      const errors: ProviderError[] = []
      for (const provider of ordered()) {
        try {
          const result = await provider.generateStructured(request)
          health.recordSuccess(provider.id)
          return result
        } catch (error) {
          const providerError = asProviderError(error, provider.id)
          if (!providerError.canFailOver) throw providerError
          errors.push(providerError)
          fail(provider, providerError)
        }
      }
      throw allFailed(errors)
    },

    async *streamText(request) {
      const errors: ProviderError[] = []
      for (const provider of ordered()) {
        let emitted = false
        try {
          for await (const chunk of provider.streamText(request)) {
            if (chunk.type === "delta") emitted = true
            yield chunk
          }
          health.recordSuccess(provider.id)
          return
        } catch (error) {
          const providerError = asProviderError(error, provider.id)
          if (emitted || !providerError.canFailOver) throw providerError
          errors.push(providerError)
          fail(provider, providerError)
        }
      }
      throw allFailed(errors)
    },
  }
}
