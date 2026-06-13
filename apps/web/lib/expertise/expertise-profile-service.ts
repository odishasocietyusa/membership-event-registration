import { prisma } from '@/lib/db/prisma'
import type { RegisterExpertiseInput, UpdateExpertiseInput } from '@/lib/validation/expertise-profile.schema'

export type ExpertiseProfilePublic = {
  id: string
  memberId: string
  fullName: string
  organization: string | null
  categories: string[]
  blurb: string
  isHidden: boolean
  createdAt: Date
  updatedAt: Date
}

const PAGE_SIZE = 25

const SELECT = {
  id: true,
  memberId: true,
  fullName: true,
  organization: true,
  categories: true,
  blurb: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function listExpertiseProfiles(filters: {
  category?: string
  page: number
  includeHidden?: boolean
}): Promise<{ results: ExpertiseProfilePublic[]; total: number; page: number; pageSize: number }> {
  const { category, page, includeHidden } = filters
  const skip = (page - 1) * PAGE_SIZE

  const where = {
    ...(includeHidden ? {} : { isHidden: false }),
    ...(category ? { categories: { has: category } } : {}),
  }

  const [total, results] = await Promise.all([
    prisma.expertiseProfile.count({ where }),
    prisma.expertiseProfile.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
  ])

  return { results, total, page, pageSize: PAGE_SIZE }
}

export async function getExpertiseProfileById(id: string): Promise<ExpertiseProfilePublic | null> {
  return prisma.expertiseProfile.findUnique({ where: { id }, select: SELECT })
}

export async function getExpertiseProfileByMemberId(memberId: string): Promise<ExpertiseProfilePublic | null> {
  return prisma.expertiseProfile.findUnique({ where: { memberId }, select: SELECT })
}

export async function createExpertiseProfile(
  memberId: string,
  fullName: string,
  data: RegisterExpertiseInput
): Promise<ExpertiseProfilePublic> {
  return prisma.expertiseProfile.create({
    data: {
      memberId,
      fullName,
      organization: data.organization || null,
      categories: data.categories,
      blurb: data.blurb,
    },
    select: SELECT,
  })
}

export async function updateExpertiseProfile(
  id: string,
  data: UpdateExpertiseInput
): Promise<ExpertiseProfilePublic> {
  return prisma.expertiseProfile.update({
    where: { id },
    data: {
      ...(data.organization !== undefined ? { organization: data.organization || null } : {}),
      ...(data.categories !== undefined ? { categories: data.categories } : {}),
      ...(data.blurb !== undefined ? { blurb: data.blurb } : {}),
      ...(data.isHidden !== undefined ? { isHidden: data.isHidden } : {}),
    },
    select: SELECT,
  })
}

export async function deleteExpertiseProfile(id: string): Promise<void> {
  await prisma.expertiseProfile.delete({ where: { id } })
}
