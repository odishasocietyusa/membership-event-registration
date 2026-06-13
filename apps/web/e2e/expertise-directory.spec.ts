import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function getAuth(): { accessToken: string; userId: string } {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken, id } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { accessToken: string; id: string }
  return { accessToken, userId: id }
}

test.describe('Expertise Directory — unauthenticated', () => {
  test('GET /api/expertise returns 401', async ({ request }) => {
    const res = await request.get('/api/expertise')
    expect(res.status()).toBe(401)
  })
})

test.describe('Expertise Directory — ineligible/non-active member', () => {
  test('GET /api/expertise returns 403 for non-active member', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.get('/api/expertise', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status()).toBe(403)
  })

  test('POST /api/expertise returns 403 for ineligible member', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.post('/api/expertise', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { categories: ['Technology'], blurb: 'I build community web apps.' },
    })
    expect(res.status()).toBe(403)
  })

  test('register page shows ineligibility message', async ({ page }) => {
    await page.goto('/membership/expertise/register')
    await expect(page.locator('body')).toContainText('does not meet this requirement')
  })
})

test.describe('Expertise Directory — eligible active member', () => {
  let userId: string
  let entryId: string

  test.beforeAll(async () => {
    userId = getAuth().userId
    await prisma.member.update({
      where: { userId },
      data: { membershipType: 'life', memberStatus: 'active' },
    })
  })

  test.afterAll(async () => {
    await prisma.expertiseProfile.deleteMany({ where: { member: { userId } } })
    await prisma.member.update({
      where: { userId },
      data: { membershipType: null, memberStatus: null },
    })
    await prisma.$disconnect()
  })

  test('POST /api/expertise registers an entry', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.post('/api/expertise', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { organization: 'OSA', categories: ['Technology'], blurb: 'I build community web apps.' },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.profile).toHaveProperty('id')
    entryId = body.profile.id
  })

  test('entry appears in directory listing', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.get('/api/expertise', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.results.some((r: { id: string }) => r.id === entryId)).toBe(true)
  })

  test('category filter narrows results', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.get('/api/expertise?category=Healthcare', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.results.some((r: { id: string }) => r.id === entryId)).toBe(false)
  })

  test('directory page renders the registered entry', async ({ page }) => {
    await page.goto('/membership/expertise')
    await expect(page.locator('body')).toContainText('I build community web apps.')
  })

  test('POST /api/expertise again returns 409 (duplicate entry)', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.post('/api/expertise', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { categories: ['Technology'], blurb: 'Second entry attempt should fail.' },
    })
    expect(res.status()).toBe(409)
  })

  test('PATCH /api/expertise/[id] updates own entry', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.patch(`/api/expertise/${entryId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { blurb: 'Updated blurb for my expertise entry.' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.profile.blurb).toBe('Updated blurb for my expertise entry.')
  })

  test('non-admin cannot set isHidden via PATCH', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.patch(`/api/expertise/${entryId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { isHidden: true },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.profile.isHidden).toBe(false)
  })

  test('DELETE /api/expertise/[id] removes own entry', async ({ request }) => {
    const { accessToken } = getAuth()
    const res = await request.delete(`/api/expertise/${entryId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status()).toBe(204)
  })
})

// Admin moderation (hide/unhide, delete from /admin/expertise) requires promoting the
// E2E test user to the admin role, which is outside the scope of automated setup here —
// mirrors the skipped admin-route coverage in memberships.spec.ts.
test.describe('Expertise Directory — admin moderation (skipped: requires admin role promotion)', () => {
  test.skip('Admin hides an entry — disappears from public listing, remains in /admin/expertise', async () => {
    // Requires: admin JWT + existing expertise entry
  })
})
