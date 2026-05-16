import { prisma } from '@/lib/db/prisma'
import type { Member, FamilyMember, Chapter, PaymentRecord, Message } from '@prisma/client'

// ── Shared result types ───────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface MemberExport {
  exportDate: string
  member: Member
  familyMembers: FamilyMember[]
  paymentRecords: PaymentRecord[]
  sentMessages: Message[]
  receivedMessages: Message[]
}

// ── Input types (mirrors Zod schemas in member.schema.ts) ────────────────────

export interface UpdateMemberInput {
  fullName?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  profileVisibility?: {
    show_phone: boolean
    show_email: boolean
    show_chapter: boolean
  }
  souvenirPreference?: 'electronic' | 'print'
  chapterId?: string | null
}

export interface AdminUpdateMemberInput extends UpdateMemberInput {
  memberStatus?: 'active' | 'expired' | 'suspended'
  role?: 'member' | 'admin'
  membershipType?: string | null
  joinDate?: string | null
  expiryDate?: string | null
}

export interface CreateFamilyMemberInput {
  fullName: string
  relation: 'spouse' | 'child' | 'other'
  dateOfBirth?: string
  highSchoolGraduationYear?: number
}

export interface CreateChapterInput {
  id: string
  displayName: string
  states: string[]
}

// ── Member functions ──────────────────────────────────────────────────────────

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

  const { joinDate, expiryDate, ...rest } = data
  const prismaData: Record<string, unknown> = { ...rest }
  if (joinDate !== undefined)   prismaData.joinDate   = joinDate   ? new Date(joinDate)   : null
  if (expiryDate !== undefined) prismaData.expiryDate = expiryDate ? new Date(expiryDate) : null

  return prisma.member.update({ where: { id }, data: prismaData })
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

  // Idempotent: same userId already set
  if (member.userId === userId) {
    return member
  }

  // Conflict: a different userId is already linked
  if (member.userId !== null) {
    throw Object.assign(new Error('Member already linked to a different account'), { code: 'CONFLICT' })
  }

  return prisma.member.update({
    where: { id: member.id },
    data: { userId },
  })
}

// ── Family member functions ───────────────────────────────────────────────────

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

// ── Chapter functions ─────────────────────────────────────────────────────────

export async function createChapter(data: CreateChapterInput): Promise<Chapter> {
  try {
    return await prisma.chapter.create({ data })
  } catch (err) {
    // Unique constraint violation
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

  // presidentMemberId is intentionally NOT writable via API
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
