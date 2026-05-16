import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (!isProtected) {
    return NextResponse.next({ request })
  }

  // Supabase stores the session in a cookie named sb-<project-ref>-auth-token.
  // This lightweight check avoids importing @supabase/realtime-js which is
  // incompatible with the Edge Runtime. Real JWT validation happens server-side
  // in each route handler via withAuth.
  const hasSession = request.cookies.getAll().some(
    ({ name }) => name.startsWith('sb-') && name.endsWith('-auth-token')
  )

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth/callback|auth/confirm|auth/reset-password|studio).*)',
  ],
}
