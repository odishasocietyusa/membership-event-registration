import { prisma } from '@/lib/db/prisma'
import type { FamilyMember } from '@prisma/client'
import type { CreateFamilyMemberInput, UpdateFamilyMemberInput } from '../member-service'

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

  await prisma.familyMember.update({
    where: { id },
    data: { deletedAt: new Date() },
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
