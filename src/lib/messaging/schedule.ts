import type { AutomationSchedulePreset } from "@/lib/domain/messaging"

/** Compute next run after `from` for a simple daily/weekly/monthly preset. */
export function computeNextRunAt(input: {
  from: Date
  preset: AutomationSchedulePreset
  timeHm: string
  timeZone: string
  dayOfWeek?: number | null
  dayOfMonth?: number | null
}): Date {
  const [hour, minute] = input.timeHm.split(":").map((p) => Number(p))
  const h = Number.isFinite(hour) ? hour : 10
  const m = Number.isFinite(minute) ? minute : 0

  // Work in approximate local wall time via offset sampling (good enough for M3 schedules).
  const candidate = new Date(input.from.getTime())
  candidate.setUTCSeconds(0, 0)

  const setLocalWall = (date: Date, daysAhead: number) => {
    const probe = new Date(date.getTime() + daysAhead * 86_400_000)
    // Format parts in target zone, then rebuild a UTC instant that maps to that local time.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(probe)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0"
    const y = Number(get("year"))
    const mo = Number(get("month"))
    const d = Number(get("day"))
    // Construct as if local wall clock were UTC then adjust by zone offset at that instant.
    const asUtc = Date.UTC(y, mo - 1, d, h, m, 0, 0)
    const asLocalLabel = new Date(asUtc)
    const again = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(asLocalLabel)
    const gy = Number(again.find((p) => p.type === "year")?.value)
    const gmo = Number(again.find((p) => p.type === "month")?.value)
    const gd = Number(again.find((p) => p.type === "day")?.value)
    const gh = Number(again.find((p) => p.type === "hour")?.value)
    const gm = Number(again.find((p) => p.type === "minute")?.value)
    const intended = Date.UTC(y, mo - 1, d, h, m)
    const actual = Date.UTC(gy, gmo - 1, gd, gh, gm)
    return new Date(intended - (actual - intended))
  }

  const weekdayMap: Record<string, number> = {
    Sun: 7,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  for (let i = 0; i < 62; i++) {
    const next = setLocalWall(candidate, i)
    if (next.getTime() <= input.from.getTime()) continue

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      weekday: "short",
      day: "2-digit",
    }).formatToParts(next)
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "1")
    const dow = weekdayMap[weekday] ?? 1

    if (input.preset === "daily") return next
    if (input.preset === "weekly") {
      const want = input.dayOfWeek ?? 1
      if (dow === want) return next
      continue
    }
    if (input.preset === "monthly") {
      const want = input.dayOfMonth ?? 1
      if (day === want) return next
    }
  }

  // Fallback: +1 day
  return new Date(input.from.getTime() + 86_400_000)
}
