/**
 * Quiet-hours checks for India-first messaging defaults.
 * Times are HH:MM in the org timezone (default Asia/Kolkata).
 */

export interface QuietHoursConfig {
  enabled: boolean
  start: string
  end: string
  timezone: string
}

/** Default: 9pm–8am IST — marketing quiet hours. */
export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: true,
  start: "21:00",
  end: "08:00",
  timezone: "Asia/Kolkata",
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map((p) => Number(p))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

/** Returns local HH:MM in the given IANA timezone. */
export function localTimeHm(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  }
}

/**
 * True when `now` falls inside quiet hours.
 * Supports overnight windows (e.g. 21:00 → 08:00).
 */
export function isWithinQuietHours(now: Date, config: QuietHoursConfig): boolean {
  if (!config.enabled) return false
  const current = parseHm(localTimeHm(now, config.timezone))
  const start = parseHm(config.start)
  const end = parseHm(config.end)
  if (start === end) return false
  if (start < end) {
    return current >= start && current < end
  }
  // Overnight window
  return current >= start || current < end
}
