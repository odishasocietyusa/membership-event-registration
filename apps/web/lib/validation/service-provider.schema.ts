import { z } from 'zod'

const urlOrEmpty = z.union([z.string().url(), z.literal('')])

export const RegisterProviderSchema = z.object({
  bio: z.string().min(10, 'Bio must be at least 10 characters').max(1000, 'Bio must be 1000 characters or fewer'),
  specializations: z
    .array(z.string().min(1))
    .min(1, 'Select at least one specialization')
    .max(10, 'Maximum 10 specializations'),
  onlineClasses: z.boolean(),
  displayName: z.string().max(100, 'Display name must be 100 characters or fewer').optional(),
  phone: z.string().max(20, 'Phone must be 20 characters or fewer').optional(),
  websiteUrl: urlOrEmpty.optional(),
  photoUrl: urlOrEmpty.optional(),
})

export const UpdateProviderSchema = RegisterProviderSchema.partial().extend({
  status: z.enum(['pending', 'active', 'inactive']).optional(),
})

export const ContactProviderSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(100, 'Subject must be 100 characters or fewer'),
  body: z.string().min(10, 'Message must be at least 10 characters').max(2000, 'Message must be 2000 characters or fewer'),
})

export type RegisterProviderInput = z.infer<typeof RegisterProviderSchema>
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>
export type ContactProviderInput = z.infer<typeof ContactProviderSchema>
