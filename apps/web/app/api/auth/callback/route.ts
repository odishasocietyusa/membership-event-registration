import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin'
import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isLocal = forwardedHost?.includes('localhost') || origin.includes('localhost') || origin.includes('127.0.0.1')
  const protocol = forwardedProto || (isLocal ? 'http' : 'https')
  const baseUrl = forwardedHost ? `${protocol}://${forwardedHost}` : origin

  if (code) {
    const cookieStore = await cookies()
    const pendingCookies: { name: string; value: string; options: CookieOptions }[] = []
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            pendingCookies.push(...cookiesToSet)
          },
        },
      }
    )

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && session) {
      // Allow an explicit next param for flows like password recovery.
      // Guard against open-redirect: only allow same-origin relative paths.
      const next = searchParams.get('next')
      const redirectPath =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : await resolvePostLoginPath(session.access_token)
      const response = NextResponse.redirect(`${baseUrl}${redirectPath}`)
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
      return response
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`)
}

async function resolvePostLoginPath(accessToken: string): Promise<string> {
  try {
    const { data: { user: authUser } } = await getSupabaseAdmin().auth.getUser(accessToken)
    if (!authUser || !authUser.email) return '/login'

    const member = await prisma.member.findUnique({ where: { userId: authUser.id } })

    // SPEC-19: if no registered member found, check for spouse FamilyMember match
    // before defaulting to /register. spouseUserId write happens in withAuth / getCurrentMember.
    if (!member || !member.address) {
      const spouseFm = await prisma.familyMember.findFirst({
        where: { email: authUser.email, relation: 'spouse', deletedAt: null },
      })
      if (spouseFm) return '/dashboard'
    }

    const isRegistered = member?.address != null

    // Send unregistered users to complete their profile.
    // Registered users go to dashboard regardless of membership status —
    // the dashboard shows pending/active state appropriately.
    if (!isRegistered) return '/register'
    return '/dashboard'
  } catch {
    // If profile check fails, fall back to register so user can complete setup
    return '/register'
  }
}
