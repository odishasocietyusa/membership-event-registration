import { z } from 'zod'
import { EXPERTISE_CATEGORIES } from '@/lib/expertise/constants'

const CategoryEnum = z.enum(EXPERTISE_CATEGORIES)

export const RegisterExpertiseSchema = z.object({
  organization: z.string().max(200, 'Organization must be 200 characters or fewer').optional(),
  categories: z.array(CategoryEnum).min(1, 'Select at least one category').max(10),
  blurb: z.string().min(10, 'Blurb must be at least 10 characters').max(500, 'Blurb must be 500 characters or fewer'),
})

export const UpdateExpertiseSchema = RegisterExpertiseSchema.partial().extend({
  isHidden: z.boolean().optional(),
})

export type RegisterExpertiseInput = z.infer<typeof RegisterExpertiseSchema>
export type UpdateExpertiseInput = z.infer<typeof UpdateExpertiseSchema>
