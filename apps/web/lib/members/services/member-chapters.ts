import { prisma } from '@/lib/db/prisma'
import type { Chapter } from '@prisma/client'
import type { CreateChapterInput } from '../member-service'

export async function createChapter(data: CreateChapterInput): Promise<Chapter> {
  try {
    return await prisma.chapter.create({ data })
  } catch (err) {
    const error = err as { code?: string }
    if (error.code === 'P2002') {
      throw Object.assign(new Error('Chapter already exists'), { code: 'CONFLICT' })
    }
    throw err
  }
}

export async function updateChapter(
  id: string,
  data: Partial<Omit<CreateChapterInput, 'id'>>
): Promise<Chapter> {
  const existing = await prisma.chapter.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Chapter not found'), { code: 'NOT_FOUND' })
  }

  return prisma.chapter.update({
    where: { id },
    data: {
      displayName: data.displayName,
      states: data.states,
    },
  })
}

export async function listChapters(): Promise<Chapter[]> {
  return prisma.chapter.findMany({ orderBy: { id: 'asc' } })
}
