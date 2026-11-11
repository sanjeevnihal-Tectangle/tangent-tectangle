import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured } from "@/lib/env/public"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Exchanges the PKCE code from email confirmation, password recovery or OAuth for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const nextParam = searchParams.get("next") ?? "/workspaces"
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/workspaces"

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL("/login?error=callback", origin))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", origin))
  }
  return NextResponse.redirect(new URL(next, origin))
}
