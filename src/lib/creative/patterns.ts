import type { PatternKind } from "@/lib/creative/document"

/**
 * Seamless SVG patterns in a brand colour, as CSS background properties.
 * Data-URI SVGs render identically in the editor and in html-to-image exports.
 */
function tile(kind: PatternKind, color: string): { svg: string; size: number } {
  const c = color.replace("#", "%23")
  switch (kind) {
    case "dots":
      return { size: 28, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><circle cx='4' cy='4' r='2.6' fill='${c}'/></svg>` }
    case "grid":
      return { size: 40, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M40 0H0V40' fill='none' stroke='${c}' stroke-width='1.5'/></svg>` }
    case "diagonal":
      return { size: 24, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M-6 6L6 -6M0 24L24 0M18 30L30 18' stroke='${c}' stroke-width='2.5'/></svg>` }
    case "waves":
      return { size: 60, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='30'><path d='M0 15 Q15 0 30 15 T60 15' fill='none' stroke='${c}' stroke-width='2.5'/></svg>` }
    case "circles":
      return { size: 64, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='20' fill='none' stroke='${c}' stroke-width='2'/></svg>` }
    case "confetti":
      return {
        size: 80,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect x='8' y='10' width='10' height='4' rx='2' fill='${c}' transform='rotate(30 13 12)'/><circle cx='52' cy='18' r='3' fill='${c}'/><rect x='40' y='50' width='12' height='4' rx='2' fill='${c}' transform='rotate(-40 46 52)'/><circle cx='16' cy='60' r='2.5' fill='${c}'/><path d='M66 60l4 7h-8z' fill='${c}'/></svg>`,
      }
    default: {
      const unreachable: never = kind
      throw new Error(`Unknown pattern ${String(unreachable)}`)
    }
  }
}

export function patternStyle(kind: PatternKind, color: string, scale: number): { backgroundImage: string; backgroundSize: string } {
  const { svg, size } = tile(kind, color)
  const px = Math.max(4, Math.round(size * scale))
  return { backgroundImage: `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/#/g, "%23")}")`, backgroundSize: `${px}px ${kind === "waves" ? px / 2 : px}px` }
}

/** Organic blob outline in a 200×200 viewBox, used by "blob" shapes. */
export const BLOB_PATH =
  "M44.7,-58.6C57.2,-49.8,66,-35.3,70.6,-19.4C75.2,-3.5,75.6,13.8,68.9,27.6C62.2,41.4,48.4,51.7,33.2,59.5C18,67.3,1.4,72.6,-15.6,71.1C-32.6,69.6,-50,61.3,-61.3,47.8C-72.6,34.3,-77.8,15.6,-75.6,-1.8C-73.4,-19.2,-63.8,-35.3,-50.4,-44.3C-37,-53.3,-19.8,-55.2,-2.1,-52.6C15.5,-50,32.2,-67.4,44.7,-58.6Z"
