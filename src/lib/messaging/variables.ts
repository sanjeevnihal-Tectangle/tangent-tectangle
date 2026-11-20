import type { Contact } from "@/lib/domain/messaging"

/** Ordered unique placeholders from body text: {{1}}, {{account}}, … */
export function listTemplatePlaceholders(bodyText: string): string[] {
  const matches = [...bodyText.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)]
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of matches) {
    const key = match[1]!
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function countTemplateVariables(bodyText: string): number {
  return listTemplatePlaceholders(bodyText).length
}

export function resolveTemplateParameters(
  contact: Contact,
  variableMapping: Record<string, string>,
  placeholdersOrCount: string[] | number
): string[] {
  const placeholders =
    typeof placeholdersOrCount === "number"
      ? Array.from({ length: placeholdersOrCount }, (_, i) => String(i + 1))
      : placeholdersOrCount

  return placeholders.map((placeholder, index) => {
    const key =
      variableMapping[placeholder] ??
      variableMapping[String(index + 1)] ??
      variableMapping[`{{${placeholder}}}`] ??
      variableMapping[`{{${index + 1}}}`]

    if (!key) {
      // Default: numeric → name for first var; named placeholders → matching attribute
      if (/^\d+$/.test(placeholder)) {
        return index === 0 ? contact.name || "there" : ""
      }
      if (placeholder === "name") return contact.name || "there"
      if (placeholder === "phone") return contact.phoneE164 ?? ""
      return contact.attributes[placeholder] ?? ""
    }

    if (key === "name") return contact.name || "there"
    if (key === "phone") return contact.phoneE164 ?? ""
    if (key.startsWith("attr:")) return contact.attributes[key.slice(5)] ?? ""
    if (key.startsWith("literal:")) return key.slice(8)
    return contact.attributes[key] ?? key
  })
}

/** Replace {{1}}, {{account}}, … with positional parameter values (SMS/email body render). */
export function applyTemplateVariables(bodyText: string, parameters: string[]): string {
  const placeholders = listTemplatePlaceholders(bodyText)
  let rendered = bodyText
  placeholders.forEach((placeholder, index) => {
    const value = parameters[index] ?? ""
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${placeholder}\\s*\\}\\}`, "g"), value)
  })
  return rendered
}
