"use server"

import { checkEntitlement, DEFAULT_PLANS } from "@/lib/billing/plans"
import { brandProfileSchema, type BrandProfile } from "@/lib/domain/brand"
import { resolveWorkspace } from "@/lib/workspace/server"

export type BrandActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveBrandProfile(workspace: string, input: BrandProfile): Promise<BrandActionResult<BrandProfile[]>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("brand.edit")) {
    return { ok: false, error: "Your role cannot edit brand profiles." }
  }
  const parsed = brandProfileSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message
    return { ok: false, error: "Some fields need attention.", fieldErrors }
  }

  const existing = await repository.listBrandProfiles()
  const isNew = !existing.some((b) => b.id === parsed.data.id)
  if (isNew) {
    const quota = checkEntitlement(DEFAULT_PLANS[context.workspace.planId].entitlements, "brand_profiles", existing.length)
    if (!quota.allowed) {
      return { ok: false, error: `Your plan includes ${quota.limit} brand profile${quota.limit === 1 ? "" : "s"}. Upgrade to add more.` }
    }
  }

  await repository.saveBrandProfile({ ...parsed.data, isDefault: parsed.data.isDefault || existing.length === 0 })
  await repository.recordAudit({
    action: isNew ? "brand_profile.created" : "brand_profile.updated",
    entityType: "brand_profile",
    entityId: parsed.data.id,
    summary: `${isNew ? "Created" : "Updated"} brand profile "${parsed.data.name}"`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: await repository.listBrandProfiles() }
}

export async function deleteBrandProfile(workspace: string, id: string): Promise<BrandActionResult<BrandProfile[]>> {
  const { context, repository } = await resolveWorkspace(workspace)
  if (!context.permissions.includes("brand.edit")) {
    return { ok: false, error: "Your role cannot delete brand profiles." }
  }
  const existing = await repository.listBrandProfiles()
  const target = existing.find((b) => b.id === id)
  if (!target) return { ok: false, error: "Brand profile not found." }
  if (existing.length === 1) return { ok: false, error: "A workspace needs at least one brand profile." }

  await repository.deleteBrandProfile(id)
  await repository.recordAudit({
    action: "brand_profile.deleted",
    entityType: "brand_profile",
    entityId: id,
    summary: `Deleted brand profile "${target.name}"`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, data: await repository.listBrandProfiles() }
}
