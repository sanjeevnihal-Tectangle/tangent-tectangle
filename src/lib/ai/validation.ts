import { findProhibitedPhrases } from "@/lib/domain/brand"
import type { ValidationCheck } from "@/lib/ai/events"
import type { AgentOutput } from "@/lib/ai/outputs"

const BUDGET_TOLERANCE = 2

/** Post-generation checks applied to every run before results are presented. */
export function validateOutputs(
  outputs: { output: AgentOutput; text: string }[],
  failedSteps: number,
  prohibitedPhrases: readonly string[]
): ValidationCheck[] {
  const checks: ValidationCheck[] = []

  checks.push(
    failedSteps === 0
      ? { label: "Output schema", status: "pass", detail: "All agent outputs matched their schemas." }
      : { label: "Output schema", status: "fail", detail: `${failedSteps} step(s) failed and were skipped.` }
  )

  const combined = outputs.map((o) => o.text).join("\n")
  const violations = findProhibitedPhrases(combined, prohibitedPhrases)
  checks.push(
    violations.length === 0
      ? {
          label: "Prohibited messaging",
          status: "pass",
          detail: prohibitedPhrases.length
            ? `Checked against ${prohibitedPhrases.length} prohibited phrase(s).`
            : "No prohibited phrases configured in the brand profile.",
        }
      : {
          label: "Prohibited messaging",
          status: "fail",
          detail: `Found: ${violations.map((v) => `"${v}"`).join(", ")}. Edit before using this copy.`,
        }
  )

  for (const { output } of outputs) {
    if (output.kind !== "strategy" || output.data.channelPlan.length === 0) continue
    const total = output.data.channelPlan.reduce((sum, c) => sum + c.budgetSharePercent, 0)
    checks.push(
      Math.abs(total - 100) <= BUDGET_TOLERANCE
        ? { label: "Budget allocation", status: "pass", detail: "Channel shares sum to 100%." }
        : { label: "Budget allocation", status: "warn", detail: `Channel shares sum to ${total}%, not 100%.` }
    )
  }

  return checks
}
