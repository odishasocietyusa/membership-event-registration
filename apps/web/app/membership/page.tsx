import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { calculateCumulativePaid } from '@/lib/payments/payment-service'

export const dynamic = 'force-dynamic'

const TIER_LABELS: Record<string, string> = {
  annualStudentNoVote: 'Annual Student (no vote)',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  patron:              'Patron',
  benefactor:          'Benefactor',
}

const UPGRADE_TIERS = new Set(['life', 'patron', 'benefactor'])

function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface MembershipFee {
  id: string
  membershipType: string
  amountDollars: number
  isAdminOnly: boolean
}

interface PaymentRecord {
  id: string
  createdAt: string
  paymentType: string
  membershipType: string | null
  amountCents: number
  status: string
}

export default async function MembershipPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }

  const { user } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())

  if (!user?.address) redirect('/register')
  if (user.memberStatus === 'active') redirect('/dashboard')

  const [typesRes, paymentsRes] = await Promise.all([
    fetch(`${baseUrl}/api/memberships/types`, { cache: 'no-store' }),
    fetch(`${baseUrl}/api/payments/me`, { headers, cache: 'no-store' }),
  ])

  const { types: allTiers = [] }: { types: MembershipFee[] } = await typesRes.json()
  const { data: payments = [] }: { data: PaymentRecord[] } = await paymentsRes.json()

  const tiers = (allTiers as MembershipFee[]).filter(t => !t.isAdminOnly)

  // Calculate cumulative paid (only isUpgradePath tiers count) via service directly
  const cumulativePaidCents = await calculateCumulativePaid(user.id)

  const lifeTier       = tiers.find(t => t.membershipType === 'life')
  const patronTier     = tiers.find(t => t.membershipType === 'patron')
  const benefactorTier = tiers.find(t => t.membershipType === 'benefactor')

  const upgradeAmounts: Record<string, number> = {
    life:       lifeTier       ? Math.max(0, lifeTier.amountDollars       * 100 - cumulativePaidCents) : 0,
    patron:     patronTier     ? Math.max(0, patronTier.amountDollars     * 100 - cumulativePaidCents) : 0,
    benefactor: benefactorTier ? Math.max(0, benefactorTier.amountDollars * 100 - cumulativePaidCents) : 0,
  }

  const lifeNudgeCents = upgradeAmounts.life

  const membershipPayments = (payments as PaymentRecord[]).filter(
    p => p.membershipType !== null && p.status === 'completed'
  )

  // ── Server Actions ──────────────────────────────────────────────────────────

  async function purchaseTier(formData: FormData) {
    'use server'
    const membershipType = formData.get('membershipType') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    const { url } = await fetch(`${base}/api/payments/checkout-session`, {
      method: 'POST', headers: h, body: JSON.stringify({ membershipType }),
    }).then(r => r.json())
    if (url) redirect(url)
  }

  async function upgradeToTier(formData: FormData) {
    'use server'
    const targetType = formData.get('targetType') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    const body = await fetch(`${base}/api/payments/upgrade-session`, {
      method: 'POST', headers: h, body: JSON.stringify({ targetType }),
    }).then(r => r.json())
    if (body.activated) redirect('/membership/success')
    if (body.url) redirect(body.url)
  }

  return (
    <main>
      <h1>Membership</h1>

      <fieldset>
        <legend>Your Details</legend>
        <p><strong>Member ID:</strong> {user.id}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Status:</strong> {user.memberStatus ?? 'No active membership'}</p>
        {user.membershipType && (
          <p><strong>Last membership tier:</strong> {TIER_LABELS[user.membershipType] ?? user.membershipType}</p>
        )}
        {user.joinDate   && <p><strong>Member since:</strong> {formatDate(user.joinDate)}</p>}
        {user.expiryDate && <p><strong>Expired on:</strong> {formatDate(user.expiryDate)}</p>}
      </fieldset>

      {membershipPayments.length > 0 && (
        <fieldset>
          <legend>Payment History</legend>
          <table border={1} cellPadding={4}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Tier</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {membershipPayments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.createdAt)}</td>
                  <td>{p.paymentType}</td>
                  <td>{p.membershipType ? (TIER_LABELS[p.membershipType] ?? p.membershipType) : '—'}</td>
                  <td>{formatDollars(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      )}

      {user.memberStatus === 'suspended' ? (
        <fieldset>
          <legend>Account Status</legend>
          <p>
            Your account is in suspended status. Please send an email to{' '}
            <a href="mailto:OSAEC@odishasociety.org">OSAEC@odishasociety.org</a>{' '}
            to discuss the matter with the Executives.
          </p>
        </fieldset>
      ) : (
        <fieldset>
          <legend>Choose a Membership</legend>
          <table border={1} cellPadding={4}>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Price</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => {
                const isUpgradeTier  = UPGRADE_TIERS.has(tier.membershipType)
                const fullPriceCents = tier.amountDollars * 100
                const upgradeCents   = upgradeAmounts[tier.membershipType] ?? fullPriceCents
                const hasCredit      = isUpgradeTier && cumulativePaidCents > 0
                const isFree         = isUpgradeTier && upgradeCents === 0
                const displayCents   = hasCredit ? upgradeCents : fullPriceCents

                return (
                  <tr key={tier.id}>
                    <td>{TIER_LABELS[tier.membershipType] ?? tier.membershipType}</td>
                    <td>
                      {hasCredit ? (
                        <>
                          {formatDollars(upgradeCents)}
                          <br />
                          <small>(upgrade price — {formatDollars(cumulativePaidCents)} credit from prior payments)</small>
                        </>
                      ) : (
                        formatDollars(fullPriceCents)
                      )}
                    </td>
                    <td>
                      {!isUpgradeTier && lifeNudgeCents > 0 && (
                        <small>
                          You have {formatDollars(lifeNudgeCents)} left to become a Life Member. Please consider upgrading.
                        </small>
                      )}
                      {!isUpgradeTier && lifeNudgeCents === 0 && lifeTier && (
                        <small>
                          Your prior payments cover the full Life membership fee — you can upgrade to Life at no extra cost.
                        </small>
                      )}
                      {isFree && (
                        <small>Your prior payments cover the full fee — activation is free.</small>
                      )}
                    </td>
                    <td>
                      {isUpgradeTier ? (
                        <form action={upgradeToTier}>
                          <input type="hidden" name="targetType" value={tier.membershipType} />
                          <button type="submit">
                            {isFree ? 'Activate (free)' : `Upgrade — ${formatDollars(displayCents)}`}
                          </button>
                        </form>
                      ) : (
                        <form action={purchaseTier}>
                          <input type="hidden" name="membershipType" value={tier.membershipType} />
                          <button type="submit">Purchase — {formatDollars(displayCents)}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </fieldset>
      )}
    </main>
  )
}
