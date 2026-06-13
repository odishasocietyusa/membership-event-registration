import { redirect, notFound } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { getExpertiseProfileById } from '@/lib/expertise/expertise-profile-service'
import EditForm from './EditForm'

export const dynamic = 'force-dynamic'

export default async function EditExpertisePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result
  const { id } = await params

  const profile = await getExpertiseProfileById(id)
  if (!profile) notFound()

  const isOwner = profile.memberId === member.id
  const isAdmin = member.role === 'admin'
  if (!isOwner && !isAdmin) redirect('/membership/expertise')

  return (
    <main>
      <h1>Edit Expertise Entry</h1>
      {profile.isHidden && (
        <p>This entry has been hidden by an admin and is not visible in the directory.</p>
      )}
      <EditForm profile={profile} />
    </main>
  )
}
