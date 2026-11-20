/**
 * India-first E.164 normalisation for messaging audiences.
 * Accepts +91…, 91…, 0XXXXXXXXXX, and bare 10-digit Indian mobiles.
 */

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; error: string }

const E164_RE = /^\+[1-9][0-9]{7,14}$/

export function normalizePhoneE164(
  raw: string,
  defaultCountry: "IN" = "IN"
): PhoneNormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: "Phone number is empty" }

  const digits = trimmed.replace(/[^\d+]/g, "")
  if (digits.startsWith("+") && E164_RE.test(digits)) {
    return { ok: true, e164: digits }
  }

  const onlyDigits = trimmed.replace(/\D/g, "")

  if (defaultCountry === "IN") {
    if (/^91\d{10}$/.test(onlyDigits)) {
      return { ok: true, e164: `+${onlyDigits}` }
    }
    if (/^0\d{10}$/.test(onlyDigits)) {
      return { ok: true, e164: `+91${onlyDigits.slice(1)}` }
    }
    if (/^[6-9]\d{9}$/.test(onlyDigits)) {
      return { ok: true, e164: `+91${onlyDigits}` }
    }
  }

  if (onlyDigits.length >= 8 && onlyDigits.length <= 15) {
    const candidate = `+${onlyDigits}`
    if (E164_RE.test(candidate)) return { ok: true, e164: candidate }
  }

  return {
    ok: false,
    error: "Could not parse as E.164. Use +919876543210 or a 10-digit Indian mobile.",
  }
}

export function parseCsvContacts(csvText: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim()
    })
    rows.push(row)
  }

  return { headers, rows }
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
      continue
    }
    current += ch
  }
  result.push(current)
  return result
}

/** Map common CSV column aliases → contact fields. */
export function mapCsvRow(row: Record<string, string>): {
  name?: string
  phone?: string
  email?: string
  consentWhatsapp?: string
  consentSms?: string
  consentEmail?: string
} {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = row[key]
      if (value) return value
    }
    return undefined
  }

  return {
    name: get("name", "full_name", "fullname", "customer_name", "contact_name"),
    phone: get("phone", "mobile", "phone_number", "whatsapp", "msisdn", "contact"),
    email: get("email", "email_address", "mail"),
    consentWhatsapp: get("consent_whatsapp", "whatsapp_consent", "opt_in", "consent"),
    consentSms: get("consent_sms", "sms_consent"),
    consentEmail: get("consent_email", "email_consent"),
  }
}
