import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import type { Member } from '@prisma/client'

export interface CurrentMemberResult {
  member: Member
  isSpouseSession: boolean
}

/**
 * Direct in-memory server helper to retrieve the authenticated member.
 * Safe for Server Components, Server Actions, and Route Handlers.
 * Bypasses internal HTTP fetches and prevents local double-hop network latency.
 *
 * SPEC-19: Returns isSpouseSession=true when the session belongs to a linked spouse.
 */
export async function getCurrentMember(): Promise<CurrentMemberResult | null> {
  const supabase = await createSupabaseServer()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser || !authUser.email) {
    return null
  }

  let member = await prisma.member.findUnique({ where: { userId: authUser.id } })

  if (!member) {
    // Email fallback for pre-created admin records where userId is null
    member = await prisma.member.findUnique({ where: { email: authUser.email } })

    if (member && !member.userId) {
      // Bind Supabase User ID to the pre-created member record
      member = await prisma.member.update({
        where: { id: member.id },
        data: { userId: authUser.id },
      })
    } else if (!member) {
      // SPEC-19 step 2b: check for spouse FamilyMember email match
      const spouseFm = await prisma.familyMember.findFirst({
        where: { email: authUser.email, relation: 'spouse', deletedAt: null },
      })

      if (spouseFm) {
        const primaryMember = await prisma.member.findUnique({
          where: { id: spouseFm.primaryMemberId },
        })

        if (primaryMember && primaryMember.deletedAt === null) {
          let linkValid = spouseFm.spouseUserId !== null

          if (spouseFm.spouseUserId === null) {
            try {
              await prisma.familyMember.update({
                where: { id: spouseFm.id },
                data: { spouseUserId: authUser.id },
              })
              linkValid = true
            } catch (e) {
              if ((e as { code?: string }).code !== 'P2002') throw e
            }
          }

          if (linkValid) {
            return { member: primaryMember, isSpouseSession: true }
          }
        }
      }

      // JIT initialization for new signups (or revoked spouses)
      const meta = authUser.user_metadata ?? {}
      const fullName: string | null =
        meta.full_name ??
        (meta.given_name && meta.family_name ? `${meta.given_name} ${meta.family_name}` : null) ??
        null
      try {
        member = await prisma.member.create({
          data: { email: authUser.email, userId: authUser.id, role: 'member', fullName },
        })
      } catch {
        member = await prisma.member.findUnique({ where: { email: authUser.email } })
      }
    }
  }

  if (!member || member.deletedAt !== null) {
    return null
  }

  return { member, isSpouseSession: false }
}
