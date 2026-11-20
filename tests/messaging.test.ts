import { describe, expect, it } from "vitest"

import {
  CHANNEL_PROVIDER,
  contactHasChannelConsent,
  contactReachableOnChannel,
  emptyTemplate,
  formatWhatsappExternalId,
  messageTemplateSchema,
  parseWhatsappExternalId,
  productSchema,
  type Contact,
} from "@/lib/domain/messaging"
import {
  applyTemplateVariables,
  listTemplatePlaceholders,
  resolveTemplateParameters,
} from "@/lib/messaging/variables"
import { mapCsvRow, normalizePhoneE164, parseCsvContacts } from "@/lib/messaging/phone"
import { INTEGRATION_GUIDES } from "@/lib/integrations/guides"
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers"
import { ACTIVE_AGENT_IDS, AGENTS } from "@/lib/ai/agents/definitions"

describe("phone normalisation", () => {
  it("normalises Indian mobiles to E.164", () => {
    expect(normalizePhoneE164("9876543210")).toEqual({ ok: true, e164: "+919876543210" })
    expect(normalizePhoneE164("09876543210")).toEqual({ ok: true, e164: "+919876543210" })
    expect(normalizePhoneE164("919876543210")).toEqual({ ok: true, e164: "+919876543210" })
    expect(normalizePhoneE164("+91 98765 43210")).toEqual({ ok: true, e164: "+919876543210" })
  })

  it("rejects empty and invalid numbers", () => {
    expect(normalizePhoneE164("").ok).toBe(false)
    expect(normalizePhoneE164("12345").ok).toBe(false)
  })

  it("parses CSV contacts with aliases", () => {
    const { rows } = parseCsvContacts("name,mobile,consent_whatsapp\nAsha,9876543210,yes\n")
    expect(rows).toHaveLength(1)
    const mapped = mapCsvRow(rows[0]!)
    expect(mapped.name).toBe("Asha")
    expect(mapped.phone).toBe("9876543210")
    expect(mapped.consentWhatsapp).toBe("yes")
  })
})

describe("messaging domain", () => {
  it("accepts a product and a draft template", () => {
    expect(
      productSchema.safeParse({
        id: "p1",
        name: "Wedding catering",
        description: "",
        sku: null,
        category: null,
        status: "active",
        brandProfileId: null,
        updatedAt: new Date().toISOString(),
      }).success
    ).toBe(true)

    const draft = emptyTemplate("t1")
    draft.name = "festive_offer_v1"
    draft.bodyComponents.bodyText = "Hi {{1}}, offer live"
    draft.bodyComponents.variableExamples = ["Asha"]
    expect(messageTemplateSchema.safeParse(draft).success).toBe(true)
  })

  it("parses WhatsApp external ids", () => {
    expect(formatWhatsappExternalId("waba", "phone")).toBe("waba:phone")
    expect(parseWhatsappExternalId("waba:phone")).toEqual({
      wabaId: "waba",
      phoneNumberId: "phone",
    })
    expect(parseWhatsappExternalId("bad")).toBeNull()
  })
})

describe("whatsapp integration registration", () => {
  it("registers provider and guide", () => {
    const provider = INTEGRATION_PROVIDERS.find((p) => p.id === "whatsapp")
    expect(provider?.category).toBe("messaging")
    expect(provider?.connectorPhase).toBe(4)
    expect(INTEGRATION_GUIDES.whatsapp?.directConnect?.supportsLiveVerification).toBe(true)
  })
})

describe("M4 multi-channel", () => {
  const baseContact: Contact = {
    id: "c1",
    phoneE164: "+919876543210",
    email: "asha@example.com",
    name: "Asha",
    source: "csv",
    consentWhatsapp: "opted_in",
    consentWhatsappAt: null,
    consentWhatsappEvidence: null,
    consentSms: "unknown",
    consentEmail: "opted_in",
    attributes: {},
    productInterestIds: [],
    optedOutAt: null,
    blockedAt: null,
    updatedAt: new Date().toISOString(),
  }

  it("maps channels to providers and consent", () => {
    expect(CHANNEL_PROVIDER.sms).toBe("msg91")
    expect(CHANNEL_PROVIDER.email).toBe("resend")
    expect(contactReachableOnChannel(baseContact, "email")).toBe(true)
    expect(contactHasChannelConsent(baseContact, "sms", "marketing")).toBe(false)
    expect(contactHasChannelConsent(baseContact, "email", "marketing")).toBe(true)
    expect(contactHasChannelConsent(baseContact, "sms", "utility")).toBe(true)
  })

  it("applies template variables for SMS/email bodies", () => {
    expect(applyTemplateVariables("Hi {{1}}, code {{2}}", ["Asha", "42"])).toBe("Hi Asha, code 42")
    expect(listTemplatePlaceholders("Hello {{account}} — {{custom_message}}")).toEqual([
      "account",
      "custom_message",
    ])
    expect(
      resolveTemplateParameters(
        baseContact,
        { account: "literal:Acme", custom_message: "literal:Book now" },
        ["account", "custom_message"]
      )
    ).toEqual(["Acme", "Book now"])
  })

  it("registers MSG91 and Resend providers with guides", () => {
    expect(INTEGRATION_PROVIDERS.find((p) => p.id === "msg91")?.category).toBe("messaging")
    expect(INTEGRATION_PROVIDERS.find((p) => p.id === "resend")?.category).toBe("messaging")
    expect(INTEGRATION_GUIDES.msg91?.directConnect?.supportsLiveVerification).toBe(true)
    expect(INTEGRATION_GUIDES.resend?.directConnect?.supportsLiveVerification).toBe(true)
  })

  it("registers Messaging Specialist agent", () => {
    expect(ACTIVE_AGENT_IDS).toContain("messaging_specialist")
    expect(AGENTS.messaging_specialist.status).toBe("active")
  })
})
