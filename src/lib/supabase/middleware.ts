import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  // If env vars are missing (e.g. Vercel project without env set), don't crash
  if (!url || !key) {
    const isProtected =
      request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/quests") ||
      request.nextUrl.pathname.startsWith("/phase") ||
      request.nextUrl.pathname.startsWith("/journey") ||
      request.nextUrl.pathname.startsWith("/skills") ||
      request.nextUrl.pathname.startsWith("/goals") ||
      request.nextUrl.pathname.startsWith("/analytics") ||
      request.nextUrl.pathname.startsWith("/achievements") ||
      request.nextUrl.pathname.startsWith("/experiments") ||
      request.nextUrl.pathname.startsWith("/coach") ||
      request.nextUrl.pathname.startsWith("/settings")
    if (isProtected) {
      const urlObj = request.nextUrl.clone()
      urlObj.pathname = "/auth/login"
      urlObj.searchParams.set("next", request.nextUrl.pathname)
      return NextResponse.redirect(urlObj)
    }
    return supabaseResponse
  }

  let user: { id: string } | null = null
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const { data } = await supabase.auth.getUser()
    user = data.user as { id: string } | null
  } catch {
    // If Supabase call fails (network, invalid key), don't crash middleware
    return supabaseResponse
  }

  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth")
  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/quests") ||
    request.nextUrl.pathname.startsWith("/phase") ||
    request.nextUrl.pathname.startsWith("/journey") ||
    request.nextUrl.pathname.startsWith("/skills") ||
    request.nextUrl.pathname.startsWith("/goals") ||
    request.nextUrl.pathname.startsWith("/analytics") ||
    request.nextUrl.pathname.startsWith("/achievements") ||
    request.nextUrl.pathname.startsWith("/experiments") ||
    request.nextUrl.pathname.startsWith("/coach") ||
    request.nextUrl.pathname.startsWith("/settings")

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute && request.nextUrl.pathname !== "/auth/callback") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
