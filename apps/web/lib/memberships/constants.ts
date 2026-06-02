import type { MembershipType } from '@prisma/client'

export const NO_EXPIRY_TYPES = new Set<MembershipType>([
  'life',
  'lifeWard',
  'honoraryNoVote',
  'patron',
  'benefactor',
])
