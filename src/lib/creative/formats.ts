export const CREATIVE_PLATFORMS = ["instagram", "facebook", "youtube", "linkedin", "web", "print"] as const
export type CreativePlatform = (typeof CREATIVE_PLATFORMS)[number]

export const PLATFORM_LABELS: Record<CreativePlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  web: "Web & display",
  print: "Print",
}

export type FormatCategory = "social" | "ad" | "video_cover" | "banner" | "print"

export interface CreativeFormat {
  id: string
  label: string
  platform: CreativePlatform
  category: FormatCategory
  width: number
  height: number
  /** Multi-page formats (carousels) allow adding pages. */
  maxPages: number
}

export const CREATIVE_FORMATS: CreativeFormat[] = [
  { id: "instagram_post", label: "Instagram post", platform: "instagram", category: "social", width: 1080, height: 1080, maxPages: 1 },
  { id: "instagram_portrait", label: "Instagram portrait post", platform: "instagram", category: "social", width: 1080, height: 1350, maxPages: 1 },
  { id: "instagram_carousel", label: "Instagram carousel", platform: "instagram", category: "social", width: 1080, height: 1350, maxPages: 10 },
  { id: "instagram_story", label: "Instagram story", platform: "instagram", category: "social", width: 1080, height: 1920, maxPages: 1 },
  { id: "reel_cover", label: "Reel cover", platform: "instagram", category: "video_cover", width: 1080, height: 1920, maxPages: 1 },
  { id: "facebook_post", label: "Facebook post", platform: "facebook", category: "social", width: 1200, height: 1200, maxPages: 1 },
  { id: "facebook_ad", label: "Facebook feed ad", platform: "facebook", category: "ad", width: 1200, height: 628, maxPages: 1 },
  { id: "youtube_thumbnail", label: "YouTube thumbnail", platform: "youtube", category: "video_cover", width: 1280, height: 720, maxPages: 1 },
  { id: "youtube_short_cover", label: "YouTube Shorts cover", platform: "youtube", category: "video_cover", width: 1080, height: 1920, maxPages: 1 },
  { id: "linkedin_post", label: "LinkedIn post", platform: "linkedin", category: "social", width: 1200, height: 1200, maxPages: 1 },
  { id: "linkedin_ad", label: "LinkedIn sponsored creative", platform: "linkedin", category: "ad", width: 1200, height: 627, maxPages: 1 },
  { id: "display_rectangle", label: "Display banner 300×250", platform: "web", category: "banner", width: 600, height: 500, maxPages: 1 },
  { id: "display_leaderboard", label: "Display leaderboard 728×90", platform: "web", category: "banner", width: 1456, height: 180, maxPages: 1 },
  { id: "website_banner", label: "Website hero banner", platform: "web", category: "banner", width: 1920, height: 640, maxPages: 1 },
  { id: "poster_a4", label: "Promotional poster (A4)", platform: "print", category: "print", width: 1240, height: 1754, maxPages: 1 },
  { id: "product_ad", label: "Product advertisement", platform: "instagram", category: "ad", width: 1080, height: 1080, maxPages: 1 },
]

export function getFormat(id: string): CreativeFormat {
  const format = CREATIVE_FORMATS.find((f) => f.id === id)
  if (!format) throw new Error(`Unknown creative format ${id}`)
  return format
}

export function isFormatId(id: string): boolean {
  return CREATIVE_FORMATS.some((f) => f.id === id)
}

export const CREATIVE_OBJECTIVES = [
  { id: "awareness", label: "Brand awareness" },
  { id: "engagement", label: "Engagement" },
  { id: "traffic", label: "Website traffic" },
  { id: "leads", label: "Lead generation" },
  { id: "sales", label: "Sales & offers" },
  { id: "launch", label: "Product launch" },
  { id: "event", label: "Event or festival" },
] as const
export type CreativeObjectiveId = (typeof CREATIVE_OBJECTIVES)[number]["id"]
