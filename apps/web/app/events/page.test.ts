/**
 * Tests for apps/web/app/events/page.tsx
 *
 * Covers:
 * - EV-01: EventsPage calls sanityFetch with the events query
 * - EV-02: EventsPage handles null from sanityFetch without throwing
 * - EV-03: EventsPage exports revalidate = 60
 * - EV-04: EventsPage returns JSX (truthy) when events are present
 * - EV-05: EventsPage renders without auth check (no Supabase/cookies)
 */

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/sanity/lib/queries', () => ({
  ALL_EVENTS_QUERY: 'mock-events-query',
}))

import EventsPage, { revalidate } from '@/app/events/page'
import { sanityFetch } from '@/sanity/lib/client'

const mockSanityFetch = sanityFetch as jest.Mock

describe('EventsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
   * EV-02: handles null from sanityFetch without throwing
   */
  it('EV-02: handles null from sanityFetch without throwing', async () => {
    mockSanityFetch.mockResolvedValueOnce(null)
    await expect(EventsPage()).resolves.not.toThrow()
  })

  /**
   * EV-03: exports revalidate = 60
   */
  it('EV-03: exports revalidate = 60', () => {
    expect(revalidate).toBe(60)
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
   * EV-05: page does NOT import Supabase — no auth check
   * Verified by the fact that no Supabase mock is needed and no error is thrown
   */
  it('EV-05: renders without requiring Supabase or auth', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    // If page tried to use Supabase without a mock, this would throw
    await expect(EventsPage()).resolves.toBeDefined()
  })
})
