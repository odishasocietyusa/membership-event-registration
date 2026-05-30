import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

function getAccessToken(): string {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { accessToken: string }
  return accessToken
}

test.describe('Membership types — public', () => {
  test('GET /api/memberships/types returns list without auth', async ({ request }) => {
    const res = await request.get('/api/memberships/types')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('types')
    expect(Array.isArray(body.types)).toBe(true)
    expect(body.types.length).toBeGreaterThan(0)
  })
})

test.describe('Membership — unauthenticated (401 checks)', () => {
  test('POST /api/memberships returns 401', async ({ request }) => {
    const res = await request.post('/api/memberships', {
      data: { membershipType: 'annualSingle' },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/memberships/me returns 401', async ({ request }) => {
    const res = await request.get('/api/memberships/me')
    expect(res.status()).toBe(401)
  })

  test('DELETE /api/memberships/me returns 401', async ({ request }) => {
    const res = await request.delete('/api/memberships/me')
    expect(res.status()).toBe(401)
  })

  test('GET /api/memberships/me/history returns 401', async ({ request }) => {
    const res = await request.get('/api/memberships/me/history')
    expect(res.status()).toBe(401)
  })
})

test.describe('Membership — authenticated member', () => {
  // membershipId is shared across ordered tests in this describe block.
  // workers: 1 + sequential execution ensures ordering is guaranteed.
  let membershipId: string

  test('GET /api/memberships/me returns 200 for member with no membership', async ({ request }) => {
    const res = await request.get('/api/memberships/me', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    // 200 with null fields or 404 are both valid for a fresh user
    expect([200, 404]).toContain(res.status())
  })

  test('GET /api/memberships/me/history returns 200 with array', async ({ request }) => {
    const res = await request.get('/api/memberships/me/history', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.history ?? body.data ?? body)).toBe(true)
  })

  test('POST /api/memberships applies for annualSingle — creates pending membership', async ({ request }) => {
    const res = await request.post('/api/memberships', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      data: { membershipType: 'annualSingle' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('membership')
    expect(body.membership).toHaveProperty('id')
    membershipId = body.membership.id
  })

  test('POST /api/memberships again returns 409 conflict', async ({ request }) => {
    const res = await request.post('/api/memberships', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      data: { membershipType: 'annualSingle' },
    })
    expect(res.status()).toBe(409)
  })

  test('GET /api/memberships/me returns membership after applying', async ({ request }) => {
    const res = await request.get('/api/memberships/me', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.membership).toHaveProperty('membershipType', 'annualSingle')
  })

  test('DELETE /api/memberships/me cancels membership', async ({ request }) => {
    const res = await request.delete('/api/memberships/me', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(200)
    void membershipId // used to confirm the sequence ran
  })
})

test.describe('Membership — admin routes (skipped: require admin role promotion)', () => {
  test.skip('GET /api/memberships returns 403 for non-admin', async ({ request }) => {
    const res = await request.get('/api/memberships', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    expect(res.status()).toBe(403)
  })

  test.skip('POST /api/memberships/:id/approve — admin only', async () => {
    // Requires: admin JWT + existing pending membership ID
  })

  test.skip('POST /api/memberships/:id/reject — admin only', async () => {
    // Requires: admin JWT + existing pending membership ID
  })

  test.skip('POST /api/memberships/honorary/assign — admin only', async () => {
    // Requires: admin JWT + target member UUID
  })
})
