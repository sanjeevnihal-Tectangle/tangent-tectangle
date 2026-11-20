import { describe, expect, it } from "vitest"

import type { Contact } from "@/lib/domain/messaging"
import {
  countTemplateVariables,
  resolveTemplateParameters,
} from "@/lib/messaging/variables"

const contact: Contact = {
  id: "c1",
  phoneE164: "+919876543210",
  email: "",
  name: "Asha",
  source: "csv",
  consentWhatsapp: "opted_in",
  consentWhatsappAt: null,
  consentWhatsappEvidence: null,
  consentSms: "unknown",
  consentEmail: "unknown",
  attributes: { city: "Bengaluru" },
  productInterestIds: [],
  optedOutAt: null,
  blockedAt: null,
  updatedAt: new Date().toISOString(),
}

describe("broadcast variable resolution", () => {
  it("counts template variables", () => {
    expect(countTemplateVariables("Hi {{1}}, offer on {{2}}")).toBe(2)
    expect(countTemplateVariables("No vars")).toBe(0)
  })

  it("resolves mapped contact fields", () => {
    expect(
      resolveTemplateParameters(contact, { "1": "name", "2": "attr:city", "3": "literal:Diwali" }, 3)
    ).toEqual(["Asha", "Bengaluru", "Diwali"])
  })
})
