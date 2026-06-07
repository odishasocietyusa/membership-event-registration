import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { TEST_USER_EMAIL as DEFAULT_TEST_USER_EMAIL } from './global-setup'

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? DEFAULT_TEST_USER_EMAIL

function getAccessToken(): string {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { accessToken: string }
  return accessToken
}

// This project loads .auth/user.json storage state — browser navigation is authenticated

test.describe('Dashboard (authenticated)', () => {
  test('renders dashboard heading', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('no redirect to login when authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('Navigation bar (authenticated member, SPEC-15 redesign)', () => {
  test('shows authenticated-only menu items', async ({ page }) => {
    await page.goto('/dashboard')
    const nav = page.locator('nav')

    // Members — items gated behind isAuthed
    await expect(nav.locator('a[href="/membership"]')).toHaveText('Membership Types')
    await expect(nav.locator('a[href="/members/search"]')).toHaveText('Member Directory')
    await expect(nav.locator('a[href="/profile"]', { hasText: 'Member Profile' })).toHaveCount(1)
    await expect(nav.locator('a[href="/obituary"]')).toHaveCount(1)

    // "Upgrade Membership" links into /dashboard per design §1
    await expect(nav.locator('a[href="/dashboard"]', { hasText: 'Upgrade Membership' })).toHaveCount(1)

    // Events — full item now visible
    await expect(nav.locator('a[href="/events"]')).toHaveText('Events')

    // Chapters — Chapter Executives now visible (BOG Documents stays domain-restricted)
    await expect(nav.locator('a[href="/chapters/executives"]')).toHaveCount(1)
  })

  test('utility bar shows Dashboard, name, and Sign Out — not Sign In/Register', async ({ page }) => {
    await page.goto('/dashboard')
    const nav = page.locator('nav')

    await expect(nav.locator('span a[href="/dashboard"]')).toHaveCount(1)
    await expect(nav.locator('span a[href="/profile"]')).toHaveCount(1)
    await expect(nav.locator('form[action="/api/auth/signout"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/login"]')).toHaveCount(0)
    await expect(nav.locator('a[href="/register"]')).toHaveCount(0)
  })

  test('Admin dropdown is hidden for a non-admin member', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('nav summary', { hasText: 'Admin' })).toHaveCount(0)
  })
})

test.describe('Authenticated API routes', () => {
  test('GET /api/auth/me returns the logged-in member', async ({ request }) => {
    const token = getAccessToken()
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('user')
    expect(body.user).toHaveProperty('email', TEST_USER_EMAIL)
  })

  test('GET /api/members/me returns member record', async ({ request }) => {
    const token = getAccessToken()
    const res = await request.get('/api/members/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('member')
  })
})
