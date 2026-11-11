import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/** Refreshes the Supabase session cookie and returns the signed-in user id, if any. */
export async function refreshSession(
  request: NextRequest,
  url: string,
  anonKey: string
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id ?? null
  return { response, userId }
}
