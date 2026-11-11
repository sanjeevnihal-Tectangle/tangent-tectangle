export interface AnalyticsEventRecord {
  id: string
  source: string
  entityType: string
  entityId: string | null
  metric: string
  value: number
  occurredOn: string
  granularity: "day" | "week" | "month" | "lifetime"
  isEstimate: boolean
}

export const ANALYTICS_WINDOWS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "180d", label: "Last 180 days", days: 180 },
] as const

export type AnalyticsWindowId = (typeof ANALYTICS_WINDOWS)[number]["id"]

export function isAnalyticsWindow(value: string | null): value is AnalyticsWindowId {
  return ANALYTICS_WINDOWS.some((w) => w.id === value)
}

