import { newId, type DesignDocument, type DesignPage, type Layer } from "@/lib/creative/document"

export function updatePage(document: DesignDocument, pageIndex: number, updater: (page: DesignPage) => DesignPage): DesignDocument {
  return { ...document, pages: document.pages.map((page, i) => (i === pageIndex ? updater(page) : page)) }
}

export function updateLayer(document: DesignDocument, pageIndex: number, layerId: string, patch: Partial<Layer>): DesignDocument {
  return updatePage(document, pageIndex, (page) => ({
    ...page,
    layers: page.layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...patch } as Layer) : layer)),
  }))
}

export function removeLayer(document: DesignDocument, pageIndex: number, layerId: string): DesignDocument {
  return updatePage(document, pageIndex, (page) => ({ ...page, layers: page.layers.filter((l) => l.id !== layerId) }))
}

export function addLayer(document: DesignDocument, pageIndex: number, layer: Layer): DesignDocument {
  return updatePage(document, pageIndex, (page) => ({ ...page, layers: [...page.layers, layer] }))
}

export function duplicateLayer(document: DesignDocument, pageIndex: number, layerId: string): { document: DesignDocument; id: string | null } {
  const page = document.pages[pageIndex]
  const source = page?.layers.find((l) => l.id === layerId)
  if (!source) return { document, id: null }
  const offset = Math.round(Math.min(document.width, document.height) * 0.03)
  const copy = { ...source, id: newId("layer"), name: `${source.name} copy`, x: source.x + offset, y: source.y + offset } as Layer
  return {
    document: updatePage(document, pageIndex, (p) => {
      const index = p.layers.findIndex((l) => l.id === layerId)
      const layers = [...p.layers]
      layers.splice(index + 1, 0, copy)
      return { ...p, layers }
    }),
    id: copy.id,
  }
}

/** direction 1 = bring forward (towards top), -1 = send backward. */
export function moveLayer(document: DesignDocument, pageIndex: number, layerId: string, direction: 1 | -1): DesignDocument {
  return updatePage(document, pageIndex, (page) => {
    const index = page.layers.findIndex((l) => l.id === layerId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= page.layers.length) return page
    const layers = [...page.layers]
    const [layer] = layers.splice(index, 1)
    layers.splice(target, 0, layer!)
    return { ...page, layers }
  })
}

export function duplicatePage(document: DesignDocument, pageIndex: number): DesignDocument {
  const page = document.pages[pageIndex]
  if (!page) return document
  const copy: DesignPage = { ...page, id: newId("page"), layers: page.layers.map((l) => ({ ...l, id: newId("layer") }) as Layer) }
  const pages = [...document.pages]
  pages.splice(pageIndex + 1, 0, copy)
  return { ...document, pages }
}

export function removePage(document: DesignDocument, pageIndex: number): DesignDocument {
  if (document.pages.length <= 1) return document
  return { ...document, pages: document.pages.filter((_, i) => i !== pageIndex) }
}

export function movePage(document: DesignDocument, pageIndex: number, direction: 1 | -1): DesignDocument {
  const target = pageIndex + direction
  if (target < 0 || target >= document.pages.length) return document
  const pages = [...document.pages]
  const [page] = pages.splice(pageIndex, 1)
  pages.splice(target, 0, page!)
  return { ...document, pages }
}

export function defaultText(document: DesignDocument, color: string): Layer {
  const unit = Math.min(document.width, document.height)
  const fontSize = Math.round(unit * 0.06)
  return {
    id: newId("layer"),
    name: "Text",
    type: "text",
    x: unit * 0.1,
    y: document.height / 2 - fontSize,
    width: document.width - unit * 0.2,
    height: Math.round(fontSize * 1.4),
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    text: "Add your text",
    font: "heading",
    fontSize,
    fontWeight: 700,
    color,
    align: "left",
    lineHeight: 1.15,
    letterSpacing: 0,
    uppercase: false,
    background: null,
    padding: 0,
    radius: 0,
  }
}

export function defaultIcon(document: DesignDocument, color: string, chip: string | null): Layer {
  const size = Math.round(Math.min(document.width, document.height) * 0.14)
  return {
    id: newId("layer"),
    name: "Icon",
    type: "icon",
    icon: "sparkles",
    x: (document.width - size) / 2,
    y: (document.height - size) / 2,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    color,
    variant: "outline",
    strokeWidth: 2,
    background: chip,
    padding: chip ? Math.round(size * 0.22) : 0,
    radius: Math.round(size * 0.28),
  }
}

export function defaultPattern(document: DesignDocument, color: string): Layer {
  return {
    id: newId("layer"),
    name: "Pattern",
    type: "pattern",
    pattern: "dots",
    x: 0,
    y: 0,
    width: document.width,
    height: document.height,
    rotation: 0,
    opacity: 0.18,
    locked: false,
    hidden: false,
    color,
    scale: Math.max(1, Math.min(document.width, document.height) / 540),
    radius: 0,
  }
}

export function defaultShape(document: DesignDocument, fill: string, shape: "rect" | "ellipse" | "blob"): Layer {
  const size = Math.min(document.width, document.height) * 0.3
  return {
    id: newId("layer"),
    name: shape === "ellipse" ? "Circle" : shape === "blob" ? "Blob" : "Rectangle",
    type: "shape",
    shape,
    x: (document.width - size) / 2,
    y: (document.height - size) / 2,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill,
    radius: 0,
  }
}

export function defaultImage(document: DesignDocument, assetId: string, aspect: number | null): Layer {
  const maxW = document.width * 0.6
  const maxH = document.height * 0.6
  const ratio = aspect ?? 1
  const width = Math.min(maxW, maxH * ratio)
  const height = width / ratio
  return {
    id: newId("layer"),
    name: "Image",
    type: "image",
    assetId,
    x: (document.width - width) / 2,
    y: (document.height - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fit: "cover",
    radius: 0,
  }
}
