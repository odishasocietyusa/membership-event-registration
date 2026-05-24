import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { getPublicMembershipTypes } from '@/lib/memberships/membership-service'
import { prisma } from '@/lib/db/prisma'
import { calculateCumulativePaid, calculateUpgradeCost, recordPayment } from '@/lib/payments/payment-service'
import { createCheckoutSession, createUpgradeSession } from '@/lib/payments/stripe'
import { formatDate } from '@/lib/utils/date'
import type { MembershipType } from '@prisma/client'

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

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface MembershipFee {
  id: string
  membershipType: string
  amountDollars: number
  isAdminOnly: boolean
}

export default async function MembershipPage() {
  const result = await getCurrentMember()
  if (!result) redirect('/login')
  const { member: user } = result

  if (!user.address) redirect('/register')
  if (user.memberStatus === 'active') redirect('/dashboard')

  const [allTiers, payments] = await Promise.all([
    getPublicMembershipTypes(),
    prisma.paymentRecord.findMany({
      where: { memberId: user.id },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const tiers = (allTiers as MembershipFee[]).filter(t => !t.isAdminOnly)

  // Calculate cumulative paid via service directly
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

  const membershipPayments = payments.filter(
    p => p.membershipType !== null && p.status === 'completed'
  )

  // ── Server Actions (Bypasses double-hop REST API endpoints) ──────────────────

  async function purchaseTier(formData: FormData) {
    'use server'
    const membershipType = formData.get('membershipType') as string
    const memberResult = await getCurrentMember()
    if (!memberResult) return
    const { member } = memberResult

    const fee = await prisma.membershipFee.findUnique({ where: { membershipType } })
    if (!fee || fee.isAdminOnly) return

    const url = await createCheckoutSession(member.id, member.email, membershipType, fee.amountDollars)
    if (url) redirect(url)
  }

  async function upgradeToTier(formData: FormData) {
    'use server'
    const targetType = formData.get('targetType') as string
    const memberResult = await getCurrentMember()
    if (!memberResult) return
    const { member } = memberResult

    const result = await calculateUpgradeCost(member.id, targetType)
    if (!result.eligible) return

    if (result.autoActivate) {
      await recordPayment({
        memberId:         member.id,
        status:           'completed',
        paymentType:      'upgrade',
        membershipType:   targetType as MembershipType,
        amountCents:      0,
        isAdminInitiated: false,
      })
      redirect('/membership/success')
    }

    const url = await createUpgradeSession(member.id, member.email, result.costCents, targetType)
    if (url) redirect(url)
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
        {user.joinDate   && <p><strong>Member since:</strong> {formatDate(user.joinDate.toISOString(), '—', { year: 'numeric', month: 'short', day: 'numeric' })}</p>}
        {user.expiryDate && <p><strong>Expired on:</strong> {formatDate(user.expiryDate.toISOString(), '—', { year: 'numeric', month: 'short', day: 'numeric' })}</p>}
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
                  <td>{formatDate(p.createdAt.toISOString(), '—', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
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
