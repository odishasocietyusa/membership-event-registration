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
  const baseUrl = forwardedHost ? `https://${forwardedHost}` : origin

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && session) {
      return NextResponse.redirect(`${baseUrl}${await resolvePostLoginPath(session.access_token)}`)
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`)
}

async function resolvePostLoginPath(accessToken: string): Promise<string> {
  try {
    const { data: { user: authUser } } = await getSupabaseAdmin().auth.getUser(accessToken)
    if (!authUser) return '/login'

    const member = await prisma.member.findUnique({ where: { userId: authUser.id } })
    const isRegistered = member?.address != null
    const isActive = member?.memberStatus === 'active'

    if (!isRegistered || !isActive) return '/register'
    return '/dashboard'
  } catch {
    // If profile check fails, fall back to register so user can complete setup
    return '/register'
  }
}
