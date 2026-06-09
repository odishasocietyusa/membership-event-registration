// lib/validation/event.schema.test.ts

import {
  MemberRegisterSchema,
  GuestRegisterSchema,
  DeregisterSchema,
} from './event.schema'

describe('MemberRegisterSchema', () => {
  it('ZOD-01: empty body → { guestCount: 0 } default', () => {
    const result = MemberRegisterSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.guestCount).toBe(0)
  })

  it('accepts explicit guestCount', () => {
    const result = MemberRegisterSchema.safeParse({ guestCount: 3 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.guestCount).toBe(3)
  })

  it('rejects guestCount above 20', () => {
    expect(MemberRegisterSchema.safeParse({ guestCount: 21 }).success).toBe(false)
  })
})

describe('GuestRegisterSchema', () => {
  it('ZOD-02: valid fields → passes', () => {
    const result = GuestRegisterSchema.safeParse({
      guestName: 'Priya Das', guestEmail: 'priya@example.com',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.guestCount).toBe(0)
  })

  it('ZOD-03: invalid email → fails with email message', () => {
    const result = GuestRegisterSchema.safeParse({
      guestName: 'Priya', guestEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.errors[0].message
      expect(msg).toMatch(/valid email/i)
    }
  })

  it('ZOD-04: missing guestName → fails', () => {
    const result = GuestRegisterSchema.safeParse({ guestEmail: 'priya@example.com' })
    expect(result.success).toBe(false)
  })
})

describe('DeregisterSchema', () => {
  it('ZOD-05: { status: "cancelled" } → passes', () => {
    expect(DeregisterSchema.safeParse({ status: 'cancelled' }).success).toBe(true)
  })

  it('ZOD-06: { status: "confirmed" } → fails', () => {
    expect(DeregisterSchema.safeParse({ status: 'confirmed' }).success).toBe(false)
  })
})
