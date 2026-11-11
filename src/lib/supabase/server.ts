import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { publicEnv } from "@/lib/env/public"

/**
 * Supabase client bound to the current user's session (RLS enforced).
 * Only call when `isSupabaseConfigured()` is true.
 */
export async function createSupabaseServerClient() {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured")
  }
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  })
}
