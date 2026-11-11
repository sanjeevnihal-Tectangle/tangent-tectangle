import { describe, expect, it } from "vitest"

import { can, DEFAULT_ROLE_PERMISSIONS, isRole, PERMISSIONS } from "@/lib/auth/permissions"
import { checkEntitlement, creditsForTokens, DEFAULT_PLANS, ENTITLEMENT_KEYS, PLAN_IDS } from "@/lib/billing/plans"

describe("role permissions", () => {
  it("gives owners every permission and admins everything except billing", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner).toEqual(PERMISSIONS)
    expect(can("admin", "billing.manage")).toBe(false)
    expect(can("admin", "members.manage")).toBe(true)
  })

  it("keeps viewers read-only", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).toEqual(["analytics.view"])
    expect(can("viewer", "ai.run")).toBe(false)
  })

  it("separates spend approval from content publishing", () => {
    expect(can("marketer", "content.publish")).toBe(true)
    expect(can("marketer", "ads.approve_spend")).toBe(false)
    expect(can("designer", "content.publish")).toBe(false)
  })

  it("validates role strings", () => {
    expect(isRole("analyst")).toBe(true)
    expect(isRole("superuser")).toBe(false)
  })
})

describe("plan entitlements", () => {
  it("defines every entitlement for every plan", () => {
    for (const plan of PLAN_IDS) {
      for (const key of ENTITLEMENT_KEYS) {
        expect(DEFAULT_PLANS[plan].entitlements).toHaveProperty(key)
      }
    }
  })

  it("prices plans in paise", () => {
    expect(DEFAULT_PLANS.starter.monthlyPricePaise).toBe(199_900)
    expect(DEFAULT_PLANS.growth.monthlyPricePaise).toBe(499_900)
    expect(DEFAULT_PLANS.professional.monthlyPricePaise).toBe(999_900)
    expect(DEFAULT_PLANS.agency.monthlyPricePaise).toBeNull()
  })

  it("blocks usage beyond the limit", () => {
    const limits = DEFAULT_PLANS.starter.entitlements
    expect(checkEntitlement(limits, "team_members", 1).allowed).toBe(true)
    expect(checkEntitlement(limits, "team_members", 2).allowed).toBe(false)
    expect(checkEntitlement(limits, "ai_credits_monthly", 490, 15)).toMatchObject({ allowed: false, remaining: 10 })
  })

  it("treats null limits as unlimited", () => {
    expect(checkEntitlement(DEFAULT_PLANS.agency.entitlements, "team_members", 10_000)).toMatchObject({ allowed: true, limit: null })
  })

  it("charges one credit per started 1,000 tokens", () => {
    expect(creditsForTokens(0)).toBe(1)
    expect(creditsForTokens(1000)).toBe(1)
    expect(creditsForTokens(1001)).toBe(2)
  })
})
