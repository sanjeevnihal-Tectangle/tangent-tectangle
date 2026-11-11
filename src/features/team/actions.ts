"use server"

import { createHash, randomBytes } from "node:crypto"

import { redirect } from "next/navigation"
import { z } from "zod"

import { ROLES } from "@/lib/auth/permissions"
import { checkEntitlement, DEFAULT_PLANS } from "@/lib/billing/plans"
import { isSupabaseConfigured, publicEnv } from "@/lib/env/public"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveWorkspace } from "@/lib/workspace/server"

const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(ROLES).exclude(["owner"]),
})

export type InviteResult = { ok: true; inviteUrl: string } | { ok: false; error: string }

export async function inviteMember(workspace: string, input: { email: string; role: string }): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invitation" }

  const { context, repository } = await resolveWorkspace(workspace)
  if (context.mode === "demo") return { ok: false, error: "Invitations require Supabase. Connect it to invite your team." }
  if (!context.permissions.includes("members.manage")) return { ok: false, error: "Your role cannot invite members." }

  const members = await repository.listMembers()
  const seats = checkEntitlement(DEFAULT_PLANS[context.workspace.planId].entitlements, "team_members", members.length)
  if (!seats.allowed) return { ok: false, error: `Your plan includes ${seats.limit} team members. Upgrade to add more.` }
  if (members.some((m) => m.email.toLowerCase() === parsed.data.email.toLowerCase())) {
    return { ok: false, error: "This person is already a member or has a pending invitation." }
  }

  const token = randomBytes(32).toString("base64url")
  const tokenHash = createHash("sha256").update(token).digest("hex")
  await repository.createInvitation(parsed.data.email, parsed.data.role, tokenHash)
  await repository.recordAudit({
    action: "member.invited",
    entityType: "invitation",
    entityId: null,
    summary: `Invited ${parsed.data.email} as ${parsed.data.role}`,
    actor: { type: "user", id: context.user.id },
  })
  return { ok: true, inviteUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/invite/${token}` }
}

export async function acceptInvitation(token: string): Promise<{ ok: false; error: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Invitations require Supabase." }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token })
  if (error || typeof data !== "string") {
    return { ok: false, error: error?.message ?? "This invitation could not be accepted." }
  }
  redirect(`/w/${data}/overview`)
}
