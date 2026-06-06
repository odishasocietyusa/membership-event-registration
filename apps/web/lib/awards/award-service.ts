import { prisma } from '@/lib/db/prisma'
import type { Award, AwardCategory, MembershipType } from '@prisma/client'

export interface ListAwardsFilter {
  year?: number
  category?: AwardCategory
}

export interface CreateAwardInput {
  awardName:         string
  year:              number
  category:          AwardCategory
  recipientName?:     string | null
  recipientMemberId?: string | null
  citation?:          string | null
  photoUrl?:          string | null
}

export type UpdateAwardInput = Partial<CreateAwardInput>

export async function listAwards(filter: ListAwardsFilter): Promise<Award[]> {
  const where: any = {}
  if (filter.year !== undefined) {
    where.year = filter.year
  }
  if (filter.category !== undefined) {
    where.category = filter.category
  }

  return prisma.award.findMany({
    where,
    include: {
      recipientMember: true,
      awardNameRef:    true,
    },
  })
}

export async function getAwardById(id: string): Promise<Award | null> {
  return prisma.award.findUnique({
    where: { id },
    include: {
      recipientMember: true,
      awardNameRef:    true,
    },
  })
}

export async function createAward(input: CreateAwardInput): Promise<Award> {
  // Validate awardName exists
  const nameExists = await prisma.awardName.findUnique({
    where: { id: input.awardName },
  })
  if (!nameExists) {
    throw Object.assign(new Error(`Invalid awardName: ${input.awardName}`), {
      code: 'BAD_REQUEST',
    })
  }

  // Validate recipientMemberId exists
  if (input.recipientMemberId) {
    const memberExists = await prisma.member.findUnique({
      where: { id: input.recipientMemberId },
    })
    if (!memberExists) {
      throw Object.assign(
        new Error(`Invalid recipientMemberId: ${input.recipientMemberId}`),
        { code: 'BAD_REQUEST' }
      )
    }
  }

  return prisma.award.create({
    data: input,
  })
}

export async function updateAward(
  id: string,
  input: UpdateAwardInput
): Promise<Award> {
  // Validate existence
  const existing = await prisma.award.findUnique({
    where: { id },
  })
  if (!existing) {
    throw Object.assign(new Error(`Award not found: ${id}`), {
      code: 'NOT_FOUND',
    })
  }

  // Validate awardName exists if provided
  if (input.awardName !== undefined && input.awardName !== null) {
    const nameExists = await prisma.awardName.findUnique({
      where: { id: input.awardName },
    })
    if (!nameExists) {
      throw Object.assign(new Error(`Invalid awardName: ${input.awardName}`), {
        code: 'BAD_REQUEST',
      })
    }
  }

  // Validate recipientMemberId exists if provided
  if (input.recipientMemberId !== undefined && input.recipientMemberId !== null) {
    const memberExists = await prisma.member.findUnique({
      where: { id: input.recipientMemberId },
    })
    if (!memberExists) {
      throw Object.assign(
        new Error(`Invalid recipientMemberId: ${input.recipientMemberId}`),
        { code: 'BAD_REQUEST' }
      )
    }
  }

  return prisma.award.update({
    where: { id },
    data: input,
  })
}

export async function deleteAward(id: string): Promise<void> {
  // Validate existence
  const existing = await prisma.award.findUnique({
    where: { id },
  })
  if (!existing) {
    throw Object.assign(new Error(`Award not found: ${id}`), {
      code: 'NOT_FOUND',
    })
  }

  await prisma.award.delete({
    where: { id },
  })
}
