import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react"

import { DESIGN_FONT_STACKS } from "@/components/creative/design-fonts"
import { DESIGN_ICON_COMPONENTS } from "@/components/creative/design-icons"
import { isDesignIcon } from "@/lib/creative/icons"
import { BLOB_PATH, patternStyle } from "@/lib/creative/patterns"
import type { Background, DesignDocument, DesignPage, Layer } from "@/lib/creative/document"
import { cn } from "@/lib/utils"

export type AssetUrls = Record<string, string>

function backgroundStyle(background: Background, assetUrls: AssetUrls): CSSProperties {
  switch (background.type) {
    case "solid":
      return { backgroundColor: background.color }
    case "gradient":
      return { backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` }
    case "image": {
      const url = assetUrls[background.assetId]
      return url
        ? { backgroundColor: background.fallback, backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: background.fallback }
    }
    default: {
      const unreachable: never = background
      return unreachable
    }
  }
}

function layerBox(layer: Layer): CSSProperties {
  return {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
  }
}

function LayerView({ layer, assetUrls }: { layer: Layer; assetUrls: AssetUrls }) {
  switch (layer.type) {
    case "text":
      return (
        <div
          style={{
            ...layerBox(layer),
            display: "flex",
            alignItems: layer.background ? "center" : "flex-start",
            justifyContent: layer.align === "center" ? "center" : layer.align === "right" ? "flex-end" : "flex-start",
            fontFamily: DESIGN_FONT_STACKS[layer.font],
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight,
            color: layer.color,
            textAlign: layer.align,
            lineHeight: layer.lineHeight,
            letterSpacing: `${layer.letterSpacing}em`,
            textTransform: layer.uppercase ? "uppercase" : "none",
            backgroundColor: layer.background ?? undefined,
            padding: layer.padding,
            borderRadius: layer.radius,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            boxSizing: "border-box",
          }}
        >
          <span style={{ width: "100%" }}>{layer.text}</span>
        </div>
      )
    case "shape":
      if (layer.shape === "blob") {
        return (
          <svg style={layerBox(layer)} viewBox="-100 -100 200 200" preserveAspectRatio="none" aria-hidden>
            <path d={BLOB_PATH} fill={layer.fill} />
          </svg>
        )
      }
      return (
        <div
          style={{
            ...layerBox(layer),
            backgroundColor: layer.fill,
            borderRadius: layer.shape === "ellipse" ? "50%" : layer.radius,
          }}
        />
      )
    case "icon": {
      const Icon = isDesignIcon(layer.icon) ? DESIGN_ICON_COMPONENTS[layer.icon] : DESIGN_ICON_COMPONENTS.sparkles
      const size = Math.max(4, Math.min(layer.width, layer.height) - layer.padding * 2)
      return (
        <div
          style={{
            ...layerBox(layer),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: layer.background ?? undefined,
            borderRadius: layer.radius,
          }}
        >
          <Icon
            width={size}
            height={size}
            color={layer.color}
            strokeWidth={layer.strokeWidth}
            fill={layer.variant === "filled" ? layer.color : layer.variant === "duotone" ? layer.color : "none"}
            fillOpacity={layer.variant === "duotone" ? 0.25 : 1}
          />
        </div>
      )
    }
    case "pattern":
      return <div style={{ ...layerBox(layer), ...patternStyle(layer.pattern, layer.color, layer.scale), borderRadius: layer.radius }} />
    case "image": {
      const url = layer.assetId ? assetUrls[layer.assetId] : undefined
      return (
        <div
          style={{
            ...layerBox(layer),
            borderRadius: layer.radius,
            overflow: "hidden",
            backgroundColor: url ? undefined : "rgba(127,127,127,0.18)",
            backgroundImage: url ? `url("${url}")` : undefined,
            backgroundSize: layer.fit,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        >
          {url ? null : (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontFamily: DESIGN_FONT_STACKS.body, fontSize: Math.max(14, layer.height * 0.06), color: "rgba(127,127,127,0.9)" }}>
              Image
            </div>
          )}
        </div>
      )
    }
    default: {
      const unreachable: never = layer
      return unreachable
    }
  }
}

/** Renders one page in native pixel space. Wrap in a scaled container for display. */
export function DesignPageView({
  document,
  page,
  assetUrls,
  overlay,
  onBackgroundPointerDown,
  exportId,
}: {
  document: DesignDocument
  page: DesignPage
  assetUrls: AssetUrls
  overlay?: ReactNode
  onBackgroundPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
  exportId?: string
}) {
  return (
    <div
      data-design-page=""
      data-export-id={exportId}
      onPointerDown={onBackgroundPointerDown}
      style={{ position: "relative", width: document.width, height: document.height, overflow: "hidden", ...backgroundStyle(page.background, assetUrls) }}
    >
      {page.background.type === "image" && assetUrls[page.background.assetId] ? (
        <div style={{ position: "absolute", inset: 0, backgroundColor: page.background.overlayColor, opacity: page.background.overlayOpacity }} />
      ) : null}
      {page.layers.map((layer) => (layer.hidden ? null : <LayerView key={layer.id} layer={layer} assetUrls={assetUrls} />))}
      {overlay}
    </div>
  )
}

/** Static, scaled preview of a page (cards, pickers, planner). */
export function DesignThumbnail({
  document,
  pageIndex = 0,
  assetUrls,
  width,
  className,
}: {
  document: DesignDocument
  pageIndex?: number
  assetUrls: AssetUrls
  width: number
  className?: string
}) {
  const page = document.pages[pageIndex] ?? document.pages[0]
  if (!page) return null
  const scale = width / document.width
  return (
    <div
      className={cn("relative overflow-hidden rounded-md border bg-muted", className)}
      style={{ width, height: document.height * scale }}
      aria-hidden
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
        <DesignPageView document={document} page={page} assetUrls={assetUrls} />
      </div>
    </div>
  )
}
