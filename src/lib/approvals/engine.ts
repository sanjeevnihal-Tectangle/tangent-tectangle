/**
 * Approval & execution engine (pure domain logic, no I/O).
 *
 * Every AI operation is classified as READ, CREATE or EXECUTE. EXECUTE
 * operations touch external systems or spend money and can only run against an
 * approval request whose exact payload (by content hash) was approved by a
 * human with the right permission.
 */

export type OperationClass = "read" | "create" | "execute"

export const EXTERNAL_ACTION_TYPES = [
  "publish_post",
  "schedule_post",
  "launch_ad_campaign",
  "increase_budget",
  "change_targeting",
  "send_marketing_message",
  "delete_published_content",
] as const
export type ExternalActionType = (typeof EXTERNAL_ACTION_TYPES)[number]

export const EXTERNAL_ACTION_LABELS: Record<ExternalActionType, string> = {
  publish_post: "Publish post",
  schedule_post: "Schedule post",
  launch_ad_campaign: "Launch ad campaign",
  increase_budget: "Increase budget",
  change_targeting: "Change campaign targeting",
  send_marketing_message: "Send marketing message",
  delete_published_content: "Delete published content",
}

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "superseded",
  "executing",
  "executed",
  "failed",
  "expired",
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

const TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  pending: ["approved", "rejected", "changes_requested", "superseded", "expired"],
  approved: ["executing", "superseded", "expired"],
  changes_requested: ["superseded"],
  executing: ["executed", "failed"],
  failed: ["superseded"],
  rejected: [],
  superseded: [],
  executed: [],
  expired: [],
}

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export interface FinancialImpact {
  currency: "INR"
  /** Maximum spend this action can cause, in paise. */
  maxSpendPaise: number
  period: "one_time" | "daily" | "lifetime"
}

export interface ApprovalRequest<TPayload = unknown> {
  id: string
  version: number
  /** Id of the request this version replaces, if any. */
  previousVersionId: string | null
  actionType: ExternalActionType
  connectedAccountId: string | null
  payload: TPayload
  payloadHash: string
  financialImpact: FinancialImpact | null
  requestedByAgent: string | null
  status: ApprovalStatus
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_transition"
      | "not_approved"
      | "payload_mismatch"
      | "spend_limit_exceeded"
  ) {
    super(message)
    this.name = "ApprovalError"
  }
}

export function classifyOperation(
  action: ExternalActionType | "read" | "create"
): OperationClass {
  if (action === "read") return "read"
  if (action === "create") return "create"
  return "execute"
}

/** Deterministic JSON serialisation (sorted keys) used for payload hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`
}

export async function hashPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function transition<T>(
  request: ApprovalRequest<T>,
  to: ApprovalStatus,
  decision?: { by: string; at: string; note?: string }
): ApprovalRequest<T> {
  if (!canTransition(request.status, to)) {
    throw new ApprovalError(
      `Cannot move approval from "${request.status}" to "${to}"`,
      "invalid_transition"
    )
  }
  return {
    ...request,
    status: to,
    decidedBy: decision?.by ?? request.decidedBy,
    decidedAt: decision?.at ?? request.decidedAt,
    decisionNote: decision?.note ?? request.decisionNote,
  }
}

/**
 * Any modification to an action produces a new pending version; the previous
 * version is superseded, even if it had already been approved.
 */
export async function reviseRequest<T>(
  current: ApprovalRequest<T>,
  newPayload: T,
  newId: string
): Promise<{ superseded: ApprovalRequest<T>; revision: ApprovalRequest<T> }> {
  const superseded = transition(current, "superseded")
  const revision: ApprovalRequest<T> = {
    ...current,
    id: newId,
    version: current.version + 1,
    previousVersionId: current.id,
    payload: newPayload,
    payloadHash: await hashPayload(newPayload),
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  }
  return { superseded, revision }
}

/**
 * Gate called by every executor immediately before an external side effect.
 * Throws unless the request is approved, the payload about to be executed is
 * byte-identical to what was approved, and spend stays within the limit.
 */
export async function assertExecutable<T>(
  request: ApprovalRequest<T>,
  payloadToExecute: T,
  spendLimitPaise?: number
): Promise<void> {
  if (request.status !== "approved") {
    throw new ApprovalError(
      `Action requires approval (current status: ${request.status})`,
      "not_approved"
    )
  }
  const hash = await hashPayload(payloadToExecute)
  if (hash !== request.payloadHash) {
    throw new ApprovalError(
      "The action differs from the approved version and must be re-approved",
      "payload_mismatch"
    )
  }
  if (
    spendLimitPaise !== undefined &&
    request.financialImpact &&
    request.financialImpact.maxSpendPaise > spendLimitPaise
  ) {
    throw new ApprovalError(
      "Projected spend exceeds the workspace spending limit",
      "spend_limit_exceeded"
    )
  }
}
