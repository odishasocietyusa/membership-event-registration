import { test, expect } from '@playwright/test'

test.describe('Public pages', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('OSA Community Platform')
  })

  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Sign in to OSA')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toContainText('Sign in')
  })

  test('register page renders step 1', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('h1')).toContainText('Create your OSA account')
    await expect(page.locator('text=Step 1 of 4')).toBeVisible()
    await expect(page.locator('h2')).toContainText('Step 1: Create account')
  })

  test('forgot password page renders form', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.locator('h1')).toContainText('Reset your password')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toContainText('Send reset link')
  })

  test('about page renders', async ({ page }) => {
    await page.goto('/about')
    // Content comes from Sanity — either the fetched title or the fallback
    await expect(page.locator('h1')).toBeVisible()
  })
})
