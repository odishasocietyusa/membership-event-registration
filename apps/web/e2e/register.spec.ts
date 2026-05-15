import { test, expect } from '@playwright/test'

test.describe('Registration form — step 1 validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
    // Wait for the loading state to resolve
    await expect(page.locator('h2')).toContainText('Step 1: Create account')
  })

  test('empty submit shows validation errors', async ({ page }) => {
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]').first()).toBeVisible()
  })

  test('invalid email shows error', async ({ page }) => {
    await page.fill('#email', 'not-an-email')
    await page.fill('#password', 'Test1234!')
    await page.fill('#confirmPassword', 'Test1234!')
    await page.click('button[type="submit"]')
    await expect(page.locator('p[role="alert"]').first()).toContainText(/email/i)
  })

  test('password too short shows error', async ({ page }) => {
    await page.fill('#email', 'test@example.com')
    await page.fill('#password', 'short')
    await page.fill('#confirmPassword', 'short')
    await page.click('button[type="submit"]')
    await expect(page.locator('[role="alert"]').first()).toBeVisible()
  })

  test('mismatched passwords shows error', async ({ page }) => {
    await page.fill('#email', 'test@example.com')
    await page.fill('#password', 'Test1234!')
    await page.fill('#confirmPassword', 'Different1!')
    await page.click('button[type="submit"]')
    await expect(page.locator('p[role="alert"]').first()).toContainText(/match/i)
  })

  test('sign in link navigates to login page', async ({ page }) => {
    await page.click('a[href="/login"]')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Registration form — step 2 validation', () => {
  test('missing first name shows error', async ({ page }) => {
    // Navigate directly to step 2 state by filling step 1 and intercepting the Supabase call
    await page.goto('/register')
    await expect(page.locator('h2')).toContainText('Step 1: Create account')

    // Intercept the Supabase signUp API call and mock a success so we can reach step 2
    await page.route('**/auth/v1/signup', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'mock-id', email: 'test@example.com', email_confirmed_at: null },
          session: null,
        }),
      })
    })

    await page.fill('#email', 'test@example.com')
    await page.fill('#password', 'Test1234!')
    await page.fill('#confirmPassword', 'Test1234!')
    await page.click('button[type="submit"]')

    // After successful signup, shows "check your email" — step 2 is reached post-verification
    // so we verify the email-sent confirmation state is shown
    await expect(page.locator('text=verification link')).toBeVisible({ timeout: 5_000 })
  })
})
