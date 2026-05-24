import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { chapterDisplayName } from '@/lib/constants/address-options'
import ProfileClient from './ProfileClient'
import type { MemberRow } from '@/lib/auth/with-auth'
import type { FamilyMember } from '@prisma/client'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
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

  const [memberRes, familyRes] = await Promise.all([
    fetch(`${baseUrl}/api/members/me`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/api/members/me/family`, { headers, cache: 'no-store' }),
  ])

  if (!memberRes.ok) {
    redirect('/login')
  }

  const { member, isSpouseSession }: { member: MemberRow; isSpouseSession: boolean } = await memberRes.json()
  const familyBody = familyRes.ok ? await familyRes.json() : { familyMembers: [] }
  const familyMembers: FamilyMember[] = familyBody.familyMembers ?? []

  const profileData = (member.profileData as Record<string, unknown> | null) ?? {}
  const bio         = (profileData.bio        as string) ?? ''
  const spouseName  = (profileData.spouseName as string) ?? ''
  const chapterName = chapterDisplayName(member.chapterId)

  return (
    <main>
      <h1>My Profile</h1>
      <ProfileClient
        member={member}
        familyMembers={familyMembers}
        chapterName={chapterName}
        bio={bio}
        spouseName={spouseName}
        isSpouseSession={isSpouseSession}
      />
    </main>
  )
}
