export const EXPERTISE_CATEGORIES = [
  'Academics',
  'Healthcare',
  'Charity',
  'Music',
  'Dance',
  'Technology',
  'Science',
  'Law',
  'Professional Services',
  'Other',
] as const

export type ExpertiseCategory = (typeof EXPERTISE_CATEGORIES)[number]

export const ELIGIBLE_MEMBERSHIP_TYPES = [
  'life',
  'lifeWard',
  'patron',
  'benefactor',
  'honoraryNoVote',
] as const

export type EligibleMembershipType = (typeof ELIGIBLE_MEMBERSHIP_TYPES)[number]
