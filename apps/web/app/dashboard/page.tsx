import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import SignOutButton from './sign-out-button'
import { chapterDisplayName } from '@/lib/constants/address-options'

// Membership types whose expiry date is always null (never expire)
const NO_EXPIRY_TYPES = new Set(['life', 'lifeWard', 'honoraryNoVote'])

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function membershipTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    annualStudentNoVote: 'Annual Student',
    annualSingle: 'Annual Single',
    annualFamily: 'Annual Family',
    fiveYearFamily: 'Five-Year Family',
    life: 'Life',
    lifeWard: 'Life (Ward)',
    patron: 'Patron',
    benefactor: 'Benefactor',
    honoraryNoVote: 'Honorary',
  }
  return labels[type] ?? type
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const token = session.access_token
  const headers = { Authorization: `Bearer ${token}` }
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const [userRes, membershipRes] = await Promise.all([
    fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/api/memberships/me`, { headers, cache: 'no-store' }),
  ])

  const { user } = await userRes.json()
  const membershipBody = membershipRes.ok ? await membershipRes.json() : null
  const membership = membershipBody?.membership ?? null

  const displayName = user?.fullName ?? user?.email ?? 'Member'
  const membershipType: string | null = membership?.membershipType ?? null
  const memberStatus: string | null = membership?.memberStatus ?? null
  const joinDate: string | null = membership?.joinDate ?? null
  const expiryDate: string | null = membership?.expiryDate ?? null
  const neverExpires = membershipType ? NO_EXPIRY_TYPES.has(membershipType) : false
  const chapter: string = chapterDisplayName(user?.chapterId)

  return (
    <main>
      <h1>Dashboard</h1>

      <fieldset>
        <legend>Your Account</legend>
        <p><strong>Name:</strong> {displayName}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <p><strong>Chapter:</strong> {chapter}</p>
        <p><a href="/profile">Edit Profile</a></p>
      </fieldset>

      <fieldset>
        <legend>Membership</legend>

        {!membership && (
          <div>
            <p>You do not have an active membership.</p>
            <a href="/register">Register for a membership</a>
          </div>
        )}

        {membership && memberStatus === 'pending' && (
          <div>
            <p><strong>Status:</strong> Pending approval</p>
            <p>Your membership application is under review. You will be notified once it is approved.</p>
          </div>
        )}

        {membership && memberStatus === 'active' && (
          <div>
            <p><strong>Status:</strong> Active</p>
            <p><strong>Type:</strong> {membershipTypeLabel(membershipType!)}</p>
            <p><strong>Member since:</strong> {formatDate(joinDate)}</p>
            <p><strong>Expires:</strong> {neverExpires ? 'Never Expires' : formatDate(expiryDate)}</p>
          </div>
        )}

        {membership && memberStatus === 'expired' && (
          <div>
            <p><strong>Status:</strong> Expired</p>
            <p>Your membership expired on {formatDate(expiryDate)}.</p>
            <a href="/register">Renew your membership</a>
          </div>
        )}

        {membership && memberStatus === 'cancelled' && (
          <div>
            <p><strong>Status:</strong> Cancelled</p>
            <a href="/register">Apply for a new membership</a>
          </div>
        )}
      </fieldset>

      <section>
        <SignOutButton />
      </section>
    </main>
  )
}
