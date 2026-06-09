import { redirect }              from 'next/navigation'
import { revalidatePath }        from 'next/cache'
import Link                      from 'next/link'
import { getCurrentMember }      from '@/lib/auth/get-current-member'
import { createSupabaseServer }  from '@/lib/auth/supabase-server'
import { formatDate }            from '@/lib/utils/date'

export const dynamic = 'force-dynamic'

interface Registrant {
  id:          string
  memberId:    string | null
  memberName:  string | null
  memberEmail: string | null
  guestEmail:  string | null
  guestName:   string | null
  guestCount:  number
  status:      string
  createdAt:   string
  cancelledAt: string | null
}

interface PageProps {
  params: Promise<{ sanityId: string }>
}

export default async function AdminEventRegistrantsPage({ params }: PageProps) {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const { sanityId } = await params

  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const res = await fetch(`${baseUrl}/api/events/${sanityId}/registrations`, {
    headers:  { Authorization: `Bearer ${session.access_token}` },
    cache:    'no-store',
  })
  const { registrations = [], total = 0, confirmedCount = 0 } = await res.json().catch(() => ({}))

  async function deregister(formData: FormData) {
    'use server'
    const registrationId = formData.get('registrationId') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return

    const base = process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    await fetch(`${base}/api/admin/events/registrations/${registrationId}`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'cancelled' }),
    })
    revalidatePath(`/admin/events/${sanityId}`)
  }

  return (
    <main>
      <p><Link href="/admin/events">← Back to events</Link></p>
      <h1>Registrants — {confirmedCount} confirmed / {total} total</h1>
      <table border={1} cellPadding={6}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>+Guests</th>
            <th>Status</th>
            <th>Registered</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {(registrations as Registrant[]).map((r) => (
            <tr key={r.id}>
              <td>{r.memberName ?? r.guestName ?? '—'}</td>
              <td>{r.memberEmail ?? r.guestEmail ?? '—'}</td>
              <td>{r.guestCount}</td>
              <td>{r.status}</td>
              <td>{formatDate(r.createdAt, '—')}</td>
              <td>
                {r.status === 'confirmed' && (
                  <form action={deregister}>
                    <input type="hidden" name="registrationId" value={r.id} />
                    <button type="submit">Deregister</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {registrations.length === 0 && (
            <tr>
              <td colSpan={6}>No registrations yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
