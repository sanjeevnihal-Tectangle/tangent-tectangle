export const ROLES = [
  "owner",
  "admin",
  "marketer",
  "designer",
  "analyst",
  "viewer",
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketer",
  designer: "Designer",
  analyst: "Analyst",
  viewer: "Viewer",
}

export const PERMISSIONS = [
  "workspace.manage",
  "billing.manage",
  "members.manage",
  "business_profile.edit",
  "brand.edit",
  "ai.run",
  "content.create",
  "content.approve",
  "content.publish",
  "campaigns.manage",
  "ads.manage",
  "ads.approve_spend",
  "integrations.manage",
  "analytics.view",
  "audit.view",
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Default role → permission grants. Mirrored into `role_permissions` by the
 * database seed so RLS policies and server checks use the same source of truth.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "billing.manage"),
  marketer: [
    "business_profile.edit",
    "brand.edit",
    "ai.run",
    "content.create",
    "content.approve",
    "content.publish",
    "campaigns.manage",
    "ads.manage",
    "analytics.view",
  ],
  designer: ["brand.edit", "ai.run", "content.create", "analytics.view"],
  analyst: ["ai.run", "analytics.view", "audit.view"],
  viewer: ["analytics.view"],
}

export function can(role: Role, permission: Permission): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role].includes(permission)
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
}
