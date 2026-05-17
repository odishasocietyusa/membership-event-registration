import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/events')

  if (!isProtected) {
    return NextResponse.next({ request })
  }

  // Supabase stores the session in cookies named sb-<project-ref>-auth-token (or
  // chunked as sb-<ref>-auth-token.0, .1, … when the JWT is large). Use includes()
  // so both forms are detected. Real JWT validation happens server-side in each
  // route handler via withAuth; this is only a lightweight redirect gate.
  const hasSession = request.cookies.getAll().some(
    ({ name }) => name.startsWith('sb-') && name.includes('-auth-token')
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
