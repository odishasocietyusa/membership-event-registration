/**
 * Tests for apps/web/app/announcements/page.tsx
 *
 * Covers:
 * - AN-01: AnnouncementsPage calls sanityFetch with the announcements query
 * - AN-02: AnnouncementsPage handles null from sanityFetch without throwing
 * - AN-03: AnnouncementsPage exports revalidate = 60
 * - AN-04: AnnouncementsPage returns a defined JSX element
 * - AN-05: Page uses NO auth check (no createServerClient, no cookies)
 *          Verified structurally: only sanityFetch is mocked — no Supabase mock required
 */

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/sanity/lib/queries', () => ({
  ALL_ANNOUNCEMENTS_QUERY: 'mock-announcements-query',
}))

import AnnouncementsPage, { revalidate } from '@/app/announcements/page'
import { sanityFetch } from '@/sanity/lib/client'

const mockSanityFetch = sanityFetch as jest.Mock

describe('AnnouncementsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * AN-01: calls sanityFetch with announcements query
   */
  it('AN-01: calls sanityFetch with the announcements query', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    await AnnouncementsPage()
    expect(mockSanityFetch).toHaveBeenCalledWith('mock-announcements-query')
  })

  /**
   * AN-02: handles null from sanityFetch without throwing
   */
  it('AN-02: handles null from sanityFetch without throwing', async () => {
    mockSanityFetch.mockResolvedValueOnce(null)
    await expect(AnnouncementsPage()).resolves.not.toThrow()
  })

  /**
   * AN-03: exports revalidate = 60
   */
  it('AN-03: exports revalidate = 60', () => {
    expect(revalidate).toBe(60)
  })

  /**
   * AN-04: returns a defined JSX element on success
   */
  it('AN-04: returns a defined JSX element when announcements are returned', async () => {
    mockSanityFetch.mockResolvedValueOnce([
      {
        _id: 'ann-1',
        title: 'Welcome to OSA',
        body: 'Hello members!',
        published_at: '2026-01-01',
        expires_at: null,
        audience: 'all',
        cta_link: null,
        cta_label: null,
      },
    ])
    const result = await AnnouncementsPage()
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  /**
   * AN-05: page requires NO Supabase/auth — public query only
   * If the page called createServerClient/cookies without a mock, it would throw
   */
  it('AN-05: renders without Supabase or authentication requirement', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    // No @supabase/ssr mock provided — if page used it, this would fail
    await expect(AnnouncementsPage()).resolves.toBeDefined()
  })

  /**
   * AN-06: single sanityFetch call (no member-only branch)
   */
  it('AN-06: calls sanityFetch exactly once (no auth branching)', async () => {
    mockSanityFetch.mockResolvedValueOnce([])
    await AnnouncementsPage()
    expect(mockSanityFetch).toHaveBeenCalledTimes(1)
  })
})
