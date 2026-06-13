import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { getExpertiseProfileByMemberId } from '@/lib/expertise/expertise-profile-service'
import { ELIGIBLE_MEMBERSHIP_TYPES } from '@/lib/expertise/constants'
import RegisterForm from './RegisterForm'

export const dynamic = 'force-dynamic'

export default async function RegisterExpertisePage() {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result

  const isEligible =
    member.memberStatus === 'active' &&
    !!member.membershipType &&
    (ELIGIBLE_MEMBERSHIP_TYPES as readonly string[]).includes(member.membershipType)

  if (!isEligible) {
    return (
      <main>
        <h1>Register Your Expertise</h1>
        <p>
          The Expertise Directory is available to Life, Life Ward, Patron, Benefactor, and
          Honorary members in good standing. Your current membership does not meet this
          requirement.
        </p>
      </main>
    )
  }

  const existing = await getExpertiseProfileByMemberId(member.id)
  if (existing) redirect(`/membership/expertise/${existing.id}/edit`)

  return (
    <main>
      <h1>Register Your Expertise</h1>
      <p>Your name ({member.fullName ?? member.email}) will be displayed in the directory.</p>
      <RegisterForm />
    </main>
  )
}
