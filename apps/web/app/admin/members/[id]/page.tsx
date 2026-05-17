import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export const dynamic = 'force-dynamic'

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return ''
  return new Date(date).toISOString().slice(0, 10)
}

function memberStatusLabel(status: string | null, membershipType: string | null): string {
  if (status === 'active')    return 'Active'
  if (status === 'expired')   return 'Expired'
  if (status === 'suspended') return 'Suspended'
  if (membershipType)         return 'Pending'
  return 'No membership'
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminMemberDetailPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }

  const { user: adminUser } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())
  if (adminUser?.role !== 'admin') redirect('/dashboard')

  const [memberRes, paymentsRes] = await Promise.all([
    fetch(`${baseUrl}/api/members/${id}`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/api/payments?memberId=${id}&limit=50`, { headers, cache: 'no-store' }),
  ])

  if (!memberRes.ok) redirect('/admin')

  const { member, familyMembers = [] } = await memberRes.json()
  const { data: payments = [] } = await paymentsRes.json()

  // ── Server Actions ────────────────────────────────────────────────────────

  async function setMembershipStatus(formData: FormData) {
    'use server'
    const status = formData.get('status') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    await fetch(`${base}/api/memberships/${id}/status`, { method: 'PUT', headers: h, body: JSON.stringify({ status }) })
    revalidatePath(`/admin/members/${id}`)
  }

  async function approveMembership() {
    'use server'
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    await fetch(`${base}/api/memberships/${id}/approve`, { method: 'POST', headers: h })
    revalidatePath(`/admin/members/${id}`)
  }

  async function changeRole(formData: FormData) {
    'use server'
    const role = formData.get('role') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    await fetch(`${base}/api/members/${id}/role`, { method: 'PUT', headers: h, body: JSON.stringify({ role }) })
    revalidatePath(`/admin/members/${id}`)
  }

  async function updateProfile(formData: FormData) {
    'use server'
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }

    const raw = {
      fullName:       formData.get('fullName') || undefined,
      phone:          formData.get('phone')    || undefined,
      membershipType: formData.get('membershipType') || null,
      memberStatus:   formData.get('memberStatus')   || undefined,
      joinDate:       formData.get('joinDate')        || null,
      expiryDate:     formData.get('expiryDate')      || null,
      address: {
        street:  formData.get('street')  || undefined,
        city:    formData.get('city')    || undefined,
        state:   formData.get('state')   || undefined,
        zip:     formData.get('zip')     || undefined,
        country: formData.get('country') || undefined,
      },
    }

    await fetch(`${base}/api/members/${id}`, {
      method: 'PUT', headers: h, body: JSON.stringify(raw),
    })
    revalidatePath(`/admin/members/${id}`)
  }

  async function issueRefund(formData: FormData) {
    'use server'
    const paymentId        = formData.get('paymentId') as string
    const refundAmountCents = parseInt(formData.get('refundAmountCents') as string, 10)
    const refundReason     = formData.get('refundReason') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    await fetch(`${base}/api/payments/${paymentId}/refund`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ refundAmountCents, refundReason }),
    })
    revalidatePath(`/admin/members/${id}`)
  }

  const isPending = member.memberStatus === null && member.membershipType !== null
  const hasActiveMembership = member.memberStatus === 'active'

  return (
    <main>
      <p><a href="/admin">← Back to members</a></p>
      <h1>{member.fullName ?? member.email}</h1>

      <section>
        <h2>Profile</h2>
        <p><strong>Email:</strong> {member.email}</p>
        <p><strong>Phone:</strong> {member.phone ?? '—'}</p>
        <p><strong>Role:</strong> {member.role}</p>
        <p><strong>Joined:</strong> {formatDate(member.joinDate)}</p>
        {member.address && (
          <p><strong>Address:</strong> {[
            member.address.street, member.address.city,
            member.address.state, member.address.zip, member.address.country
          ].filter(Boolean).join(', ') || '—'}</p>
        )}
      </section>

      <section>
        <h2>Edit Member</h2>
        <form action={updateProfile}>
          <fieldset>
            <legend>Profile</legend>
            <div>
              <label>Full name<br />
                <input name="fullName" defaultValue={member.fullName ?? ''} />
              </label>
            </div>
            <div>
              <label>Phone<br />
                <input name="phone" defaultValue={member.phone ?? ''} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Address</legend>
            <div>
              <label>Street<br />
                <input name="street" defaultValue={member.address?.street ?? ''} />
              </label>
            </div>
            <div>
              <label>City<br />
                <input name="city" defaultValue={member.address?.city ?? ''} />
              </label>
            </div>
            <div>
              <label>State<br />
                <input name="state" defaultValue={member.address?.state ?? ''} />
              </label>
            </div>
            <div>
              <label>ZIP<br />
                <input name="zip" defaultValue={member.address?.zip ?? ''} />
              </label>
            </div>
            <div>
              <label>Country<br />
                <input name="country" defaultValue={member.address?.country ?? ''} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Membership</legend>
            <div>
              <label>Membership type<br />
                <select name="membershipType" defaultValue={member.membershipType ?? ''}>
                  <option value="">— None —</option>
                  <option value="annualStudentNoVote">Annual Student (no vote)</option>
                  <option value="annualSingle">Annual Single</option>
                  <option value="annualFamily">Annual Family</option>
                  <option value="fiveYearFamily">Five-Year Family</option>
                  <option value="life">Life</option>
                  <option value="lifeWard">Life Ward</option>
                  <option value="patron">Patron</option>
                  <option value="benefactor">Benefactor</option>
                  <option value="honoraryNoVote">Honorary (no vote)</option>
                </select>
              </label>
            </div>
            <div>
              <label>Status<br />
                <select name="memberStatus" defaultValue={member.memberStatus ?? ''}>
                  <option value="">— None —</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </div>
            <div>
              <label>Join date<br />
                <input type="date" name="joinDate" defaultValue={toDateInput(member.joinDate)} />
              </label>
            </div>
            <div>
              <label>Expiry date<br />
                <input type="date" name="expiryDate" defaultValue={toDateInput(member.expiryDate)} />
              </label>
            </div>
          </fieldset>

          <button type="submit">Save changes</button>
        </form>
      </section>

      <section>
        <h2>Membership</h2>
        <p><strong>Type:</strong> {member.membershipType ?? '—'}</p>
        <p><strong>Status:</strong> {memberStatusLabel(member.memberStatus, member.membershipType)}</p>
        <p><strong>Expires:</strong> {formatDate(member.expiryDate)}</p>

        {isPending && (
          <form action={approveMembership}>
            <button type="submit">Approve membership</button>
          </form>
        )}

        {member.membershipType && (
          <form action={setMembershipStatus}>
            <select name="status">
              <option value="active">Set Active</option>
              <option value="expired">Set Expired</option>
              <option value="suspended">Set Suspended</option>
            </select>
            <button type="submit">Update status</button>
          </form>
        )}
      </section>

      <section>
        <h2>Role</h2>
        <form action={changeRole}>
          <select name="role" defaultValue={member.role}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit">Change role</button>
        </form>
      </section>

      {familyMembers.length > 0 && (
        <section>
          <h2>Family Members</h2>
          <ul>
            {familyMembers.map((fm: { id: string; fullName: string; relation: string; dateOfBirth: string | null }) => (
              <li key={fm.id}>{fm.fullName} ({fm.relation}){fm.dateOfBirth ? ` — DOB: ${formatDate(fm.dateOfBirth)}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Payment History</h2>
        {payments.length === 0 ? (
          <p>No payments on file.</p>
        ) : (
          <table border={1} cellPadding={4}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Membership</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Refund</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: {
                id: string
                createdAt: string
                paymentType: string
                membershipType: string | null
                amountCents: number
                status: string
                stripePaymentIntentId: string | null
              }) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.paymentType}</td>
                  <td>{p.membershipType ?? '—'}</td>
                  <td>${(p.amountCents / 100).toFixed(2)}</td>
                  <td>{p.status}</td>
                  <td>
                    {p.status === 'completed' && p.stripePaymentIntentId ? (
                      <form action={issueRefund}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input
                          type="number"
                          name="refundAmountCents"
                          defaultValue={p.amountCents}
                          min={1}
                          max={p.amountCents}
                          style={{ width: '80px' }}
                        />
                        <input
                          type="text"
                          name="refundReason"
                          placeholder="Reason"
                          required
                        />
                        <button type="submit">Refund</button>
                      </form>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
