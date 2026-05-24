import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const BASE = 'http://localhost:3000'

function getAccessToken(): string {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { accessToken: string }
  return accessToken
}

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

  test('PUT /api/members/me returns 401', async ({ request }) => {
    const res = await request.put(`${BASE}/api/members/me`, { data: {} })
    expect(res.status()).toBe(401)
  })

  test('GET /api/members/me/family returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me/family`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/members/me/family returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/members/me/family`, { data: {} })
    expect(res.status()).toBe(401)
  })

  test('GET /api/members/me/export returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me/export`)
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

  test('GET /api/payments/me returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/payments/me`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/payments/checkout-session returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/payments/checkout-session`, { data: {} })
    expect(res.status()).toBe(401)
  })
})

test.describe('Authenticated member API routes', () => {
  test('GET /api/auth/me returns logged-in user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('user')
    expect(body.user).toHaveProperty('email')
  })

  test('GET /api/members/me returns member record', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('member')
    expect(body.member).toHaveProperty('id')
  })

  test('PUT /api/members/me updates profile fields', async ({ request }) => {
    const res = await request.put(`${BASE}/api/members/me`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      data: { fullName: 'Playwright Test User', bio: 'automated test' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.member.fullName).toBe('Playwright Test User')
  })

  test('GET /api/members/me/family returns empty array for new user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me/family`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('familyMembers')
    expect(Array.isArray(body.familyMembers)).toBe(true)
  })

  test('POST /api/members/me/family creates then GET verifies family member', async ({ request }) => {
    const token = getAccessToken()
    const createRes = await request.post(`${BASE}/api/members/me/family`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { fullName: 'Test Spouse', relation: 'spouse' },
    })
    expect(createRes.status()).toBe(201)
    const { familyMember } = await createRes.json()
    expect(familyMember).toHaveProperty('id')

    // Verify it appears in the list
    const listRes = await request.get(`${BASE}/api/members/me/family`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const { familyMembers } = await listRes.json()
    expect(familyMembers.some((m: { id: string }) => m.id === familyMember.id)).toBe(true)

    // Clean up
    await request.delete(`${BASE}/api/members/me/family/${familyMember.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  })

  test('GET /api/members/me/export returns member data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/me/export`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
  })

  test('GET /api/members/search returns 403 for non-active member', async ({ request }) => {
    const res = await request.get(`${BASE}/api/members/search?q=test`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    // Search requires active membership status
    expect(res.status()).toBe(403)
  })
})
