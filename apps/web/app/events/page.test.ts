/**
 * Tests for apps/web/app/events/page.tsx
 *
 * Covers:
 * - EV-01: EventsPage calls sanityFetch with the events query
 * - EV-02: EventsPage handles empty array from sanityFetch without throwing
 * - EV-03: EventsPage exports dynamic = 'force-dynamic'
 * - EV-04: EventsPage returns JSX (truthy) when events are present
 * - EV-05: EventsPage redirects to /login when getCurrentMember returns null
 */

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/sanity/lib/queries', () => ({
  ALL_EVENTS_QUERY: 'mock-events-query',
}))

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

import EventsPage, { dynamic } from '@/app/events/page'
import { sanityFetch } from '@/sanity/lib/client'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { redirect } from 'next/navigation'

const mockSanityFetch = sanityFetch as jest.Mock
const mockGetCurrentMember = getCurrentMember as jest.Mock
const mockRedirect = redirect as unknown as jest.Mock

const activeMember = {
  member: {
    id: 'mem-1',
    email: 'user@test.com',
    memberStatus: 'active',
    role: 'member',
  },
  isSpouseSession: false,
}

describe('EventsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentMember.mockResolvedValue(activeMember)
  })

  /**
   * EV-01: calls sanityFetch with events query
   */
  it('EV-01: calls sanityFetch with the events query', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    await EventsPage()
    expect(mockSanityFetch).toHaveBeenCalledWith('mock-events-query')
  })

  /**
   * EV-02: handles empty events without throwing
   */
  it('EV-02: handles empty events from sanityFetch without throwing', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    await expect(EventsPage()).resolves.not.toThrow()
  })

  /**
   * EV-03: exports dynamic = 'force-dynamic'
   */
  it('EV-03: exports dynamic = "force-dynamic"', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  /**
   * EV-04: returns a defined value (JSX element) on success
   */
  it('EV-04: returns a defined JSX element when events are returned', async () => {
    mockSanityFetch.mockResolvedValueOnce([
      { _id: '1', title: 'Annual Convention', slug: 'annual-convention', start_date: '2026-06-01', location: 'New York' },
    ])
    const result = await EventsPage()
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  /**
   * EV-05: redirects to /login when not authenticated
   */
  it('EV-05: redirects to /login when getCurrentMember returns null', async () => {
    mockGetCurrentMember.mockResolvedValueOnce(null)
    await expect(EventsPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
