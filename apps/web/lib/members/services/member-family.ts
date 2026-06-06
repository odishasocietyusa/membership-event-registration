import { prisma } from '@/lib/db/prisma'
import type { FamilyMember } from '@prisma/client'
import type { CreateFamilyMemberInput, UpdateFamilyMemberInput } from '../member-service'
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin'

export async function addFamilyMember(
  primaryMemberId: string,
  data: CreateFamilyMemberInput
): Promise<FamilyMember> {
  const primary = await prisma.member.findUnique({
    where: { id: primaryMemberId, deletedAt: null },
  })
  if (!primary) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  if (data.relation === 'spouse' && data.email) {
    await validateSpouseEmail(data.email, primaryMemberId)
  }

  return prisma.familyMember.create({
    data: {
      primaryMemberId,
      fullName: data.fullName,
      relation: data.relation,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      highSchoolGraduationYear: data.highSchoolGraduationYear,
      email: data.email,
    },
  })
}

export async function listFamilyMembers(
  primaryMemberId: string
): Promise<FamilyMember[]> {
  return prisma.familyMember.findMany({
    where: { primaryMemberId, deletedAt: null },
  })
}

export async function softDeleteFamilyMember(
  id: string,
  requestingMemberId: string
): Promise<void> {
  const familyMember = await prisma.familyMember.findUnique({
    where: { id, deletedAt: null },
  })

  if (!familyMember) {
    throw Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
  }

  if (familyMember.primaryMemberId !== requestingMemberId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  const updateData: Record<string, unknown> = { deletedAt: new Date() }

  // SPEC-19: clear spouse link fields on soft-delete to prevent ghost re-activation
  if (familyMember.relation === 'spouse') {
    updateData.email = null
    updateData.spouseUserId = null
  }

  await prisma.familyMember.update({
    where: { id },
    data: updateData,
  })
}

export async function updateFamilyMember(
  id: string,
  requestingMemberId: string,
  data: UpdateFamilyMemberInput
): Promise<FamilyMember> {
  const familyMember = await prisma.familyMember.findUnique({
    where: { id, deletedAt: null },
  })

  if (!familyMember) {
    throw Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
  }

  if (familyMember.primaryMemberId !== requestingMemberId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  if (
    familyMember.relation === 'spouse' &&
    data.email !== undefined &&
    data.email !== null &&
    data.email !== familyMember.email
  ) {
    await validateSpouseEmail(data.email, familyMember.primaryMemberId)
  }

  const updateData: Record<string, unknown> = {}
  if (data.fullName !== undefined)                 updateData.fullName                 = data.fullName
  if (data.dateOfBirth !== undefined)              updateData.dateOfBirth              = data.dateOfBirth ? new Date(data.dateOfBirth) : null
  if (data.highSchoolGraduationYear !== undefined) updateData.highSchoolGraduationYear = data.highSchoolGraduationYear ?? null
  if (data.email !== undefined)                    updateData.email                    = data.email

  return prisma.familyMember.update({
    where: { id },
    data: updateData,
  })
}

// ── Spouse link management (SPEC-19) ─────────────────────────────────────────

export async function validateSpouseEmail(
  email: string,
  excludingPrimaryMemberId: string
): Promise<void> {
  const existingMember = await prisma.member.findUnique({ where: { email } })
  if (existingMember) {
    throw Object.assign(
      new Error('This email is already registered as a primary member and cannot be linked as a spouse.'),
      { code: 'CONFLICT' }
    )
  }

  const conflictingFm = await prisma.familyMember.findFirst({
    where: {
      email,
      relation: 'spouse',
      deletedAt: null,
      primaryMemberId: { not: excludingPrimaryMemberId },
    },
  })
  if (conflictingFm) {
    throw Object.assign(
      new Error('This email is already linked as a spouse for another member.'),
      { code: 'CONFLICT' }
    )
  }
}

export async function revokeSpouseLink(primaryMemberId: string): Promise<void> {
  const spouseFm = await prisma.familyMember.findFirst({
    where: { primaryMemberId, relation: 'spouse', deletedAt: null },
  })

  if (!spouseFm) return

  if (spouseFm.spouseUserId) {
    try {
      await getSupabaseAdmin().auth.admin.signOut(spouseFm.spouseUserId)
    } catch {
      console.error(`revokeSpouseLink: signOut failed for spouseUserId=${spouseFm.spouseUserId}`)
    }
  }

  await prisma.familyMember.update({
    where: { id: spouseFm.id },
    data: { email: null, spouseUserId: null },
  })
}

export async function changePrimaryEmail(memberId: string, newEmail: string): Promise<void> {
  const member = await prisma.member.findUnique({ where: { id: memberId, deletedAt: null } })
  if (!member) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  if (!member.userId) {
    throw Object.assign(new Error('Member has no linked Supabase account'), { code: 'CONFLICT' })
  }

  const emailConflict = await prisma.member.findUnique({ where: { email: newEmail } })
  if (emailConflict) {
    throw Object.assign(new Error('This email is already registered.'), { code: 'CONFLICT' })
  }

  const familyConflict = await prisma.familyMember.findFirst({
    where: { email: newEmail, relation: 'spouse', deletedAt: null },
  })
  if (familyConflict) {
    throw Object.assign(
      new Error('This email is already linked as a spouse for another member.'),
      { code: 'CONFLICT' }
    )
  }

  const { error: supabaseError } = await getSupabaseAdmin().auth.admin.updateUserById(
    member.userId,
    { email: newEmail }
  )
  if (supabaseError) {
    throw Object.assign(
      new Error(supabaseError.message ?? 'Failed to update email in authentication provider.'),
      { code: 'CONFLICT' }
    )
  }

  await prisma.member.update({ where: { id: memberId }, data: { email: newEmail } })
}
