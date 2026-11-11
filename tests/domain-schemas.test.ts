import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { adCampaignPayloadSchema } from "@/lib/domain/ads"
import { brandProfileSchema, emptyBrandProfile, findProhibitedPhrases } from "@/lib/domain/brand"
import { businessProfileSchema, marketingIntelligenceSchema } from "@/lib/domain/business"
import { campaignSchema } from "@/lib/domain/campaigns"
import { DEMO_BRAND_PROFILES, DEMO_BUSINESS_PROFILE, DEMO_INTELLIGENCE } from "@/lib/demo/seed-business"
import { formatINR, initials, percentChange } from "@/lib/format"
import { decryptToken, encryptToken } from "@/lib/integrations/crypto"
import { INTEGRATION_GUIDES } from "@/lib/integrations/guides"
import { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state"
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers"

describe("business profile schema", () => {
  it("accepts the demo profile", () => {
    expect(businessProfileSchema.safeParse(DEMO_BUSINESS_PROFILE).success).toBe(true)
    expect(marketingIntelligenceSchema.safeParse(DEMO_INTELLIGENCE).success).toBe(true)
  })

  it("rejects invalid websites and missing channels", () => {
    const result = businessProfileSchema.safeParse({ ...DEMO_BUSINESS_PROFILE, website: "not a url", preferredChannels: [] })
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."))
    expect(paths).toContain("website")
    expect(paths).toContain("preferredChannels")
  })

  it("allows an empty website", () => {
    expect(businessProfileSchema.safeParse({ ...DEMO_BUSINESS_PROFILE, website: "" }).success).toBe(true)
  })
})

describe("brand profile schema", () => {
  it("accepts the demo brands and an empty profile", () => {
    for (const brand of DEMO_BRAND_PROFILES) expect(brandProfileSchema.safeParse(brand).success).toBe(true)
    expect(brandProfileSchema.safeParse(emptyBrandProfile("id", "New brand")).success).toBe(true)
  })

  it("rejects malformed hex colours", () => {
    const brand = { ...DEMO_BRAND_PROFILES[0]!, colors: [{ name: "Bad", hex: "orange", role: "primary" as const }] }
    expect(brandProfileSchema.safeParse(brand).success).toBe(false)
  })

  it("finds prohibited phrases", () => {
    expect(findProhibitedPhrases("Guaranteed results, cheapest prices", ["cheapest", "guaranteed", "free"])).toEqual(["cheapest", "guaranteed"])
    expect(findProhibitedPhrases("anything", ["", "  "])).toEqual([])
  })
})

describe("formatting", () => {
  it("formats rupees with Indian grouping", () => {
    expect(formatINR(150000)).toBe("₹1,50,000")
  })

  it("computes period-over-period change", () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2)
    expect(percentChange(5, 0)).toBeNull()
  })

  it("derives initials", () => {
    expect(initials("Saffron & Sage")).toBe("SS")
    expect(initials("ananya rao")).toBe("AR")
  })
})

describe("campaigns and ads schemas", () => {
  it("validates a multi-channel campaign and rejects endDate before startDate", () => {
    const valid = campaignSchema.safeParse({
      id: "camp-1",
      name: "Diwali Launch",
      objective: "Online sales & conversions",
      audience: "Urban coffee lovers",
      channels: ["instagram", "meta_ads"],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      budgetInr: 50000,
      landingPageUrl: "https://saffronandsage.in/diwali",
      conversionGoal: "Gift box orders",
      kpis: [{ metric: "ROAS", target: "3.5x", current: "0" }],
      status: "planning",
      brandProfileId: null,
      updatedAt: new Date().toISOString(),
    })
    expect(valid.success).toBe(true)

    const reversedDates = campaignSchema.safeParse({
      id: "camp-2",
      name: "Bad Dates",
      objective: "Lead generation",
      audience: "Local diners",
      channels: ["instagram"],
      startDate: "2026-11-15",
      endDate: "2026-11-01",
      budgetInr: 10000,
      landingPageUrl: "",
      conversionGoal: "Table bookings",
      kpis: [],
      status: "draft",
      brandProfileId: null,
      updatedAt: new Date().toISOString(),
    })
    expect(reversedDates.success).toBe(false)
  })

  it("validates approval-gated ad campaign payloads", () => {
    const valid = adCampaignPayloadSchema.safeParse({
      platform: "meta_ads",
      name: "Monsoon Sampler",
      objective: "Website conversions",
      dailyBudgetInr: 1500,
      durationDays: 14,
      targetLocations: "Bengaluru, Indiranagar & Koramangala",
      targetAudience: "Specialty coffee drinkers aged 24–42",
      headlines: ["Freshly Roasted in Indiranagar"],
      descriptions: ["Try 3 single-origin pours delivered to your door."],
      callToAction: "Shop Now",
      landingPageUrl: "https://saffronandsage.in/sampler",
      abTestHypothesis: "Founder story video vs pour-over close-up",
    })
    expect(valid.success).toBe(true)
  })
})

describe("integration credential encryption and OAuth state", () => {
  it("encrypts and decrypts OAuth tokens with AES-256-GCM and rejects tampering", () => {
    const key = randomBytes(32).toString("base64")
    const ciphertext = encryptToken("ya29.secret-oauth-token", key, 2)
    const decrypted = decryptToken(ciphertext, key)
    expect(decrypted).toEqual({
      plaintext: "ya29.secret-oauth-token",
      keyVersion: 2,
    })

    const tampered = `${ciphertext.slice(0, -4)}AAAA`
    expect(() => decryptToken(tampered, key)).toThrow()
  })

  it("signs and verifies OAuth state with TTL enforcement", () => {
    const secret = "test-hmac-secret-32-bytes-minimum"
    const now = 1_700_000_000_000
    const token = signOAuthState(
      {
        organizationId: "org-1",
        orgSlug: "saffron-and-sage",
        userId: "user-1",
        providerId: "instagram",
        issuedAt: now,
        nonce: "1234567890abcdef",
      },
      secret
    )
    expect(verifyOAuthState(token, secret, now + 60_000)?.providerId).toBe("instagram")
    expect(verifyOAuthState(token, secret, now + 15 * 60_000)).toBeNull()
    expect(verifyOAuthState(token, "wrong-secret", now)).toBeNull()
  })

  it("provides a complete step-by-step setup guide for every registered integration provider", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      const guide = INTEGRATION_GUIDES[provider.id]
      expect(guide, `Missing guide for ${provider.id}`).toBeDefined()
      expect(guide!.steps.length).toBeGreaterThanOrEqual(3)
      expect(guide!.envFields.map((f) => f.key)).toEqual(provider.envVars)
      if (!provider.serverOnly) {
        expect(guide!.directConnect).not.toBeNull()
      }
    }
  })
})
