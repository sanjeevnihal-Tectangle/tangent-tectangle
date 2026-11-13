"use client"

import { ImagePlus, Loader2, Package, Plus, Save, Trash2, X } from "lucide-react"
import Link from "next/link"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { TagInput } from "@/components/forms/tag-input"
import { PageHeader } from "@/components/page/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCan, useWorkspace } from "@/components/workspace/workspace-provider"
import { AssetPicker } from "@/features/assets/asset-picker"
import { deleteProduct, saveProduct } from "@/features/products/actions"
import type { BrandProfile } from "@/lib/domain/brand"
import { emptyProduct, PRODUCT_KINDS, type Product } from "@/lib/domain/product"
import { workspaceHref } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const COMPANY_BRAND = "__company__"

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function FieldError({ errors, path }: { errors: Record<string, string>; path: string }) {
  const message = errors[path]
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null
}

function BrandSwatches({ brand }: { brand: BrandProfile | undefined }) {
  const colors = brand?.colors.length ? brand.colors : [{ hex: "#d4d4d4" }]
  return (
    <span className="flex -space-x-1">
      {colors.slice(0, 3).map((c, i) => (
        <span key={i} className="size-3.5 rounded-full border-2 border-background" style={{ backgroundColor: c.hex }} />
      ))}
    </span>
  )
}

