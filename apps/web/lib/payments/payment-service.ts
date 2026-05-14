import { prisma } from '@/lib/db/prisma'
import type { MembershipType, PaymentType, PaymentStatus } from '@prisma/client'

// Tiers that have no expiry date
const NO_EXPIRY_TYPES = new Set<MembershipType>(['life', 'lifeWard'])

// Expiry durations in days for annual/multi-year tiers
const EXPIRY_DAYS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 365,
  annualSingle:        365,
  annualFamily:        365,
  fiveYearFamily:      365 * 5,
  patron:              365,
  benefactor:          365,
}

export async function calculateCumulativePaid(memberId: string): Promise<number> {
  const records = await prisma.paymentRecord.findMany({
    where: {
      memberId,
      status: 'completed',
      paymentType: { in: ['membership', 'upgrade'] },
      membershipType: { not: null },
    },
    include: { member: false },
  })

  // Fetch upgrade-path flags for all relevant membership types
  type RawRecord = { membershipType: MembershipType | null; amountCents: number }
  type RawFee = { membershipType: MembershipType }
  const types = [...new Set((records as RawRecord[]).map((r) => r.membershipType).filter(Boolean))]
  const fees = await prisma.membershipFee.findMany({
    where: { membershipType: { in: types as MembershipType[] }, isUpgradePath: true },
    select: { membershipType: true },
  })
  const upgradePathTypes = new Set((fees as RawFee[]).map((f) => f.membershipType))

  return (records as RawRecord[])
    .filter((r) => r.membershipType && upgradePathTypes.has(r.membershipType as MembershipType))
    .reduce((sum: number, r: RawRecord) => sum + r.amountCents, 0)
}

export interface UpgradeCostResult {
  eligible: boolean
  reason?: string
  costCents: number
  autoActivate: boolean
}

export async function calculateUpgradeCost(memberId: string): Promise<UpgradeCostResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) return { eligible: false, reason: 'Member not found', costCents: 0, autoActivate: false }

  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const isActive = member.memberStatus === 'active'
  const isRecentlyExpired =
    member.memberStatus === 'expired' &&
    member.expiryDate !== null &&
    member.expiryDate >= oneYearAgo

  if (!isActive && !isRecentlyExpired) {
    return {
      eligible: false,
      reason: member.memberStatus === 'expired'
        ? 'Upgrade window expired. Membership expired more than 1 year ago.'
        : 'No active or recently expired membership.',
      costCents: 0,
      autoActivate: false,
    }
  }

  const lifeFee = await prisma.membershipFee.findUnique({ where: { id: 'life' } })
  if (!lifeFee) throw new Error('Life membership fee not seeded')

  const lifeCents = lifeFee.amountDollars * 100
  const cumulativePaid = await calculateCumulativePaid(memberId)
  const costCents = Math.max(0, lifeCents - cumulativePaid)

  return {
    eligible: true,
    costCents,
    autoActivate: costCents === 0,
  }
}

export async function activateMembership(
  memberId: string,
  membershipType: MembershipType,
): Promise<void> {
  let expiryDate: Date | null = null
  if (!NO_EXPIRY_TYPES.has(membershipType)) {
    const days = EXPIRY_DAYS[membershipType] ?? 365
    expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + days)
  }

  await prisma.member.update({
    where: { id: memberId },
    data: {
      memberStatus:   'active',
      membershipType,
      joinDate:       expiryDate ? undefined : new Date(),
      expiryDate:     expiryDate,
    },
  })
}

export interface RecordPaymentInput {
  memberId?:              string | null
  stripeSessionId?:       string
  stripeEventId?:         string
  stripePaymentIntentId?: string
  status:                 PaymentStatus
  paymentType:            PaymentType
  membershipType?:        MembershipType
  amountCents:            number
  isAdminInitiated?:      boolean
  isAnonymous?:           boolean
  currency?:              string
}

export async function recordPayment(input: RecordPaymentInput): Promise<void> {
  const membershipType = input.membershipType

  await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.create({
      data: {
        memberId:              input.memberId,
        stripeSessionId:       input.stripeSessionId,
        stripeEventId:         input.stripeEventId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        status:                input.status,
        paymentType:           input.paymentType,
        membershipType:        membershipType,
        amountCents:           input.amountCents,
        isAdminInitiated:      input.isAdminInitiated ?? false,
        isAnonymous:           input.isAnonymous ?? false,
        currency:              input.currency ?? 'usd',
      },
    })

    if (input.status === 'completed' && input.memberId && membershipType) {
      await activateMembership(input.memberId, membershipType)
    }
  })
}
