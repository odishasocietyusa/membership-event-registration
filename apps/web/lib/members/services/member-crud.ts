import { prisma } from '@/lib/db/prisma'
import type { Member, FamilyMember, PaymentRecord, Message } from '@prisma/client'
import type { AdminUpdateMemberInput, PaginatedResult, MemberExport } from '../member-service'

export async function getMemberById(
  id: string,
  opts?: { includeDeleted?: boolean }
): Promise<Member | null> {
  return prisma.member.findUnique({
    where: {
      id,
      deletedAt: opts?.includeDeleted ? undefined : null,
    },
  })
}

export async function updateMember(
  id: string,
  data: Partial<AdminUpdateMemberInput>
): Promise<Member> {
  const existing = await prisma.member.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  const { joinDate, expiryDate, bio, spouseName, address, ...rest } = data
  const prismaData: Record<string, unknown> = { ...rest }

  if (joinDate !== undefined)   prismaData.joinDate   = joinDate   ? new Date(joinDate)   : null
  if (expiryDate !== undefined) prismaData.expiryDate = expiryDate ? new Date(expiryDate) : null

  if (address !== undefined) {
    prismaData.address = address
    if (data.chapterId === undefined) {
      const lookupKey =
        address.country === 'Canada' ? 'Canada' : (address.state ?? '')
      const chapter = lookupKey
        ? await prisma.chapter.findFirst({ where: { states: { has: lookupKey } } })
        : null
      prismaData.chapterId = chapter?.id ?? null
    }
  }

  if (bio !== undefined || spouseName !== undefined) {
    const existingProfileData =
      (existing.profileData as Record<string, unknown> | null) ?? {}
    const mergedProfileData = { ...existingProfileData }
    if (bio !== undefined)        mergedProfileData.bio        = bio
    if (spouseName !== undefined) mergedProfileData.spouseName = spouseName
    prismaData.profileData = mergedProfileData
  }

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.member.update({ where: { id }, data: prismaData })

    if (spouseName !== undefined) {
      const existingSpouse = await tx.familyMember.findFirst({
        where: { primaryMemberId: id, relation: 'spouse', deletedAt: null },
      })

      if (spouseName === '') {
        if (existingSpouse) {
          await tx.familyMember.update({
            where: { id: existingSpouse.id },
            data:  { deletedAt: new Date() },
          })
        }
      } else if (existingSpouse) {
        await tx.familyMember.update({
          where: { id: existingSpouse.id },
          data:  { fullName: spouseName },
        })
      } else {
        await tx.familyMember.create({
          data: { primaryMemberId: id, fullName: spouseName, relation: 'spouse' },
        })
      }
    }

    return member
  })

  return updated
}

export async function softDeleteMember(id: string): Promise<void> {
  const existing = await prisma.member.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  const now = new Date()

  await prisma.member.update({
    where: { id },
    data: { deletedAt: now },
  })

  await prisma.familyMember.updateMany({
    where: { primaryMemberId: id },
    data: { deletedAt: now },
  })
}

export async function exportMemberData(id: string): Promise<MemberExport> {
  const member = await prisma.member.findUnique({ where: { id } })
  if (!member) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  const familyMembers = await prisma.familyMember.findMany({
    where: { primaryMemberId: id },
  })

  const paymentRecords = await prisma.paymentRecord.findMany({
    where: { memberId: id },
  })

  const [sentMessages, receivedMessages] = await Promise.all([
    prisma.message.findMany({ where: { senderMemberId: id } }),
    prisma.message.findMany({ where: { recipientMemberId: id } }),
  ])

  return {
    exportDate: new Date().toISOString(),
    member,
    familyMembers,
    paymentRecords,
    sentMessages,
    receivedMessages,
  }
}

export async function listMembers(
  page: number,
  limit: number,
  includeDeleted?: boolean,
  search?: string,
  status?: 'active' | 'expired' | 'suspended',
): Promise<PaginatedResult<Member>> {
  const effectiveLimit = Math.min(limit, 100)
  const skip = (page - 1) * effectiveLimit

  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(status ? { memberStatus: status } : {}),
    ...(search ? {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email:    { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.member.findMany({ where, skip, take: effectiveLimit, orderBy: { createdAt: 'desc' } }),
    prisma.member.count({ where }),
  ])

  return { data, total, page, limit: effectiveLimit }
}

export async function linkMemberAccount(
  email: string,
  userId: string
): Promise<Member> {
  const member = await prisma.member.findUnique({ where: { email } })
  if (!member) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  if (member.userId === userId) {
    return member
  }

  if (member.userId !== null) {
    throw Object.assign(new Error('Member already linked to a different account'), { code: 'CONFLICT' })
  }

  return prisma.member.update({
    where: { id: member.id },
    data: { userId },
  })
}
