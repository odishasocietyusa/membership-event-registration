import { z } from 'zod'

export const MemberRegisterSchema = z.object({
  guestCount: z.number().int().min(0).max(20).optional().default(0),
})
export type MemberRegisterInput = z.infer<typeof MemberRegisterSchema>

export const GuestRegisterSchema = z.object({
  guestName:  z.string().min(1, 'Name is required').max(100),
  guestEmail: z.string().email('Valid email is required'),
  guestCount: z.number().int().min(0).max(20).optional().default(0),
})
export type GuestRegisterInput = z.infer<typeof GuestRegisterSchema>

export const DeregisterSchema = z.object({
  status: z.literal('cancelled'),
})
export type DeregisterInput = z.infer<typeof DeregisterSchema>
