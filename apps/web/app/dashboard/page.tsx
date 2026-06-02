import { redirect } from 'next/navigation'
import { getCurrentMember, type CurrentMemberResult } from '@/lib/auth/get-current-member'
import { getMyMembershipStatus } from '@/lib/memberships/membership-service'
import { getUpgradeOptions } from '@/lib/payments/payment-service'
import SignOutButton from './sign-out-button'
import { chapterDisplayName } from '@/lib/constants/address-options'
import { formatDate } from '@/lib/utils/date'
import { NO_EXPIRY_TYPES } from '@/lib/memberships/constants'
import { UpgradeSection } from '@/app/components/upgrade-section'

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
  const result: CurrentMemberResult | null = await getCurrentMember()
  if (!result) {
    redirect('/login')
  }
  const { member: user, isSpouseSession } = result

  let membership = null
  let upgradeOptions = { cumulativePaidCents: 0, options: [] as Awaited<ReturnType<typeof getUpgradeOptions>>['options'] }
  try {
    ;[membership, upgradeOptions] = await Promise.all([
      getMyMembershipStatus(user.id),
      getUpgradeOptions(user.id),
    ])
  } catch (err) {
    console.error('Failed to load membership status', err)
  }

  const displayName = user.fullName ?? user.email
  const membershipType: string | null = membership?.membershipType ?? null
  const memberStatus: string | null = membership?.memberStatus ?? null
  const joinDate: Date | null = membership?.joinDate ?? null
  const expiryDate: Date | null = membership?.expiryDate ?? null
  const neverExpires = membershipType ? (NO_EXPIRY_TYPES as Set<string>).has(membershipType) : false
  const chapter: string = chapterDisplayName(user.chapterId)

  return (
    <main>
      <h1>Dashboard</h1>

      {isSpouseSession && (
        <p role="status">
          You are accessing {user.fullName ?? user.email}&apos;s profile as their spouse.
        </p>
      )}

      <fieldset>
        <legend>Your Account</legend>
        <p><strong>Name:</strong> {displayName}</p>
        <p><strong>Email:</strong> {user.email}</p>
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
            <p><strong>Member since:</strong> {formatDate(joinDate, '—')}</p>
            {!neverExpires && expiryDate && (
              <p><strong>Valid through:</strong> {formatDate(expiryDate, '—')}</p>
            )}
          </div>
        )}

        {membership && memberStatus === 'expired' && (
          <div>
            <p><strong>Status:</strong> Expired</p>
            <p>Your membership expired on {formatDate(expiryDate, '—')}.</p>
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

      {memberStatus === 'active' && (
        <UpgradeSection
          cumulativePaidCents={upgradeOptions.cumulativePaidCents}
          options={upgradeOptions.options}
        />
      )}

      <section>
        <SignOutButton />
      </section>
    </main>
  )
}
