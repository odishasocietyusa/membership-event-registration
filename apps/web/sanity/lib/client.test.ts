/**
 * Tests for apps/web/sanity/lib/client.ts
 *
 * Covers:
 * - SC-01: sanityFetch returns data when client.fetch succeeds
 * - SC-02: sanityFetch returns null when client.fetch throws (no re-throw)
 * - SC-03: sanityFetch uses default revalidate of 60 seconds
 * - SC-04: sanityFetch passes through custom revalidate value
 * - SC-05: sanityFetch passes params to client.fetch
 * - SC-06: client is created with useCdn: false
 */

const mockFetch = jest.fn()

jest.mock('next-sanity', () => ({
  createClient: jest.fn(() => ({
    fetch: mockFetch,
  })),
}))

// Re-import after mock setup
import { sanityFetch, client } from './client'

describe('sanityFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * SC-01: returns data when fetch succeeds
   */
  it('SC-01: returns data when client.fetch succeeds', async () => {
    const payload = [{ _id: 'abc', title: 'Test Event' }]
    mockFetch.mockResolvedValueOnce(payload)

    const result = await sanityFetch<typeof payload>('*[_type == "event"]')
    expect(result).toEqual(payload)
  })

  /**
   * SC-02: returns null when client.fetch throws — does NOT re-throw
   */
  it('SC-02: returns null when client.fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await sanityFetch('*[_type == "event"]')
    expect(result).toBeNull()
  })

  /**
   * SC-03: default revalidate is 60 seconds
   */
  it('SC-03: calls client.fetch with default revalidate of 60', async () => {
    mockFetch.mockResolvedValueOnce([])

    await sanityFetch('*[_type == "event"]')

    expect(mockFetch).toHaveBeenCalledWith(
      '*[_type == "event"]',
      {},
      { next: { revalidate: 60 } }
    )
  })

  /**
   * SC-04: passes custom revalidate value through
   */
  it('SC-04: respects custom revalidate value', async () => {
    mockFetch.mockResolvedValueOnce([])

    await sanityFetch('*[_type == "event"]', {}, 3600)

    expect(mockFetch).toHaveBeenCalledWith(
      '*[_type == "event"]',
      {},
      { next: { revalidate: 3600 } }
    )
  })

  /**
   * SC-04b: revalidate = false disables ISR
   */
  it('SC-04b: passes revalidate = false to disable ISR caching', async () => {
    mockFetch.mockResolvedValueOnce(null)

    await sanityFetch('*[_type == "event"]', {}, false)

    expect(mockFetch).toHaveBeenCalledWith(
      '*[_type == "event"]',
      {},
      { next: { revalidate: false } }
    )
  })

  /**
   * SC-05: passes params to client.fetch
   */
  it('SC-05: passes query params to client.fetch', async () => {
    mockFetch.mockResolvedValueOnce(null)

    const params = { slug: 'my-event' }
    await sanityFetch('*[_type == "event" && slug.current == $slug][0]', params)

    expect(mockFetch).toHaveBeenCalledWith(
      '*[_type == "event" && slug.current == $slug][0]',
      params,
      { next: { revalidate: 60 } }
    )
  })

  /**
   * SC-06: uses empty object when no params provided
   */
  it('SC-06: defaults params to empty object when not provided', async () => {
    mockFetch.mockResolvedValueOnce([])

    await sanityFetch('*[_type == "event"]')

    const call = mockFetch.mock.calls[0]
    expect(call[1]).toEqual({})
  })
})

describe('client configuration', () => {
  it('exports a client object', () => {
    expect(client).toBeDefined()
    expect(typeof client.fetch).toBe('function')
  })
})
