import type { MembershipType } from '@prisma/client'

export const NO_EXPIRY_TYPES = new Set<MembershipType>([
  'life',
  'lifeWard',
  'honoraryNoVote',
  'patron',
  'benefactor',
])

export const EXPIRY_MONTHS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 12,
  annualSingle:        12,
  annualFamily:        12,
  fiveYearFamily:      60,
}

