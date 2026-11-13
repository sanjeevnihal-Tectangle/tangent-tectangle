"use server"

import { revalidatePath } from "next/cache"

import { productSchema, type Product } from "@/lib/domain/product"
import { resolveWorkspace } from "@/lib/workspace/server"

export type ProductActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const MAX_PRODUCTS = 100

export async function saveProduct(workspace: string, input: Product): Promise<ProductActionResult<Product[]>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("business_profile.edit")) {
    return { ok: false, error: "Your role cannot edit products and services." }
  }
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message
    return { ok: false, error: "Some fields need attention.", fieldErrors }
  }
  try {
    const existing = await repository.listProducts()
    const isNew = !existing.some((p) => p.id === parsed.data.id)
    if (isNew && existing.length >= MAX_PRODUCTS) return { ok: false, error: `A workspace can have up to ${MAX_PRODUCTS} products and services.` }
    if (existing.some((p) => p.id !== parsed.data.id && p.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return { ok: false, error: "Another product already has this name.", fieldErrors: { name: "Use a unique name" } }
    }
    if (parsed.data.brandProfileId) {
      const brands = await repository.listBrandProfiles()
      if (!brands.some((b) => b.id === parsed.data.brandProfileId)) return { ok: false, error: "That brand kit no longer exists." }
    }
    await repository.saveProduct(parsed.data)
    await repository.recordAudit({
      action: isNew ? "product.created" : "product.updated",
      entityType: "product",
      entityId: parsed.data.id,
      summary: `${isNew ? "Added" : "Updated"} ${parsed.data.kind} "${parsed.data.name}"`,
      actor: { type: "user", id: context.user.id },
    })
    revalidatePath(`/w/${context.workspace.slug}/products`)
    return { ok: true, data: await repository.listProducts() }
  } catch (error) {
    console.error("[tangent] save product failed", error)
    return { ok: false, error: error instanceof Error && error.name === "RepositoryError" ? error.message : "Could not save. Try again." }
  }
}

export async function deleteProduct(workspace: string, id: string): Promise<ProductActionResult<Product[]>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("business_profile.edit")) {
    return { ok: false, error: "Your role cannot delete products and services." }
  }
  const target = (await repository.listProducts()).find((p) => p.id === id)
  if (!target) return { ok: false, error: "Not found." }
  await repository.deleteProduct(id)
  await repository.recordAudit({
    action: "product.deleted",
    entityType: "product",
    entityId: id,
    summary: `Deleted ${target.kind} "${target.name}"`,
    actor: { type: "user", id: context.user.id },
  })
  revalidatePath(`/w/${context.workspace.slug}/products`)
  return { ok: true, data: await repository.listProducts() }
}
