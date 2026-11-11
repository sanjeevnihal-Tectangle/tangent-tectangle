import "server-only"

import type { ModelProvider } from "@/lib/ai/provider-types"
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic"
import { createFallbackProvider } from "@/lib/ai/providers/fallback"
import { createOpenAIProvider } from "@/lib/ai/providers/openai"
import { serverEnv } from "@/lib/env/server"

export {
  ProviderError,
  type ModelProvider,
  type ModelTier,
  type TokenUsage,
} from "@/lib/ai/provider-types"

export type AIProviderId = "openai" | "anthropic"

export const AI_PROVIDER_LABELS: Record<AIProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
}

/** Providers with credentials, in the configured failover order. */
export function configuredProviderIds(): AIProviderId[] {
  const env = serverEnv()
  const available: Record<AIProviderId, boolean> = {
    openai: Boolean(env.OPENAI_API_KEY),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
  }
  const order = env.AI_PROVIDER_ORDER.split(",")
    .map((id) => id.trim())
    .filter((id): id is AIProviderId => id === "openai" || id === "anthropic")
  const withRemaining = [...new Set<AIProviderId>([...order, "openai", "anthropic"])]
  return withRemaining.filter((id) => available[id])
}

function build(id: AIProviderId): ModelProvider {
  const env = serverEnv()
  switch (id) {
    case "openai":
      return createOpenAIProvider(env.OPENAI_API_KEY!, { fast: env.AI_MODEL_FAST, reasoning: env.AI_MODEL_REASONING })
    case "anthropic":
      return createAnthropicProvider(env.ANTHROPIC_API_KEY!, {
        fast: env.ANTHROPIC_MODEL_FAST,
        reasoning: env.ANTHROPIC_MODEL_REASONING,
      })
    default: {
      const unreachable: never = id
      throw new Error(`Unknown AI provider ${String(unreachable)}`)
    }
  }
}

/**
 * Returns a provider that fails over between every configured AI vendor
 * (AI_PROVIDER_ORDER), or null when no AI credentials are set.
 */
export function getModelProvider(): ModelProvider | null {
  const ids = configuredProviderIds()
  if (ids.length === 0) return null
  return createFallbackProvider(ids.map(build), {
    onFailover: (from, error) =>
      console.warn(`[tangent] AI provider "${from}" failed (${error.kind}): ${error.message} — trying next provider`),
  })
}
