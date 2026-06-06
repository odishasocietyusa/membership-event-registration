import { addMonths } from 'date-fns'
import type { MembershipType } from '@prisma/client'
import { EXPIRY_MONTHS, NO_EXPIRY_TYPES } from './constants'

/**
 * Pure function to compute the rolling expiration date.
 * Returns null for lifetime or special non-expiring tiers.
 */
export function computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null {
  if (NO_EXPIRY_TYPES.has(type)) {
    return null
  }
  const months = EXPIRY_MONTHS[type]
  if (months === undefined) {
    return null
  }
  return addMonths(paymentDate, months)
}
