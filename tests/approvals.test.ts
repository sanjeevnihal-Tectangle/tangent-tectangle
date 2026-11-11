import { describe, expect, it } from "vitest"

import {
  ApprovalError,
  assertExecutable,
  canTransition,
  classifyOperation,
  hashPayload,
  reviseRequest,
  stableStringify,
  transition,
  type ApprovalRequest,
} from "@/lib/approvals/engine"
import { decisionToStatus } from "@/lib/domain/approvals"

async function makeRequest(overrides: Partial<ApprovalRequest<Record<string, unknown>>> = {}) {
  const payload = { caption: "Slow-cooked since sunrise", publishAt: "2026-11-11T12:00:00+05:30" }
  return {
    id: "apr-1",
    version: 1,
    previousVersionId: null,
    actionType: "publish_post",
    connectedAccountId: "acc-1",
    payload,
    payloadHash: await hashPayload(payload),
    financialImpact: null,
    requestedByAgent: "copywriter",
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    ...overrides,
  } satisfies ApprovalRequest<Record<string, unknown>>
}

describe("payload hashing", () => {
  it("is independent of key order", async () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
    expect(await hashPayload({ b: 1, a: 2 })).toBe(await hashPayload({ a: 2, b: 1 }))
  })

  it("changes when any value changes", async () => {
    expect(await hashPayload({ budget: 2000 })).not.toBe(await hashPayload({ budget: 2001 }))
  })

  it("produces a 64-char hex SHA-256 digest", async () => {
    expect(await hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("operation classification", () => {
  it("treats every external action as execute", () => {
    expect(classifyOperation("read")).toBe("read")
    expect(classifyOperation("create")).toBe("create")
    expect(classifyOperation("publish_post")).toBe("execute")
    expect(classifyOperation("increase_budget")).toBe("execute")
  })
})

describe("approval state machine", () => {
  it("allows decisions only from pending", async () => {
    const request = await makeRequest()
    const approved = transition(request, "approved", { by: "user-1", at: "2026-11-10T10:00:00Z" })
    expect(approved.status).toBe("approved")
    expect(approved.decidedBy).toBe("user-1")
    expect(() => transition(approved, "rejected")).toThrow(ApprovalError)
    expect(canTransition("rejected", "approved")).toBe(false)
    expect(canTransition("executed", "executing")).toBe(false)
  })

  it("maps UI decisions to statuses", () => {
    expect(decisionToStatus("approve")).toBe("approved")
    expect(decisionToStatus("reject")).toBe("rejected")
    expect(decisionToStatus("request_changes")).toBe("changes_requested")
  })

  it("requires re-approval when an approved action is modified", async () => {
    const approved = transition(await makeRequest(), "approved", { by: "user-1", at: "now" })
    const { superseded, revision } = await reviseRequest(approved, { ...approved.payload, caption: "Edited" }, "apr-2")
    expect(superseded.status).toBe("superseded")
    expect(revision.status).toBe("pending")
    expect(revision.version).toBe(2)
    expect(revision.previousVersionId).toBe("apr-1")
    expect(revision.decidedBy).toBeNull()
    expect(revision.payloadHash).not.toBe(approved.payloadHash)
  })
})

describe("execution gate", () => {
  it("rejects actions that are not approved", async () => {
    const request = await makeRequest()
    await expect(assertExecutable(request, request.payload)).rejects.toMatchObject({ code: "not_approved" })
  })

  it("rejects a payload that differs from the approved one", async () => {
    const approved = transition(await makeRequest(), "approved")
    await expect(assertExecutable(approved, { ...approved.payload, caption: "Sneaky edit" })).rejects.toMatchObject({
      code: "payload_mismatch",
    })
  })

  it("enforces workspace spend limits", async () => {
    const approved = transition(
      await makeRequest({ actionType: "increase_budget", financialImpact: { currency: "INR", maxSpendPaise: 80_000, period: "daily" } }),
      "approved"
    )
    await expect(assertExecutable(approved, approved.payload, 50_000)).rejects.toMatchObject({ code: "spend_limit_exceeded" })
    await expect(assertExecutable(approved, approved.payload, 100_000)).resolves.toBeUndefined()
  })

  it("allows the exact approved payload", async () => {
    const approved = transition(await makeRequest(), "approved")
    await expect(assertExecutable(approved, { publishAt: approved.payload.publishAt, caption: approved.payload.caption })).resolves.toBeUndefined()
  })
})
