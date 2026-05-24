import { prisma } from '@/lib/db/prisma'
import type { Member, MembershipFee, PaymentRecord, MembershipType, MemberStatus } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MembershipStatusView {
  memberId:       string
  membershipType: MembershipType | null
  memberStatus:   MemberStatus | null
  joinDate:       Date | null
  expiryDate:     Date | null
}

export interface MembershipListItem extends MembershipStatusView {
  email:    string
  fullName: string | null
}

export interface PaginatedMembershipList {
  data:  MembershipListItem[]
  total: number
  page:  number
  limit: number
}

import { NO_EXPIRY_TYPES } from './constants'
export { NO_EXPIRY_TYPES } from './constants'

// Days until expiry for each type (types not listed here are non-expiring)
export const EXPIRY_DAYS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 365,
  annualSingle:        365,
  annualFamily:        365,
  fiveYearFamily:      365 * 5,
  patron:              365,
  benefactor:          365,
}

function serviceError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

function toStatusView(m: Member): MembershipStatusView {
  return {
    memberId:       m.id,
    membershipType: m.membershipType,
    memberStatus:   m.memberStatus,
    joinDate:       m.joinDate,
    expiryDate:     m.expiryDate,
  }
}

function computeExpiry(type: MembershipType, from: Date): Date | null {
  if (NO_EXPIRY_TYPES.has(type)) return null
  const days = EXPIRY_DAYS[type]
  if (!days) return null
  const expiry = new Date(from)
  expiry.setDate(expiry.getDate() + days)
  return expiry
}

// ── Public queries ────────────────────────────────────────────────────────────

export async function getPublicMembershipTypes(): Promise<MembershipFee[]> {
  return prisma.membershipFee.findMany({
    where: { isAdminOnly: false },
    orderBy: { amountDollars: 'asc' },
  })
}

export async function getAllMembershipTypes(): Promise<MembershipFee[]> {
  return prisma.membershipFee.findMany({
    orderBy: { amountDollars: 'asc' },
  })
}

// ── Member self-service ───────────────────────────────────────────────────────

export async function applyForMembership(
  memberId: string,
  membershipType: MembershipType,
): Promise<Member> {
  const fee = await prisma.membershipFee.findUnique({ where: { membershipType } })
  if (!fee) throw serviceError('NOT_FOUND', `No fee found for type: ${membershipType}`)
  if (fee.isAdminOnly) throw serviceError('FORBIDDEN', 'This membership type requires admin assignment')

  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  if (member.memberStatus === 'active') throw serviceError('CONFLICT', 'Member already has an active membership')
  if (member.membershipType !== null && member.memberStatus === null) {
    throw serviceError('CONFLICT', 'Member already has a pending membership application')
  }

  return prisma.member.update({
    where: { id: memberId },
    data: { membershipType, memberStatus: null },
  })
}

export async function cancelMembership(memberId: string): Promise<Member> {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  if (member.membershipType === null && member.memberStatus === null) {
    throw serviceError('CONFLICT', 'No membership to cancel')
  }

  return prisma.member.update({
    where: { id: memberId },
    data: { membershipType: null, memberStatus: null, expiryDate: null, joinDate: null },
  })
}

export async function getMyMembershipStatus(memberId: string): Promise<MembershipStatusView> {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  return toStatusView(member)
}

export async function getMembershipHistory(memberId: string): Promise<PaymentRecord[]> {
  return prisma.paymentRecord.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Admin operations ──────────────────────────────────────────────────────────

export async function listAllMemberships(
  page: number,
  limit: number,
  filters?: { memberStatus?: MemberStatus; membershipType?: MembershipType },
): Promise<PaginatedMembershipList> {
  const safeLimit = Math.min(limit, 100)
  const skip = (page - 1) * safeLimit

  const where: Record<string, unknown> = { deletedAt: null }
  if (filters?.memberStatus !== undefined) where.memberStatus = filters.memberStatus
  if (filters?.membershipType !== undefined) where.membershipType = filters.membershipType

  const [rows, total] = await Promise.all([
    prisma.member.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        membershipType: true,
        memberStatus: true,
        joinDate: true,
        expiryDate: true,
      },
    }),
    prisma.member.count({ where }),
  ])

  const data: MembershipListItem[] = rows.map((r) => ({
    memberId:       r.id,
    email:          r.email,
    fullName:       r.fullName,
    membershipType: r.membershipType,
    memberStatus:   r.memberStatus,
    joinDate:       r.joinDate,
    expiryDate:     r.expiryDate,
  }))

  return { data, total, page, limit: safeLimit }
}

