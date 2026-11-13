/** Small, serialisable brand kit / product lists for pickers. */
export interface BrandOption {
  id: string
  name: string
  isDefault: boolean
  colors: string[]
}

export interface ProductOption {
  id: string
  name: string
  brandProfileId: string | null
}

export function brandOptions(brands: { id: string; name: string; isDefault: boolean; colors: { hex: string }[] }[]): BrandOption[] {
  return brands.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, colors: b.colors.map((c) => c.hex) }))
}

export function productOptions(products: { id: string; name: string; brandProfileId: string | null; isActive: boolean }[]): ProductOption[] {
  return products.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, brandProfileId: p.brandProfileId }))
}
