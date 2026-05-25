// lib/auth/supabase-admin.test.ts
// Tests for getSupabaseAdmin() — throws when required env vars are missing

describe('supabase-admin', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
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

  // ADMIN-01: getSupabaseAdmin() throws when SUPABASE_SERVICE_ROLE_KEY is missing
  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'

    jest.resetModules()
    const { getSupabaseAdmin } = await import('@/lib/auth/supabase-admin')
    expect(() => getSupabaseAdmin()).toThrow('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

    jest.resetModules()
    const { getSupabaseAdmin } = await import('@/lib/auth/supabase-admin')
    expect(() => getSupabaseAdmin()).toThrow('NEXT_PUBLIC_SUPABASE_URL')
  })
})
