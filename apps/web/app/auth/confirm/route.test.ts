// app/auth/confirm/route.test.ts
// CONFIRM-01, CONFIRM-02, CONFIRM-03

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn((url: string) => ({
      type: 'redirect',
      url,
      status: 307,
    })),
  },
}))

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { GET } from '@/app/auth/confirm/route'

const mockCreateServerClient = createServerClient as jest.Mock
const mockCookies = cookies as jest.Mock
const mockRedirect = NextResponse.redirect as jest.Mock

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    const cookieStore = {
      getAll: jest.fn().mockReturnValue([]),
      set: jest.fn(),
    }
    mockCookies.mockResolvedValue(cookieStore)
  })

  // CONFIRM-01: valid token_hash + type → verifyOtp succeeds → redirect to /dashboard
  it('CONFIRM-01: redirects to /dashboard when verifyOtp succeeds', async () => {
    const verifyOtp = jest.fn().mockResolvedValueOnce({ error: null })
    mockCreateServerClient.mockReturnValueOnce({ auth: { verifyOtp } })

    const request = new Request(
      'http://localhost:3000/auth/confirm?token_hash=abc123&type=email'
    )
    await GET(request)

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'email' })
    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/dashboard')
  })

  // CONFIRM-02: verifyOtp returns an error → redirect to /login?error=email_confirmation_failed
  it('CONFIRM-02: redirects to /login?error=email_confirmation_failed when verifyOtp fails', async () => {
    const verifyOtp = jest.fn().mockResolvedValueOnce({ error: { message: 'token expired' } })
    mockCreateServerClient.mockReturnValueOnce({ auth: { verifyOtp } })

    const request = new Request(
      'http://localhost:3000/auth/confirm?token_hash=expired&type=email'
    )
    await GET(request)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=email_confirmation_failed'
    )
  })

  // CONFIRM-03: missing token_hash → redirect to /login?error=email_confirmation_failed (no verifyOtp call)
  it('CONFIRM-03: redirects to error page when token_hash is missing', async () => {
    const request = new Request('http://localhost:3000/auth/confirm?type=email')
    await GET(request)

    expect(mockCreateServerClient).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=email_confirmation_failed'
    )
  })

  // CONFIRM-04: missing type → redirect to /login?error=email_confirmation_failed (no verifyOtp call)
  it('CONFIRM-04: redirects to error page when type is missing', async () => {
    const request = new Request('http://localhost:3000/auth/confirm?token_hash=abc123')
    await GET(request)

    expect(mockCreateServerClient).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=email_confirmation_failed'
    )
  })

  // CONFIRM-05: recovery type also accepted (password reset confirmation)
  it('CONFIRM-05: passes type=recovery to verifyOtp when present', async () => {
    const verifyOtp = jest.fn().mockResolvedValueOnce({ error: null })
    mockCreateServerClient.mockReturnValueOnce({ auth: { verifyOtp } })

    const request = new Request(
      'http://localhost:3000/auth/confirm?token_hash=xyz789&type=recovery'
    )
    await GET(request)

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz789', type: 'recovery' })
    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/dashboard')
  })
})
