import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from './global-setup'

test.describe('Login form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('empty submit shows required field errors', async ({ page }) => {
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]').first()).toBeVisible()
  })

  test('invalid email shows validation error', async ({ page }) => {
    await page.fill('#email', 'not-an-email')
    await page.fill('#password', 'anything')
    await page.click('button[type="submit"]')
    await expect(page.locator('p[role="alert"]').first()).toContainText(/valid email/i)
  })

  test('wrong credentials shows error message', async ({ page }) => {
    await page.fill('#email', 'wrong@example.com')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(page.locator('p[role="alert"]').first()).toContainText(/Invalid email or password/i, { timeout: 10_000 })
  })

  test('forgot password link navigates correctly', async ({ page }) => {
    await page.click('a[href="/auth/forgot-password"]')
    await expect(page).toHaveURL(/forgot-password/)
    await expect(page.locator('h1')).toContainText('Reset your password')
  })

  test('register link navigates to register page', async ({ page }) => {
    await page.click('a[href="/register"]')
    await expect(page).toHaveURL(/register/)
  })
})

test.describe('Auth redirect (middleware)', () => {
  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Successful login', () => {
  test('valid credentials redirect to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', TEST_USER_EMAIL)
    await page.fill('#password', TEST_USER_PASSWORD)
    await page.click('button[type="submit"]')
    // New test users without a complete profile land on /register, not /dashboard.
    await expect(page).toHaveURL(/\/(dashboard|register)/, { timeout: 10_000 })
  })
})
