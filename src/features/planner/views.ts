export const PLANNER_VIEWS = ["month", "week", "day", "list"] as const
export type PlannerView = (typeof PLANNER_VIEWS)[number]

export function isPlannerView(value: string | null): value is PlannerView {
  return (PLANNER_VIEWS as readonly string[]).includes(value ?? "")
}
