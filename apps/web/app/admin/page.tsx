import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export const dynamic = 'force-dynamic'

function memberStatusLabel(status: string | null, membershipType: string | null): string {
  if (status === 'active')    return 'Active'
  if (status === 'expired')   return 'Expired'
  if (status === 'suspended') return 'Suspended'
  if (membershipType)         return 'Pending'
  return 'No membership'
}

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Member {
  id: string
  fullName: string | null
  email: string
  role: string
  membershipType: string | null
  memberStatus: string | null
  joinDate: string | null
}

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}

export default async function AdminMembersPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}` }

  const { user } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())
  if (user?.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const page   = params.page   ?? '1'
  const search = params.search ?? ''
  const status = params.status ?? ''

  const qs = new URLSearchParams({ page, limit: '25' })
  if (search) qs.set('search', search)
  if (status) qs.set('status', status)

  const { data: members = [], total = 0 } = await fetch(
    `${baseUrl}/api/members?${qs}`,
    { headers, cache: 'no-store' }
  ).then(r => r.json())

  const currentPage = parseInt(page, 10)
  const totalPages  = Math.ceil(total / 25)

  function pageUrl(p: number) {
    const next = new URLSearchParams({ page: String(p) })
    if (search) next.set('search', search)
    if (status) next.set('status', status)
    return `/admin?${next}`
  }

  return (
    <main>
      <h1>Members ({total})</h1>

      <form method="GET" action="/admin">
        <input name="search" defaultValue={search} placeholder="Search name or email" />
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit">Filter</button>
        {(search || status) && <a href="/admin">Clear</a>}
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Membership</th>
            <th>Status</th>
            <th>Member Since</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(members as Member[]).map((m) => (
            <tr key={m.id}>
              <td>{m.fullName ?? '—'}</td>
              <td>{m.email}</td>
              <td>{m.role}</td>
              <td>{m.membershipType ?? '—'}</td>
              <td>{memberStatusLabel(m.memberStatus, m.membershipType)}</td>
              <td>{formatDate(m.joinDate)}</td>
              <td><a href={`/admin/members/${m.id}`}>View</a></td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr><td colSpan={7}>No members found.</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div>
          {currentPage > 1 && <a href={pageUrl(currentPage - 1)}>← Prev</a>}
          {' '}Page {currentPage} of {totalPages}{' '}
          {currentPage < totalPages && <a href={pageUrl(currentPage + 1)}>Next →</a>}
        </div>
      )}
    </main>
  )
}
