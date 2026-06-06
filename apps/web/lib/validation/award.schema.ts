import { z } from 'zod'

export const AwardCategoryEnum = z.enum([
  'annualNominated',
  'communityService',
  'competition',
  'convention',
  'specialRecognition',
  'misc',
])

export const ListAwardsQuerySchema = z.object({
  year:     z.coerce.number().int().min(1900).max(2100).optional(),
  category: AwardCategoryEnum.optional(),
})

const BaseAwardSchema = z.object({
  awardName:         z.string().min(1).max(100),
  year:              z.number().int().min(1900).max(2100),
  category:          AwardCategoryEnum,
  recipientName:     z.string().min(1).max(200).optional().nullable(),
  recipientMemberId: z.string().uuid().optional().nullable(),
  citation:          z.string().max(2000).optional().nullable(),
  photoUrl:          z.string().url().max(2000).optional().nullable(),
})

export const CreateAwardSchema = BaseAwardSchema.refine(
  (d) => Boolean(d.recipientName) || Boolean(d.recipientMemberId),
  { message: 'Either recipientName or recipientMemberId is required' }
)

export const UpdateAwardSchema = BaseAwardSchema.partial().refine(
  (d) => {
    if (d.recipientName === null && d.recipientMemberId === null) {
      return false
    }
    return true
  },
  { message: 'Either recipientName or recipientMemberId is required' }
)
