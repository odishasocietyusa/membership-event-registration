import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

test.describe('Public API routes', () => {
  test('GET /api/chapters returns 200 with chapters array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/chapters`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('chapters')
    expect(Array.isArray(body.chapters)).toBe(true)
  })

  test('GET /api/memberships/types returns 200 with types array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/memberships/types`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('types')
    expect(Array.isArray(body.types)).toBe(true)
  })
})

test.describe('Protected API routes — no auth', () => {
  test('GET /api/auth/me returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/members/me returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/memberships/me returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/memberships/me`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/memberships returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/memberships`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/memberships returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/memberships`, {
      data: { membershipTypeId: 'some-id' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/memberships/honorary/assign returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/memberships/honorary/assign`, {
      data: { memberEmail: 'test@example.com' },
    })
    expect(res.status()).toBe(401)
  })
})
