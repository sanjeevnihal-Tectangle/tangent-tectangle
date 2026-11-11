import { NextResponse, type NextRequest } from "next/server"

import { refreshSession } from "@/lib/supabase/proxy"

const DEMO_HOME = "/w/demo/overview"
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"]
const PROTECTED_PREFIXES = ["/w/", "/workspaces", "/reset-password"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Demo mode: no auth backend. Everything routes to the labelled demo workspace.
  if (!supabaseUrl || !supabaseAnonKey || process.env.NEXT_PUBLIC_TANGENT_FORCE_DEMO === "true") {
    if (pathname === "/") {
      return NextResponse.redirect(new URL(DEMO_HOME, request.url))
    }
    return NextResponse.next()
  }

  // Fast-path: skip redundant session refresh on background router prefetch requests
  // when an active Supabase auth cookie is already present.
  const isPrefetch =
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("x-nextjs-prefetch") !== null
  if (isPrefetch && request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) {
    return NextResponse.next()
  }

  const { response, userId } = await refreshSession(request, supabaseUrl, supabaseAnonKey)

  if (!userId && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (userId && (pathname === "/" || AUTH_PAGES.includes(pathname))) {
    return NextResponse.redirect(new URL("/workspaces", request.url))
  }

  if (!userId && pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
