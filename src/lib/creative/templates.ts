import type { CreativeObjectiveId } from "@/lib/creative/formats"
import { SPEC_GRAPHIC_DEFAULTS, type DesignSpec } from "@/lib/creative/layout"

export interface CreativeTemplate {
  id: string
  name: string
  description: string
  formatId: string
  objective: CreativeObjectiveId
  /** Palette roles are resolved from the brand at compose time. */
  spec: (businessName: string) => Omit<DesignSpec, "palette" | keyof typeof SPEC_GRAPHIC_DEFAULTS> &
    Partial<typeof SPEC_GRAPHIC_DEFAULTS> & { paletteMode: "light" | "dark" | "accent" }
}

export const CREATIVE_TEMPLATES: CreativeTemplate[] = [
  {
    id: "festive-offer",
    name: "Festive offer",
    description: "Centred offer with badge and CTA",
    formatId: "instagram_post",
    objective: "sales",
    spec: () => ({ layout: "centered_hero", headline: "Celebrate with 20% off", subheadline: "This festive season, on everything you love", callToAction: "Order now", badge: "Festive offer", backgroundStyle: "gradient", imagePrompt: "", slides: [], paletteMode: "dark" }),
  },
  {
    id: "product-spotlight",
    name: "Product spotlight",
    description: "Split layout with product photo",
    formatId: "product_ad",
    objective: "launch",
    spec: () => ({ layout: "split", headline: "Meet our newest favourite", subheadline: "Made fresh, made for you", callToAction: "Shop now", badge: "New", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
  {
    id: "event-story",
    name: "Event announcement",
    description: "Story with bold top headline",
    formatId: "instagram_story",
    objective: "event",
    spec: () => ({ layout: "top_headline", headline: "You're invited this Saturday", subheadline: "Live music, special menu and surprises from 7 PM", callToAction: "Reserve a spot", badge: "Event", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
  {
    id: "quote-card",
    name: "Testimonial quote",
    description: "Minimal serif quote card",
    formatId: "instagram_portrait",
    objective: "engagement",
    spec: (name) => ({ layout: "corner_minimal", headline: "“The best part of our week, every week.”", subheadline: `A happy customer of ${name}`, callToAction: "", badge: "Reviews", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
  {
    id: "tips-carousel",
    name: "Tips carousel",
    description: "Cover + 4 educational slides",
    formatId: "instagram_carousel",
    objective: "engagement",
    spec: () => ({
      layout: "bold_type",
      headline: "4 things to know",
      subheadline: "Save this for later",
      callToAction: "Swipe",
      badge: "",
      backgroundStyle: "solid",
      imagePrompt: "",
      paletteMode: "dark",
      slides: [
        { headline: "Start with the why", body: "Explain the problem your customers feel before you introduce the solution." },
        { headline: "Show, don't tell", body: "A real photo or a short demo beats a paragraph of claims." },
        { headline: "Keep it specific", body: "Numbers, places and names make your message believable." },
        { headline: "End with one action", body: "One clear next step converts better than three options." },
      ],
    }),
  },
  {
    id: "youtube-thumbnail",
    name: "YouTube thumbnail",
    description: "High-contrast bold type",
    formatId: "youtube_thumbnail",
    objective: "awareness",
    spec: () => ({ layout: "bold_type", headline: "Behind the scenes", subheadline: "How we really do it", callToAction: "", badge: "New video", backgroundStyle: "gradient", imagePrompt: "", slides: [], paletteMode: "dark" }),
  },
  {
    id: "facebook-offer-ad",
    name: "Facebook offer ad",
    description: "Feed ad with bottom band",
    formatId: "facebook_ad",
    objective: "leads",
    spec: () => ({ layout: "bottom_band", headline: "Book your free consultation", subheadline: "Limited slots this month", callToAction: "Book now", badge: "Free", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
  {
    id: "linkedin-announcement",
    name: "LinkedIn announcement",
    description: "Professional news post",
    formatId: "linkedin_post",
    objective: "awareness",
    spec: (name) => ({ layout: "top_headline", headline: `${name} is growing`, subheadline: "We're opening our newest location next month", callToAction: "Learn more", badge: "News", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
  {
    id: "website-hero",
    name: "Website hero banner",
    description: "Wide banner with CTA",
    formatId: "website_banner",
    objective: "traffic",
    spec: () => ({ layout: "split", headline: "Fresh this season", subheadline: "", callToAction: "Explore", badge: "", backgroundStyle: "gradient", imagePrompt: "", slides: [], paletteMode: "accent" }),
  },
  {
    id: "display-banner",
    name: "Display banner",
    description: "300×250 medium rectangle",
    formatId: "display_rectangle",
    objective: "traffic",
    spec: () => ({ layout: "centered_hero", headline: "Order online today", subheadline: "Free delivery over ₹499", callToAction: "Order now", badge: "", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "accent" }),
  },
  {
    id: "promo-poster",
    name: "Promotional poster",
    description: "A4 print poster",
    formatId: "poster_a4",
    objective: "event",
    spec: () => ({ layout: "top_headline", headline: "Grand opening weekend", subheadline: "Join us for tastings, offers and live music", callToAction: "This Saturday · 11 AM", badge: "Opening", backgroundStyle: "solid", imagePrompt: "", slides: [], paletteMode: "light" }),
  },
]

/** Picks palette colours from the brand for a template's light/dark/accent mode. */
export function templatePalette(mode: "light" | "dark" | "accent", brandColors: { hex: string; role: string }[]): DesignSpec["palette"] {
  const role = (r: string, fallback: string) => brandColors.find((c) => c.role === r)?.hex ?? fallback
  const primary = role("primary", "#E4572E")
  const light = role("background", "#FAF6EF")
  const dark = role("neutral", "#1C1917")
  switch (mode) {
    case "light":
      return { background: light, text: dark, accent: primary }
    case "dark":
      return { background: dark, text: light, accent: role("accent", primary) }
    case "accent":
      return { background: primary, text: light, accent: dark }
    default: {
      const unreachable: never = mode
      throw new Error(`Unknown palette mode ${String(unreachable)}`)
    }
  }
}

export function templateSpec(template: CreativeTemplate, businessName: string, brandColors: { hex: string; role: string }[]): DesignSpec {
  const { paletteMode, ...spec } = template.spec(businessName)
  return { ...SPEC_GRAPHIC_DEFAULTS, ...spec, palette: templatePalette(paletteMode, brandColors) }
}
