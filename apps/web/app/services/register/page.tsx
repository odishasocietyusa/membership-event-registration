import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { getProviderByMemberId } from '@/lib/services/service-provider-service'
import RegisterForm from './RegisterForm'

export const dynamic = 'force-dynamic'

export default async function RegisterServicePage() {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result
  if (member.memberStatus !== 'active') redirect('/services')

  const existing = await getProviderByMemberId(member.id)
  if (existing) redirect(`/services/${existing.id}/edit`)

  return (
    <main>
      <h1>Register as a Service Provider</h1>
      <p>Your name ({member.fullName ?? member.email}) will be displayed on your profile.</p>
      <RegisterForm />
    </main>
  )
}
