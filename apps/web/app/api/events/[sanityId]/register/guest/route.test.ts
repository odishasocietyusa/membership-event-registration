// app/api/events/[sanityId]/register/guest/route.test.ts

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    eventRegistration: {
      count:  jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/lib/payments/stripe', () => ({
  createEventRegistrationGuestSession: jest.fn(),
}))

jest.mock('@/lib/emails/event-registration-confirmation', () => ({
  sendEventRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
}))

import { POST } from './route'
import { prisma } from '@/lib/db/prisma'
import { sanityFetch } from '@/sanity/lib/client'
import { createEventRegistrationGuestSession } from '@/lib/payments/stripe'

const mockSanityFetch   = sanityFetch as jest.Mock
const mockTransaction   = prisma.$transaction as jest.Mock
const mockCreateSession = createEventRegistrationGuestSession as jest.Mock

const OPEN_FREE_EVENT = {
  _id: 'event-2', title: 'Summer Picnic', slug: 'summer-picnic',
  start_date: '2026-07-04T12:00:00Z', location: 'City Park',
  accessLevel: 'openToAll', registrationFee: 0,
  registrationCapacity: null, onlineLink: null,
}
const OPEN_PAID_EVENT    = { ...OPEN_FREE_EVENT, registrationFee: 20 }
const MEMBERS_ONLY_EVENT = { ...OPEN_FREE_EVENT, accessLevel: 'membersOnly' }

function makeRequest(body: unknown) {
  return new Request('http://test/api/events/event-2/register/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ sanityId: 'event-2' })
const VALID_BODY = { guestName: 'Priya Das', guestEmail: 'priya@example.com' }

beforeEach(() => {
  jest.clearAllMocks()
  mockTransaction.mockImplementation(async (fn: Function) =>
    fn({ eventRegistration: { count: jest.fn().mockResolvedValue(0), create: jest.fn() } })
  )
  prisma.eventRegistration.create = jest.fn().mockResolvedValue({})
})

describe('POST /api/events/[sanityId]/register/guest', () => {
  it('GUEST-01: open free event → 200 with redirect and sanityEventId', async () => {
    mockSanityFetch.mockResolvedValueOnce(OPEN_FREE_EVENT)

    const res = await POST(makeRequest(VALID_BODY), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.redirect).toBe('/events/summer-picnic/success')
    expect(body.sanityEventId).toBe('event-2')
  })

  it('GUEST-02: open paid event → 200 with Stripe URL', async () => {
    mockSanityFetch.mockResolvedValueOnce(OPEN_PAID_EVENT)
    mockCreateSession.mockResolvedValueOnce('https://checkout.stripe.com/guest')

    const res = await POST(makeRequest(VALID_BODY), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/guest')
  })

  it('GUEST-03: members-only event → 403', async () => {
    mockSanityFetch.mockResolvedValueOnce(MEMBERS_ONLY_EVENT)

    const res = await POST(makeRequest(VALID_BODY), { params })
    expect(res.status).toBe(403)
  })

  it('GUEST-04: duplicate email (P2002) → 409', async () => {
    mockSanityFetch.mockResolvedValueOnce(OPEN_FREE_EVENT)
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      const err = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
      throw err
    })

    const res = await POST(makeRequest(VALID_BODY), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already registered/i)
  })

  it('GUEST-05: at capacity → 409', async () => {
    mockSanityFetch.mockResolvedValueOnce({ ...OPEN_FREE_EVENT, registrationCapacity: 5 })
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      await fn({
        eventRegistration: { count: jest.fn().mockResolvedValue(5), create: jest.fn() },
      })
    })

    const res = await POST(makeRequest(VALID_BODY), { params })
    expect(res.status).toBe(409)
  })

  it('GUEST-06: missing guestName → 400', async () => {
    const res = await POST(makeRequest({ guestEmail: 'priya@example.com' }), { params })
    expect(res.status).toBe(400)
  })

  it('GUEST-07: invalid email → 400', async () => {
    const res = await POST(makeRequest({ guestName: 'Priya', guestEmail: 'not-an-email' }), { params })
    expect(res.status).toBe(400)
  })

  it('GUEST-08: registrationFee null (legacy event) → 404', async () => {
    mockSanityFetch.mockResolvedValueOnce({ ...OPEN_FREE_EVENT, registrationFee: null })
    const res = await POST(makeRequest(VALID_BODY), { params })
    expect(res.status).toBe(404)
  })
})
