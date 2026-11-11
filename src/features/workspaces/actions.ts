"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { isSupabaseConfigured } from "@/lib/env/public"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface CreateWorkspaceState {
  error: string | null
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Enter a workspace name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/, "Use 3–48 lowercase letters, numbers or hyphens")
    .refine((slug) => slug !== "demo", "This URL is reserved"),
})

export async function createWorkspace(_prev: CreateWorkspaceState, formData: FormData): Promise<CreateWorkspaceState> {
  if (!isSupabaseConfigured()) return { error: "Creating workspaces requires Supabase." }
  const parsed = workspaceSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid workspace details" }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug })
  if (error) {
    return { error: error.code === "23505" ? "That workspace URL is taken. Try another." : "Could not create the workspace." }
  }
  const slug = (data as { slug?: string } | null)?.slug ?? parsed.data.slug
  redirect(`/w/${slug}/onboarding`)
}
