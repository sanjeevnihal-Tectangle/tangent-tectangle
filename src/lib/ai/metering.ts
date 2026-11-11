import "server-only"

import type { TokenUsage } from "@/lib/ai/provider-types"
import { checkEntitlement, creditsForTokens, DEFAULT_PLANS, ESTIMATED_CREDITS_PER_RUN, type EntitlementKey } from "@/lib/billing/plans"
import type { WorkspaceRepository } from "@/lib/data/types"
import type { WorkspaceContext } from "@/lib/domain/workspace"

/** Returns an error message when the workspace has no allowance left, otherwise null. */
export function quotaError(context: WorkspaceContext, key: EntitlementKey, increment: number): string | null {
  const used = context.usage.find((u) => u.key === key)?.used ?? 0
  const check = checkEntitlement(DEFAULT_PLANS[context.workspace.planId].entitlements, key, used, increment)
  if (check.allowed) return null
  return key === "ai_credits_monthly"
    ? "This workspace has used its AI credits for the month."
    : `This workspace has reached its monthly limit for ${key.replaceAll("_", " ").replace(" monthly", "")}.`
}

export function aiQuotaError(context: WorkspaceContext): string | null {
  return quotaError(context, "ai_credits_monthly", ESTIMATED_CREDITS_PER_RUN)
}

export async function meterAi(repository: WorkspaceRepository, usage: TokenUsage, feature: string): Promise<void> {
  const tokens = usage.inputTokens + usage.outputTokens
  if (tokens > 0) await repository.recordUsage("ai_credits_monthly", creditsForTokens(tokens), { feature, tokens })
}
