export const COPY_PURPOSES = [
  "Organic social post",
  "Paid social ad",
  "Google search ad",
  "YouTube title & description",
  "Promotional offer",
  "Event announcement",
  "Product description",
  "WhatsApp broadcast",
] as const

export type CopyPurpose = (typeof COPY_PURPOSES)[number]
