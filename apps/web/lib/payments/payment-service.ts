import { prisma } from '@/lib/db/prisma'
import type { MembershipType, PaymentType, PaymentStatus } from '@prisma/client'

import { NO_EXPIRY_TYPES } from '../memberships/constants'
import { computeExpiryDate } from '../memberships/expiry'

export async function calculateCumulativePaid(memberId: string): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { consecutiveSince: true },
  })

  const records = await prisma.paymentRecord.findMany({
    where: {
      memberId,
      status: 'completed',
      paymentType: { in: ['membership', 'upgrade'] },
      membershipType: { not: null },
      ...(member?.consecutiveSince
        ? { createdAt: { gte: member.consecutiveSince } }
        : {}),
    },
  })

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

export async function calculateUpgradeCost(
  memberId: string,
  targetType: MembershipType,
): Promise<UpgradeCostResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) return { eligible: false, reason: 'Member not found', costCents: 0, autoActivate: false }

  if (member.memberStatus !== 'active') {
    return {
      eligible: false,
      reason: 'Only active members can upgrade.',
      costCents: 0,
      autoActivate: false,
    }
  }

  const targetFee = await prisma.membershipFee.findUnique({ where: { membershipType: targetType } })
  if (!targetFee) {
    return { eligible: false, reason: `Unknown membership type: ${targetType}`, costCents: 0, autoActivate: false }
  }

  const targetCents    = targetFee.amountDollars * 100
  const cumulativePaid = await calculateCumulativePaid(memberId)
  const costCents      = Math.max(0, targetCents - cumulativePaid)

  return { eligible: true, costCents, autoActivate: costCents === 0 }
}

export interface UpgradeOption {
  membershipType:   MembershipType
  displayName:      string
  fullPriceDollars: number
  upgradeFeeCents:  number
}

export interface UpgradeOptionsResult {
  cumulativePaidCents: number
  options:             UpgradeOption[]
}

const MEMBERSHIP_LABELS: Record<MembershipType, string> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
  honoraryNoVote:      'Honorary',
}

export async function getUpgradeOptions(memberId: string): Promise<UpgradeOptionsResult> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { memberStatus: true, membershipType: true },
  })

  const empty = { cumulativePaidCents: 0, options: [] }
  if (!member || member.memberStatus !== 'active' || !member.membershipType) return empty
  if (member.membershipType === 'honoraryNoVote') return empty

  const currentFee = await prisma.membershipFee.findUnique({
    where: { membershipType: member.membershipType },
  })
  if (!currentFee) return empty

  const cumulativePaidCents = await calculateCumulativePaid(memberId)

  const allFees = await prisma.membershipFee.findMany({
    where: { isAdminOnly: false },
    orderBy: { amountDollars: 'asc' },
  })

  const options: UpgradeOption[] = allFees
    .filter((fee) =>
      fee.membershipType !== member.membershipType &&
      fee.membershipType !== 'honoraryNoVote' &&
      fee.amountDollars > currentFee.amountDollars,
    )
    .map((fee) => ({
      membershipType:   fee.membershipType,
      displayName:      MEMBERSHIP_LABELS[fee.membershipType] ?? fee.membershipType,
      fullPriceDollars: fee.amountDollars,
      upgradeFeeCents:  Math.max(0, fee.amountDollars * 100 - cumulativePaidCents),
    }))

  return { cumulativePaidCents, options }
}

export async function applyUpgrade(
  memberId: string,
  membershipType: MembershipType,
  paymentDate: Date = new Date(),
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { expiryDate: true },
  })
  if (!member) throw new Error(`applyUpgrade: member ${memberId} not found`)

  let expiryDate: Date | null = member.expiryDate

  if (NO_EXPIRY_TYPES.has(membershipType)) {
    expiryDate = null
  } else if (membershipType === 'fiveYearFamily') {
    expiryDate = computeExpiryDate(membershipType, paymentDate)
  }
  // Annual → annual upgrades: preserve current expiryDate (same billing cycle)

  await prisma.member.update({
    where: { id: memberId },
    data: { membershipType, expiryDate },
  })
}

export async function activateMembership(
  memberId: string,
  membershipType: MembershipType,
  paymentDate: Date = new Date(),
): Promise<void> {
  const current = await prisma.member.findUnique({
    where: { id: memberId },
    select: { memberStatus: true, consecutiveSince: true },
  })
  const resetConsecutive =
    !current || current.memberStatus === 'expired' || current.consecutiveSince === null

  const expiryDate = computeExpiryDate(membershipType, paymentDate)

  await prisma.member.update({
    where: { id: memberId },
    data: {
      memberStatus:   'active',
      membershipType,
      joinDate:       paymentDate,
      expiryDate,
      ...(resetConsecutive && { consecutiveSince: paymentDate }),
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
  paymentDate?:           Date
}

export async function recordPayment(input: RecordPaymentInput): Promise<void> {
  const membershipType = input.membershipType

  await prisma.$transaction(async (tx) => {
    const record = await tx.paymentRecord.create({
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
      const paymentDate = input.paymentDate ?? record.createdAt ?? new Date()
      if (input.paymentType === 'upgrade') {
        await applyUpgrade(input.memberId, membershipType, paymentDate)
      } else {
        await activateMembership(input.memberId, membershipType, paymentDate)
      }
    }
  })
}
