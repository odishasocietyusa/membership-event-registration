import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { TEST_USER_EMAIL } from './global-setup'

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
