/**
 * Icons agents and users can place in designs (rendered from lucide-react by
 * name in components/creative/design-icons). Kebab-case names, so the list
 * doubles as the enum the design model chooses from.
 */
export const DESIGN_ICONS = [
  "sparkles", "zap", "rocket", "target", "trending-up", "chart-column", "chart-pie", "bot", "brain", "cpu",
  "cloud", "shield-check", "lock", "clock", "calendar", "bell", "mail", "message-circle", "phone", "users",
  "user-check", "heart", "star", "thumbs-up", "gift", "tag", "percent", "shopping-cart", "shopping-bag", "credit-card",
  "wallet", "truck", "package", "store", "house", "map-pin", "globe", "search", "settings", "wrench",
  "layers", "layout-dashboard", "megaphone", "camera", "image", "video", "palette", "pen-tool", "circle-check", "award",
  "leaf", "coffee", "utensils", "stethoscope", "graduation-cap", "shirt", "washing-machine", "briefcase", "building-2", "lightbulb",
  "handshake", "smile", "workflow", "plug", "infinity", "badge-check", "timer", "headset", "sun", "dumbbell",
  "car", "plane", "music", "baby", "paw-print", "scissors", "hammer", "gem", "crown", "flame",
  "droplet", "recycle",
] as const
export type DesignIcon = (typeof DESIGN_ICONS)[number]

export function isDesignIcon(name: string): name is DesignIcon {
  return (DESIGN_ICONS as readonly string[]).includes(name)
}
