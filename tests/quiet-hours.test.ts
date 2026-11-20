import { describe, expect, it } from "vitest"

import { isWithinQuietHours, localTimeHm } from "@/lib/messaging/quiet-hours"

describe("quiet hours", () => {
  it("detects overnight windows", () => {
    // 22:30 IST inside 21:00–08:00
    const evening = new Date("2026-11-19T17:00:00.000Z") // 22:30 IST approx depends on DST; use fixed zone math via isWithinQuietHours
    expect(
      isWithinQuietHours(evening, {
        enabled: true,
        start: "21:00",
        end: "08:00",
        timezone: "Asia/Kolkata",
      })
    ).toBe(true)

    const midday = new Date("2026-11-19T06:30:00.000Z") // 12:00 IST
    expect(
      isWithinQuietHours(midday, {
        enabled: true,
        start: "21:00",
        end: "08:00",
        timezone: "Asia/Kolkata",
      })
    ).toBe(false)
  })

  it("respects disabled flag", () => {
    expect(
      isWithinQuietHours(new Date(), {
        enabled: false,
        start: "00:00",
        end: "23:59",
        timezone: "Asia/Kolkata",
      })
    ).toBe(false)
  })

  it("formats local time", () => {
    expect(localTimeHm(new Date("2026-11-19T06:30:00.000Z"), "UTC")).toBe("06:30")
  })
})
