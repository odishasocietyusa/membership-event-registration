import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export const dynamic = 'force-dynamic'

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Payment {
  id: string
  createdAt: string
  paymentType: string
  membershipType: string | null
  amountCents: number
  status: string
  memberId: string | null
  member: { fullName: string | null; email: string } | null
}

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string; type?: string }>
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}` }

  const { user } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())
  if (user?.role !== 'admin') redirect('/dashboard')

  const params  = await searchParams
  const page    = params.page   ?? '1'
  const status  = params.status ?? ''
  const type    = params.type   ?? ''

  const qs = new URLSearchParams({ page, limit: '25' })
  if (status) qs.set('status', status)
  if (type)   qs.set('paymentType', type)

  const { data: payments = [], total = 0 } = await fetch(
    `${baseUrl}/api/payments?${qs}`,
    { headers, cache: 'no-store' }
  ).then(r => r.json())

  const currentPage = parseInt(page, 10)
  const totalPages  = Math.ceil(total / 25)

  function pageUrl(p: number) {
    const next = new URLSearchParams({ page: String(p) })
    if (status) next.set('status', status)
    if (type)   next.set('type', type)
    return `/admin/payments?${next}`
  }

  const totalAmount = (payments as Payment[]).reduce((sum, p) => sum + p.amountCents, 0)

  return (
    <main>
      <h1>Payments ({total})</h1>

      <form method="GET" action="/admin/payments">
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select name="type" defaultValue={type}>
          <option value="">All types</option>
          <option value="membership">Membership</option>
          <option value="upgrade">Upgrade</option>
          <option value="donation">Donation</option>
        </select>
        <button type="submit">Filter</button>
        {(status || type) && <a href="/admin/payments">Clear</a>}
      </form>

      {payments.length > 0 && (
        <p><strong>Total shown:</strong> ${(totalAmount / 100).toFixed(2)}</p>
      )}

      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Member ID</th>
            <th>Email</th>
            <th>Type</th>
            <th>Membership</th>
            <th>Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(payments as Payment[]).map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.createdAt)}</td>
              <td>
                {p.member
                  ? <a href={`/admin/members/${p.memberId}`}>{p.member.fullName ?? p.member.email}</a>
                  : p.memberId ?? 'Anonymous'
                }
              </td>
              <td>{p.memberId ?? '—'}</td>
              <td>{p.member?.email ?? '—'}</td>
              <td>{p.paymentType}</td>
              <td>{p.membershipType ?? '—'}</td>
              <td>${(p.amountCents / 100).toFixed(2)}</td>
              <td>{p.status}</td>
              <td>
                {p.memberId && <a href={`/admin/members/${p.memberId}`}>Member detail</a>}
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={9}>No payments found.</td></tr>
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