function ProductEditor({
  product,
  brands,
  imageUrls,
  onChange,
  onImageUrl,
  errors,
  disabled,
}: {
  product: Product
  brands: BrandProfile[]
  imageUrls: Record<string, string>
  onChange: (next: Product) => void
  onImageUrl: (id: string, url: string | null) => void
  errors: Record<string, string>
  disabled: boolean
}) {
  const { workspace } = useWorkspace()
  const set = <K extends keyof Product>(key: K, value: Product[K]) => onChange({ ...product, [key]: value })
  const [pickerOpen, setPickerOpen] = useState(false)
  const companyBrand = brands.find((b) => b.isDefault) ?? brands[0]
  const brand = brands.find((b) => b.id === product.brandProfileId)

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input id="product-name" value={product.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name)} />
            <FieldError errors={errors} path="name" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={product.kind} onValueChange={(v) => set("kind", v as Product["kind"])}>
              <SelectTrigger aria-label="Type" className="w-full capitalize">
                <SelectValue>{product.kind}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_KINDS.map((k) => (
                  <SelectItem key={k} value={k} className="capitalize">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-category">Category</Label>
            <Input id="product-category" value={product.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. SaaS, Bakery, Consulting" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-price">Price / offer</Label>
            <Input id="product-price" value={product.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. ₹999/month, Free demo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-url">Link</Label>
            <Input id="product-url" value={product.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" aria-invalid={Boolean(errors.url)} />
            <FieldError errors={errors} path="url" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-description">Description</Label>
          <Textarea id="product-description" rows={3} value={product.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-audience">Who it&apos;s for</Label>
          <Input id="product-audience" value={product.audience} onChange={(e) => set("audience", e.target.value)} placeholder="e.g. Small business owners in India" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="product-active" checked={product.isActive} onCheckedChange={(v) => set("isActive", v)} />
          <Label htmlFor="product-active">Active (agents promote it)</Label>
        </div>
      </Section>

      <Section title="Selling points" description="Agents turn these into headlines, feature callouts and icons.">
        <div className="space-y-1.5">
          <Label htmlFor="product-benefits">Key benefits</Label>
          <TagInput id="product-benefits" value={product.benefits} onChange={(benefits) => set("benefits", benefits)} placeholder="e.g. Saves 10 hours a week" maxItems={8} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-features">Features</Label>
          <TagInput id="product-features" value={product.features} onChange={(features) => set("features", features)} placeholder="e.g. Auto-posting" maxItems={12} />
        </div>
      </Section>

      <Section title="Brand kit" description="The brand kit agents use for this product's creatives, videos and copy.">
        <Select value={product.brandProfileId ?? COMPANY_BRAND} onValueChange={(v) => set("brandProfileId", v === COMPANY_BRAND ? null : v)}>
          <SelectTrigger aria-label="Brand kit" className="w-full sm:w-80">
            <SelectValue>
              <span className="flex items-center gap-2">
                <BrandSwatches brand={brand ?? companyBrand} />
                {brand ? brand.name : `Company brand${companyBrand ? ` (${companyBrand.name})` : ""}`}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMPANY_BRAND}>Company brand{companyBrand ? ` (${companyBrand.name})` : ""}</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Need a separate look for this product?{" "}
          <Link className="underline underline-offset-2" href={workspaceHref(workspace.slug, "brand")}>
            Create a brand kit
          </Link>{" "}
          (colours, logo, fonts, visual style), then pick it here.
        </p>
      </Section>

      <Section title="Product images" description="Photos or screenshots agents can place in designs.">
        <div className="flex flex-wrap gap-2">
          {product.imageAssetIds.map((id) => (
            <div key={id} className="relative">
              {imageUrls[id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img src={imageUrls[id]} alt="" className="size-20 rounded-md border object-cover" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Image</div>
              )}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -top-2 -right-2 size-6 rounded-full"
                aria-label="Remove image"
                onClick={() => set("imageAssetIds", product.imageAssetIds.filter((i) => i !== id))}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="size-20 flex-col gap-1 text-xs" disabled={product.imageAssetIds.length >= 6} onClick={() => setPickerOpen(true)}>
            <ImagePlus /> Add
          </Button>
        </div>
        <AssetPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Choose a product image"
          onSelect={(asset) => {
            if (!product.imageAssetIds.includes(asset.id)) set("imageAssetIds", [...product.imageAssetIds, asset.id])
            onImageUrl(asset.id, asset.url)
          }}
        />
      </Section>
    </fieldset>
  )
}

export function ProductsManager({
  initial,
  brands,
  imageUrls: initialUrls,
}: {
  initial: Product[]
  brands: BrandProfile[]
  imageUrls: Record<string, string>
}) {
  const { workspace } = useWorkspace()
  const canEdit = useCan("business_profile.edit")
  const [products, setProducts] = useState(initial)
  const [draft, setDraft] = useState<Product | null>(initial[0] ?? null)
  const [imageUrls, setImageUrls] = useState(initialUrls)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const saved = products.find((p) => p.id === draft?.id)
  const dirty = draft ? JSON.stringify(draft) !== JSON.stringify(saved) : false
  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved changes?")

  const select = (id: string) => {
    if (!confirmDiscard()) return
    setDraft(products.find((p) => p.id === id) ?? null)
    setErrors({})
  }
  const create = () => {
    if (!confirmDiscard()) return
    setDraft(emptyProduct(crypto.randomUUID()))
    setErrors({})
  }
  const save = () =>
    draft &&
    startTransition(async () => {
      const result = await saveProduct(workspace.slug, draft)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      setErrors({})
      setProducts(result.data)
      setDraft(result.data.find((p) => p.id === draft.id) ?? null)
      toast.success("Saved. Agents will use it for new requests.")
    })
  const remove = () => {
    if (!draft) return
    if (!saved) {
      setDraft(products[0] ?? null)
      return
    }
    if (!window.confirm(`Delete "${draft.name}"?`)) return
    startTransition(async () => {
      const result = await deleteProduct(workspace.slug, draft.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setProducts(result.data)
      setDraft(result.data[0] ?? null)
      toast.success("Deleted.")
    })
  }

  const listed = draft && !saved ? [...products, draft] : products

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Services"
        description="What you sell. Mention a product in the AI Command Centre and agents use its details and its brand kit."
        actions={
          canEdit ? (
            <Button variant="outline" size="sm" onClick={create} disabled={pending}>
              <Plus /> Add product or service
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Products and services" className="space-y-1">
          {listed.length === 0 ? <p className="px-1 text-sm text-muted-foreground">Nothing added yet.</p> : null}
          {listed.map((p) => {
            const brand = brands.find((b) => b.id === p.brandProfileId) ?? brands.find((b) => b.isDefault)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p.id)}
                aria-current={p.id === draft?.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  p.id === draft?.id ? "border-foreground/20 bg-muted" : "border-transparent hover:bg-muted/60"
                )}
              >
                <BrandSwatches brand={brand} />
                <span className="min-w-0 flex-1 truncate text-sm">{(p.id === draft?.id ? draft.name : p.name) || "Untitled"}</span>
                {!p.isActive ? <Badge variant="outline">Paused</Badge> : <span className="text-xs text-muted-foreground capitalize">{p.kind}</span>}
              </button>
            )
          })}
        </nav>

        {draft ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <>
                  <Button size="sm" onClick={save} disabled={pending || (!dirty && Boolean(saved))}>
                    {pending ? <Loader2 className="animate-spin" /> : <Save />} {saved ? "Save changes" : "Add"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
                    <Trash2 /> {saved ? "Delete" : "Discard"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Your role can view products but not edit them.</p>
              )}
              {dirty ? <span className="text-xs text-warning">Unsaved changes</span> : null}
            </div>
            <ProductEditor
              product={draft}
              brands={brands}
              imageUrls={imageUrls}
              onChange={setDraft}
              onImageUrl={(id, url) => url && setImageUrls((u) => ({ ...u, [id]: url }))}
              errors={errors}
              disabled={!canEdit || pending}
            />
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Package className="size-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Add your products and services so agents know exactly what they&apos;re promoting, and which brand kit to use for each.
              </p>
              {canEdit ? (
                <Button size="sm" onClick={create}>
                  <Plus /> Add product or service
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
