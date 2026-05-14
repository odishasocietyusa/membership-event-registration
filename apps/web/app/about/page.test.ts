/**
 * Tests for apps/web/app/about/page.tsx
 *
 * Covers:
 * - AB-01: AboutPage calls sanityFetch with the about-us query
 * - AB-02: AboutPage returns a defined JSX element when content is present
 * - AB-03: AboutPage handles null (Sanity unreachable) without throwing
 * - AB-04: AboutPage exports revalidate = 60 for ISR
 * - AB-05: Page renders without auth (no Supabase required)
 */

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

jest.mock('@/sanity/lib/queries', () => ({
  ABOUT_PAGE_QUERY: 'mock-about-query',
}))

import AboutPage, { revalidate } from '@/app/about/page'
import { sanityFetch } from '@/sanity/lib/client'

const mockSanityFetch = sanityFetch as jest.Mock

const MOCK_STATIC_PAGE = {
  _id: 'abc123',
  title: 'About Us',
  slug: 'about-us',
  body: [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'OSA was founded in 1969.', marks: [] }],
      markDefs: [],
    },
  ],
  section: 'organisation',
  last_updated: '2026-01-01',
}

describe('AboutPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('AB-01: calls sanityFetch with the about page query', async () => {
    mockSanityFetch.mockResolvedValueOnce(MOCK_STATIC_PAGE)
    await AboutPage()
    expect(mockSanityFetch).toHaveBeenCalledWith('mock-about-query')
  })

  it('AB-02: returns a defined JSX element when content is present', async () => {
    mockSanityFetch.mockResolvedValueOnce(MOCK_STATIC_PAGE)
    const result = await AboutPage()
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  it('AB-03: handles null from sanityFetch without throwing', async () => {
    mockSanityFetch.mockResolvedValueOnce(null)
    await expect(AboutPage()).resolves.not.toThrow()
  })

  it('AB-04: exports revalidate = 60', () => {
    expect(revalidate).toBe(60)
  })

  it('AB-05: renders without requiring Supabase or auth', async () => {
    mockSanityFetch.mockResolvedValueOnce(MOCK_STATIC_PAGE)
    await expect(AboutPage()).resolves.toBeDefined()
  })
})
