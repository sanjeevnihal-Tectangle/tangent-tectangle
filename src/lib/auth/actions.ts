"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { isSupabaseConfigured, publicEnv } from "@/lib/env/public"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface AuthFormState {
  error: string | null
  message: string | null
}

const NOT_CONFIGURED: AuthFormState = {
  error: "Authentication requires Supabase. Add the Supabase environment variables to enable sign-in.",
  message: null,
}

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
})

/** Only allow same-origin relative redirects. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : ""
  return next.startsWith("/") && !next.startsWith("//") ? next : "/workspaces"
}

function callbackUrl(next: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details", message: null }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: "Incorrect email or password.", message: null }
  redirect(safeNext(formData.get("next")))
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED
  const parsed = credentialsSchema
    .extend({ fullName: z.string().trim().min(2, "Enter your name").max(120) })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), fullName: formData.get("fullName") })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details", message: null }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: callbackUrl("/workspaces"), data: { full_name: parsed.data.fullName } },
  })
  if (error) return { error: error.message, message: null }
  if (data.session) redirect("/workspaces")
  return { error: null, message: "Check your inbox to confirm your email address, then sign in." }
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login")
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNext(formData.get("next"))) },
  })
  if (error || !data.url) redirect("/login?error=oauth")
  redirect(data.url)
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED
  const parsed = z.email("Enter a valid email address").safeParse(formData.get("email"))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid email", message: null }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: callbackUrl("/reset-password") })
  // Same response whether or not the account exists (no account enumeration).
  return { error: null, message: "If an account exists for that email, a reset link is on its way." }
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED
  const password = z.string().min(8, "Use at least 8 characters").safeParse(formData.get("password"))
  if (!password.success) return { error: password.error.issues[0]?.message ?? "Invalid password", message: null }
  if (formData.get("password") !== formData.get("confirm")) return { error: "Passwords do not match.", message: null }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: password.data })
  if (error) return { error: error.message, message: null }
  redirect("/workspaces")
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut()
  }
  redirect("/login")
}
