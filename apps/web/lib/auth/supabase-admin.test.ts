// lib/auth/supabase-admin.test.ts
// TDD test for ADMIN-01: throws at import time when required env vars are missing

describe('supabase-admin', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    // Restore environment variables after each test
    if (originalUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    }
    if (originalKey !== undefined) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    } else {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
    jest.resetModules()
  })

  // ADMIN-01: throws at import time when SUPABASE_SERVICE_ROLE_KEY is missing
  it('throws at import time when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

    jest.resetModules()
    await expect(import('@/lib/auth/supabase-admin')).rejects.toThrow(
      'SUPABASE_SERVICE_ROLE_KEY'
    )
  })

  it('throws at import time when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

    jest.resetModules()
    await expect(import('@/lib/auth/supabase-admin')).rejects.toThrow(
      'NEXT_PUBLIC_SUPABASE_URL'
    )
  })
})
