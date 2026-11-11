const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
})

const inrFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

const numberCompact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const numberFull = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

export function formatINR(rupees: number, options?: { compact?: boolean }): string {
  return options?.compact ? inrCompact.format(rupees) : inrFull.format(rupees)
}

export function formatNumber(value: number, options?: { compact?: boolean }): string {
  return options?.compact ? numberCompact.format(value) : numberFull.format(value)
}

export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`
}

/** Relative change between two periods, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

export function minutesAgoLabel(minutes: number): string {
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / (60 * 24))}d ago`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^[\p{L}\p{N}]/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}
