// app/api/auth/callback/route.test.ts
// TDD tests for CALLBACK-01 and CALLBACK-02

const mockGetUserAdmin = jest.fn()

// Mock @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn((url: string) => ({
      type: 'redirect',
      url,
      status: 307,
      cookies: { set: jest.fn() },
      headers: new Map(),
    })),
  },
}))

// Mock supabase-admin used by resolvePostLoginPath
jest.mock('@/lib/auth/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: mockGetUserAdmin },
  }),
}))

// Mock prisma used by resolvePostLoginPath
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
    familyMember: { findFirst: jest.fn() },
  },
}))

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { GET } from '@/app/api/auth/callback/route'
import { prisma } from '@/lib/db/prisma'

const mockCreateServerClient = createServerClient as jest.Mock
const mockCookies = cookies as jest.Mock
const mockRedirect = NextResponse.redirect as jest.Mock
const mockMemberFindUnique = prisma.member.findUnique as jest.Mock
const mockFamilyFindFirst = prisma.familyMember.findFirst as jest.Mock

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default cookie store mock
    const cookieStore = {
      getAll: jest.fn().mockReturnValue([]),
      set: jest.fn(),
    }
    mockCookies.mockResolvedValue(cookieStore)

    // Default: resolvePostLoginPath resolves to /dashboard (registered member)
    mockGetUserAdmin.mockResolvedValue({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
    })
    mockMemberFindUnique.mockResolvedValue({
      id: 'mem-1',
      address: { city: 'Seattle' }, // non-null = registered
    })
    mockFamilyFindFirst.mockResolvedValue(null)
  })

  // CALLBACK-01: valid code → exchange succeeds → redirect to /dashboard
  it('CALLBACK-01: redirects to /dashboard when code exchange succeeds', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValueOnce({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    })
    mockCreateServerClient.mockReturnValueOnce({
      auth: { exchangeCodeForSession },
    })

    const request = new Request('http://localhost:3000/api/auth/callback?code=valid-auth-code')
    await GET(request)

    expect(exchangeCodeForSession).toHaveBeenCalledWith('valid-auth-code')
    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/dashboard')
  })

  // CALLBACK-01 variant: supports ?next= deep-link param
  it('redirects to the ?next= path when provided and exchange succeeds', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValueOnce({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    })
    mockCreateServerClient.mockReturnValueOnce({
      auth: { exchangeCodeForSession },
    })

    const request = new Request(
      'http://localhost:3000/api/auth/callback?code=valid-auth-code&next=/dashboard/profile'
    )
    await GET(request)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard'
    )
  })

  // CALLBACK-02: no code param → redirect to /login?error=auth_callback_failed
  it('CALLBACK-02: redirects to /login?error=auth_callback_failed when no code is present', async () => {
    const request = new Request('http://localhost:3000/api/auth/callback')
    await GET(request)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })

  // CALLBACK-02 variant: code exchange fails → redirect to /login?error=auth_callback_failed
  it('redirects to /login?error=auth_callback_failed when code exchange returns an error', async () => {
    const exchangeCodeForSession = jest
      .fn()
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'invalid code' },
      })
    mockCreateServerClient.mockReturnValueOnce({
      auth: { exchangeCodeForSession },
    })

    const request = new Request(
      'http://localhost:3000/api/auth/callback?code=bad-code'
    )
    await GET(request)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })
})
