/**
 * Tests for apps/web/app/events/page.tsx
 *
 * Covers:
 * - EV-01: Page redirects to /login when no session exists
 * - EV-02: Page returns gated message when membership is expired
 * - EV-03: Page returns gated message when membership is suspended
 * - EV-04: Page returns gated message when no membership (null status)
 * - EV-05: Page renders events list for active members
 * - EV-06: Page handles empty events list without throwing
 */

jest.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServer: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/sanity/lib/queries', () => ({
  ALL_EVENTS_QUERY: 'mock-events-query',
}))

import EventsPage from '@/app/events/page'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { sanityFetch } from '@/sanity/lib/client'

const mockCreateSupabaseServer = createSupabaseServer as jest.Mock
const mockSanityFetch = sanityFetch as jest.Mock

function mockSupabase(session: unknown) {
  mockCreateSupabaseServer.mockResolvedValue({
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session } }) },
  })
}

function mockMeEndpoint(memberStatus: string | null) {
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve({ user: { memberStatus } }),
  }) as jest.Mock
}

describe('EventsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  })

  it('EV-01: redirects to /login when no session', async () => {
    mockSupabase(null)
    await expect(EventsPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('EV-02: shows renewal message when membership is expired', async () => {
    mockSupabase({ access_token: 'token' })
    mockMeEndpoint('expired')
    const result = await EventsPage()
    expect(result).toBeDefined()
    // MembershipGate renders — sanityFetch should not be called
    expect(mockSanityFetch).not.toHaveBeenCalled()
  })

  it('EV-03: shows suspended message when membership is suspended', async () => {
    mockSupabase({ access_token: 'token' })
    mockMeEndpoint('suspended')
    const result = await EventsPage()
    expect(result).toBeDefined()
    expect(mockSanityFetch).not.toHaveBeenCalled()
  })

  it('EV-04: shows join message when no membership', async () => {
    mockSupabase({ access_token: 'token' })
    mockMeEndpoint(null)
    const result = await EventsPage()
    expect(result).toBeDefined()
    expect(mockSanityFetch).not.toHaveBeenCalled()
  })

  it('EV-05: renders events list for active members', async () => {
    mockSupabase({ access_token: 'token' })
    mockMeEndpoint('active')
    mockSanityFetch.mockResolvedValueOnce([
      { _id: '1', title: 'Annual Convention', slug: 'annual-convention', start_date: '2026-06-01', location: 'New York' },
    ])
    const result = await EventsPage()
    expect(result).toBeDefined()
    expect(mockSanityFetch).toHaveBeenCalled()
  })

  it('EV-06: handles empty events list without throwing for active members', async () => {
    mockSupabase({ access_token: 'token' })
    mockMeEndpoint('active')
    mockSanityFetch.mockResolvedValueOnce(null)
    await expect(EventsPage()).resolves.toBeDefined()
  })
})
