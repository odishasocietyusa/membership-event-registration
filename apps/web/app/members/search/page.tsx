import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import MemberSearchClient from './MemberSearchClient'

export const dynamic = 'force-dynamic'

export default async function MemberSearchPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const res  = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  })
  const { user } = await res.json()

  if (user?.memberStatus !== 'active') {
    return (
      <main>
        <h1>Member Search</h1>
        <p>
          Member search is available to active members only.{' '}
          <a href="/membership">View membership options</a>
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>Member Search</h1>
      <MemberSearchClient />
    </main>
  )
}
