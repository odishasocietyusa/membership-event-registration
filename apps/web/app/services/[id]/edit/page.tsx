import { redirect, notFound } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { getProviderById } from '@/lib/services/service-provider-service'
import EditForm from './EditForm'

export const dynamic = 'force-dynamic'

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result
  const { id } = await params

  const provider = await getProviderById(id)
  if (!provider) notFound()

  const isOwner = provider.memberId === member.id
  const isAdmin = member.role === 'admin'
  if (!isOwner && !isAdmin) redirect('/services')

  return (
    <main>
      <h1>Edit Service Profile</h1>
      {provider.status === 'pending' && (
        <p>Your profile is pending admin approval and is not yet visible in the directory.</p>
      )}
      {provider.status === 'inactive' && (
        <p>Your profile has been deactivated by an admin and is not visible in the directory.</p>
      )}
      <EditForm provider={provider} />
    </main>
  )
}
