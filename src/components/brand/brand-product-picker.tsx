"use client"

import { Package, Palette } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { BrandOption, ProductOption } from "@/lib/domain/brand-options"
import { cn } from "@/lib/utils"

const AUTO = "__auto"
const NONE = "__none"

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="flex -space-x-1" aria-hidden>
      {(colors.length ? colors : ["#d4d4d4"]).slice(0, 3).map((hex, i) => (
        <span key={i} className="size-3 rounded-full border border-background" style={{ backgroundColor: hex }} />
      ))}
    </span>
  )
}

/**
 * Picks the brand kit and the product/service a piece of AI work is for.
 * brandId null = automatic (the product's own kit, else the default kit).
 * productId undefined = detect from the request; null = no specific product.
 */
export function BrandProductPicker({
  brands,
  products,
  brandId,
  productId,
  onChange,
  allowDetect = false,
  size = "default",
  className,
  disabled,
}: {
  brands: BrandOption[]
  products: ProductOption[]
  brandId: string | null
  productId: string | null | undefined
  onChange: (value: { brandId: string | null; productId: string | null | undefined }) => void
  /** Offer "detect from the request" for the product (Command Centre). */
  allowDetect?: boolean
  size?: "sm" | "default"
  className?: string
  disabled?: boolean
}) {
  const product = productId ? (products.find((p) => p.id === productId) ?? null) : null
  const fallback = (product?.brandProfileId ? brands.find((b) => b.id === product.brandProfileId) : undefined) ?? brands.find((b) => b.isDefault) ?? brands[0]
  const brand = brandId ? (brands.find((b) => b.id === brandId) ?? null) : null
  const productValue = productId === undefined ? AUTO : productId === null ? NONE : productId

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        value={brandId ?? AUTO}
        onValueChange={(v) => onChange({ brandId: v === AUTO ? null : (v as string), productId })}
        disabled={disabled}
      >
        <SelectTrigger size={size} aria-label="Brand kit" className="max-w-56">
          <SelectValue>
            <Palette className="text-muted-foreground" />
            {brand ? (
              <>
                <Swatches colors={brand.colors} /> {brand.name}
              </>
            ) : (
              <>Brand: auto{fallback ? ` (${fallback.name})` : ""}</>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>
            Automatic{product ? " (product's kit or default)" : " (default kit)"}
          </SelectItem>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              <Swatches colors={b.colors} /> {b.name}
              {b.isDefault ? <span className="text-xs text-muted-foreground">default</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {products.length || allowDetect ? (
        <Select
          value={productValue}
          onValueChange={(v) => onChange({ brandId, productId: v === AUTO ? undefined : v === NONE ? null : (v as string) })}
          disabled={disabled}
        >
          <SelectTrigger size={size} aria-label="Product or service" className="max-w-56">
            <SelectValue>
              <Package className="text-muted-foreground" />
              {product ? product.name : productId === undefined ? "Product: detect" : "No specific product"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowDetect ? <SelectItem value={AUTO}>Detect from my request</SelectItem> : null}
            <SelectItem value={NONE}>No specific product</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
