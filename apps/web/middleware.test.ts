/**
 * Middleware tests — MW-01 through MW-05
 * Tests for apps/web/middleware.ts
 *
 * These tests verify that:
 * - Unauthenticated requests to protected routes are redirected to /login
 * - Authenticated requests to protected routes pass through
 * - Unauthenticated requests to /login pass through
 * - The config.matcher regex excludes /api/auth/callback
 */

// Mock @supabase/ssr before importing anything that uses it
const mockGetUser = jest.fn()
const mockGetAll = jest.fn().mockReturnValue([])
const mockSetAll = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

import { NextRequest } from 'next/server'
import { middleware, config } from './middleware'

function makeRequest(url: string): NextRequest {
  return new NextRequest(url)
}

describe('middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * MW-01: unauthenticated request to /dashboard → redirects to /login
   */
  it('MW-01: redirects unauthenticated request to /dashboard to /login', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const request = makeRequest('http://localhost/dashboard')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  /**
   * MW-02: unauthenticated request to /admin/users → redirects to /login
   */
  it('MW-02: redirects unauthenticated request to /admin/users to /login', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const request = makeRequest('http://localhost/admin/users')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  /**
   * MW-03: unauthenticated request to /login → passes through (no redirect)
   */
  it('MW-03: does not redirect unauthenticated request to /login', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const request = makeRequest('http://localhost/login')
    const response = await middleware(request)

    // Should pass through — not a redirect
    expect(response.status).not.toBe(307)
    expect(response.status).not.toBe(302)
    const location = response.headers.get('location')
    expect(location).toBeNull()
  })

  /**
   * MW-04: authenticated request (has session cookie) to /dashboard → passes through
   * Middleware now checks for a Supabase session cookie instead of calling getUser.
   */
  it('MW-04: does not redirect authenticated request to /dashboard', async () => {
    const request = new NextRequest('http://localhost/dashboard', {
      headers: { cookie: 'sb-test-auth-token=some.session.value' },
    })
    const response = await middleware(request)

    // Should pass through — not a redirect
    expect(response.status).not.toBe(307)
    expect(response.status).not.toBe(302)
    const location = response.headers.get('location')
    expect(location).toBeNull()
  })

  /**
   * MW-05: config.matcher regex does NOT match /api/auth/callback
   */
  it('MW-05: config.matcher excludes /api/auth/callback', () => {
    expect(config.matcher).toBeDefined()
    expect(Array.isArray(config.matcher)).toBe(true)

    const matcherPattern = config.matcher[0]
    // Next.js applies full-path matching, so anchor the pattern for the unit test
    const regex = new RegExp('^' + matcherPattern + '$')

    // /api/auth/callback should NOT match the middleware pattern
    expect(regex.test('/api/auth/callback')).toBe(false)

    // /dashboard should match (middleware applies to it)
    expect(regex.test('/dashboard')).toBe(true)
  })
})
