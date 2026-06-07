import { prisma } from '@/lib/db/prisma'

export type CommentWithAuthor = {
  id: string
  obituarySlug: string
  memberId: string
  body: string
  createdAt: Date
  member: { fullName: string | null; email: string }
}

export async function createComment(
  obituarySlug: string,
  memberId: string,
  body: string
): Promise<CommentWithAuthor> {
  return prisma.obituaryComment.create({
    data: { obituarySlug, memberId, body },
    select: {
      id: true,
      obituarySlug: true,
      memberId: true,
      body: true,
      createdAt: true,
      member: { select: { fullName: true, email: true } },
    },
  })
}

export async function listComments(obituarySlug: string): Promise<CommentWithAuthor[]> {
  return prisma.obituaryComment.findMany({
    where: { obituarySlug },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      obituarySlug: true,
      memberId: true,
      body: true,
      createdAt: true,
      member: { select: { fullName: true, email: true } },
    },
  })
}

// Returns true if found and deleted, false if not found.
export async function deleteComment(commentId: string): Promise<boolean> {
  try {
    await prisma.obituaryComment.delete({ where: { id: commentId } })
    return true
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return false
    throw err
  }
}
