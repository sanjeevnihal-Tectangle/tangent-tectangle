import { Bebas_Neue, Fraunces, Poppins } from "next/font/google"

import type { DesignFont } from "@/lib/creative/document"

const fraunces = Fraunces({ variable: "--font-design-serif", subsets: ["latin"], display: "swap" })
const poppins = Poppins({ variable: "--font-design-display", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" })
const bebas = Bebas_Neue({ variable: "--font-design-condensed", subsets: ["latin"], weight: "400", display: "swap" })

/** Class names that define the design font CSS variables (apply once near the root). */
export const designFontVariables = `${fraunces.variable} ${poppins.variable} ${bebas.variable}`

export const DESIGN_FONT_STACKS: Record<DesignFont, string> = {
  heading: "var(--font-space-grotesk), system-ui, sans-serif",
  body: "var(--font-inter), system-ui, sans-serif",
  serif: "var(--font-design-serif), Georgia, serif",
  display: "var(--font-design-display), system-ui, sans-serif",
  condensed: "var(--font-design-condensed), Impact, sans-serif",
}
