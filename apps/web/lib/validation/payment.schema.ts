import { z } from 'zod'

const MembershipTypeValues = [
  'annualStudentNoVote',
  'annualSingle',
  'annualFamily',
  'fiveYearFamily',
  'life',
  'lifeWard',
  'patron',
  'benefactor',
] as const

export const CheckoutSessionSchema = z.object({
  membershipType: z.enum(MembershipTypeValues),
})
export type CheckoutSessionInput = z.infer<typeof CheckoutSessionSchema>

// Upgrade session has no request body — member identity comes from auth
export const UpgradeSessionSchema = z.object({})
export type UpgradeSessionInput = z.infer<typeof UpgradeSessionSchema>

export const DonateSchema = z.object({
  amountCents: z.number().int().min(100, 'Minimum donation is $1.00'),
  isAnonymous: z.boolean().optional().default(false),
})
export type DonateInput = z.infer<typeof DonateSchema>

export const RefundSchema = z.object({
  refundAmountCents: z.number().int().positive(),
  refundReason:      z.string().min(1, 'Refund reason is required'),
})
export type RefundInput = z.infer<typeof RefundSchema>

export const ListPaymentsQuerySchema = z.object({
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  memberId:    z.string().uuid().optional(),
  status:      z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
  paymentType: z.enum(['membership', 'upgrade', 'donation', 'event_registration']).optional(),
})
export type ListPaymentsQueryInput = z.infer<typeof ListPaymentsQuerySchema>