export async function getMembershipById(memberId: string): Promise<MembershipStatusView> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
  })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  return toStatusView(member)
}

export async function approveMembership(
  memberId: string,
  adminId: string,
  note?: string,
): Promise<Member> {
  const member = await prisma.member.findFirst({ where: { id: memberId, deletedAt: null } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  if (member.membershipType === null) throw serviceError('CONFLICT', 'No pending membership application')
  if (member.memberStatus === 'active') throw serviceError('CONFLICT', 'Membership is already active')

  const now = new Date()
  const expiryDate = computeExpiry(member.membershipType, now)

  console.log(`[membership] admin ${adminId} approved membership for member ${memberId}${note ? `: ${note}` : ''}`)

  return prisma.member.update({
    where: { id: memberId },
    data: { memberStatus: 'active', joinDate: now, expiryDate },
  })
}

export async function rejectMembership(
  memberId: string,
  adminId: string,
  reason: string,
): Promise<Member> {
  const member = await prisma.member.findFirst({ where: { id: memberId, deletedAt: null } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  if (member.membershipType === null) throw serviceError('CONFLICT', 'No pending membership application')

  console.log(`[membership] admin ${adminId} rejected membership for member ${memberId}: ${reason}`)

  return prisma.member.update({
    where: { id: memberId },
    data: { membershipType: null, memberStatus: null },
  })
}

export async function overrideMembershipStatus(
  memberId: string,
  status: MemberStatus,
  note?: string,
): Promise<Member> {
  const member = await prisma.member.findFirst({ where: { id: memberId, deletedAt: null } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')

  console.log(`[membership] status override → ${status} for member ${memberId}${note ? `: ${note}` : ''}`)

  return prisma.member.update({
    where: { id: memberId },
    data: { memberStatus: status },
  })
}

export async function assignHonoraryMembership(
  memberId: string,
  adminId: string,
  note?: string,
): Promise<Member> {
  const member = await prisma.member.findFirst({ where: { id: memberId, deletedAt: null } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')
  if (member.membershipType === 'honoraryNoVote' && member.memberStatus === 'active') {
    throw serviceError('CONFLICT', 'Member already has an active honorary membership')
  }

  console.log(`[membership] admin ${adminId} assigned honorary membership to member ${memberId}${note ? `: ${note}` : ''}`)

  return prisma.member.update({
    where: { id: memberId },
    data: {
      membershipType: 'honoraryNoVote',
      memberStatus:   'active',
      joinDate:       new Date(),
      expiryDate:     null,
    },
  })
}

export async function adminCancelMembership(
  memberId: string,
  adminId: string,
): Promise<Member> {
  const member = await prisma.member.findFirst({ where: { id: memberId, deletedAt: null } })
  if (!member) throw serviceError('NOT_FOUND', 'Member not found')

  console.log(`[membership] admin ${adminId} cancelled membership for member ${memberId}`)

  return prisma.member.update({
    where: { id: memberId },
    data: { membershipType: null, memberStatus: null, expiryDate: null, joinDate: null },
  })
}

// ── Cron helper ───────────────────────────────────────────────────────────────

export async function expireOverdueMemberships(): Promise<number> {
  const result = await prisma.member.updateMany({
    where: {
      memberStatus: 'active',
      expiryDate:   { lt: new Date() },
    },
    data: { memberStatus: 'expired' },
  })
  return result.count
}
