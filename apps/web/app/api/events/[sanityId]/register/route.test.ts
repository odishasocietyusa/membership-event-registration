// app/api/events/[sanityId]/register/route.test.ts

const ACTIVE_MEMBER = {
  id: 'mem-1', email: 'member@test.com', fullName: 'Test Member',
  memberStatus: 'active', role: 'member',
}
const INACTIVE_MEMBER = { ...ACTIVE_MEMBER, memberStatus: 'expired' }

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function) =>
    (req: Request) => handler(req, { user: ACTIVE_MEMBER }),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    eventRegistration: {
      findUnique:  jest.fn(),
      count:       jest.fn(),
      upsert:      jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/lib/payments/stripe', () => ({
  createEventRegistrationSession: jest.fn(),
}))

jest.mock('@/lib/emails/event-registration-confirmation', () => ({
  sendEventRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
}))

import { POST } from './route'
import { prisma } from '@/lib/db/prisma'
import { sanityFetch } from '@/sanity/lib/client'
import { createEventRegistrationSession } from '@/lib/payments/stripe'

const mockSanityFetch  = sanityFetch as jest.Mock
const mockFindUnique   = prisma.eventRegistration.findUnique as jest.Mock
const mockTransaction  = prisma.$transaction as jest.Mock
const mockCreateSession = createEventRegistrationSession as jest.Mock

const FREE_EVENT = {
  _id: 'event-1', title: 'Test Event', slug: 'test-event',
  start_date: '2026-08-01T18:00:00Z', location: 'Online',
  accessLevel: 'membersOnly', registrationFee: 0,
  registrationCapacity: null, onlineLink: null,
}
const PAID_EVENT = { ...FREE_EVENT, registrationFee: 50 }
const OPEN_FREE_EVENT = { ...FREE_EVENT, accessLevel: 'openToAll' }

function makeRequest(body: unknown = {}) {
  return new Request('http://test/api/events/event-1/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ sanityId: 'event-1' })

beforeEach(() => {
  jest.clearAllMocks()
  // Default: no existing registration
  mockFindUnique.mockResolvedValue(null)
  // Default: transaction runs its callback
  mockTransaction.mockImplementation(async (fn: Function) => fn(prisma))
  prisma.eventRegistration.count = jest.fn().mockResolvedValue(0)
  prisma.eventRegistration.upsert = jest.fn().mockResolvedValue({})
})

describe('POST /api/events/[sanityId]/register — member', () => {
  it('REG-01: free event → 200 with redirect, upsert called with confirmed', async () => {
    mockSanityFetch.mockResolvedValueOnce(FREE_EVENT)

    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.redirect).toBe('/events/test-event/success')
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'confirmed', memberId: 'mem-1' }),
      }),
    )
  })

  it('REG-02: paid event → 200 with Stripe URL, pending row created', async () => {
    mockSanityFetch.mockResolvedValueOnce(PAID_EVENT)
    mockCreateSession.mockResolvedValueOnce('https://checkout.stripe.com/test')

    const res = await POST(makeRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/test')
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'pending' }),
      }),
    )
  })

  it('REG-04: at capacity → 409', async () => {
    mockSanityFetch.mockResolvedValueOnce({ ...FREE_EVENT, registrationCapacity: 2 });
    (prisma.eventRegistration.count as jest.Mock).mockResolvedValueOnce(2)
    // Transaction runs callback — CapacityError is thrown inside
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      await fn({
        eventRegistration: {
          count: jest.fn().mockResolvedValue(2),
          upsert: jest.fn(),
        },
      })
    })

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/capacity/i)
  })

  it('REG-05: already confirmed → 409', async () => {
    mockSanityFetch.mockResolvedValueOnce(FREE_EVENT)
    mockFindUnique.mockResolvedValueOnce({ status: 'confirmed' })

    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already registered/i)
  })

  it('REG-06: event.registrationFee null → 404', async () => {
    mockSanityFetch.mockResolvedValueOnce({ ...FREE_EVENT, registrationFee: null })
    const res = await POST(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('REG-09: guestCount stored on registration', async () => {
    mockSanityFetch.mockResolvedValueOnce(FREE_EVENT)
    const res = await POST(makeRequest({ guestCount: 3 }), { params })
    expect(res.status).toBe(200)
    expect(prisma.eventRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ guestCount: 3 }),
      }),
    )
  })
})

describe('POST /api/events/[sanityId]/register — inactive member on membersOnly', () => {
  it('REG-03: expired member → 403', async () => {
    // Override withAuth to return inactive member
    jest.resetModules()
    const withAuthMock = jest.fn((handler: Function) =>
      (req: Request) => handler(req, { user: INACTIVE_MEMBER })
    )
    jest.doMock('@/lib/auth/with-auth', () => ({ withAuth: withAuthMock }))
    jest.doMock('@/sanity/lib/client', () => ({ sanityFetch: jest.fn().mockResolvedValue(FREE_EVENT) }))

    // Re-import after mock override
    const { POST: POST2 } = await import('./route')
    const res = await POST2(makeRequest(), { params })
    expect(res.status).toBe(403)
  })
})
