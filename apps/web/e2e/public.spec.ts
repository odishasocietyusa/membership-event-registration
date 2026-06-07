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

test.describe('Navigation bar (guest, SPEC-15 redesign)', () => {
  test('shows the redesigned primary menus and their public items', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav')

    // About Us — relabeled / split items
    await expect(nav.locator('summary', { hasText: 'About Us' })).toBeVisible()
    await expect(nav.locator('a[href="/about/vision-mission"]')).toHaveText('Mission & Vision')
    await expect(nav.locator('a[href="/about/policy-documents"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/about/forms"]')).toHaveCount(1)

    // Members — public items only for a guest
    await expect(nav.locator('summary', { hasText: 'Members' })).toBeVisible()
    await expect(nav.locator('a[href="/members/benefits"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/about/member-rights"]')).toHaveText('Statement of Member Rights & Privileges')

    // Events (renamed from Activities) — only the two public items for a guest
    await expect(nav.locator('summary', { hasText: 'Events' })).toBeVisible()
    await expect(nav.locator('a[href="/activities/convention"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/activities/awards"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/events"]')).toHaveCount(0)

    // Programs — new Sanity-driven menu
    await expect(nav.locator('summary', { hasText: 'Programs' })).toBeVisible()

    // Chapters — public item only
    await expect(nav.locator('a[href="/chapters"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/chapters/executives"]')).toHaveCount(0)
    await expect(nav.locator('a[href="/chapters/bog-documents"]')).toHaveCount(0)

    // Donate — promoted to a standalone primary item
    await expect(nav.locator('a[href="/donate"]')).toHaveCount(1)

    // Admin dropdown must not render for a guest
    await expect(nav.locator('summary', { hasText: 'Admin' })).toHaveCount(0)
  })

  test('utility bar shows Sign In / Register and hides authenticated-only links', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav')

    await expect(nav.locator('a[href="/login"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/register"]')).toHaveCount(1)
    await expect(nav.locator('a[href="/dashboard"]')).toHaveCount(0)
    await expect(nav.locator('a[href="/profile"]')).toHaveCount(0)
    await expect(nav.locator('form[action="/api/auth/signout"]')).toHaveCount(0)
  })
})

test.describe('Navigation redirects (NFR-04 — no broken links)', () => {
  // Note: the /programs/[slug] destinations below 404 until their static_page
  // Sanity docs are authored (see 03-implementation.md §5 — a content task, not
  // a code defect). These tests assert the redirect itself fired correctly
  // (the thing this spec is responsible for), not the destination's content status.
  test('migrated /activities/* routes redirect to /programs/*', async ({ page }) => {
    await page.goto('/activities/odia-learning')
    await expect(page).toHaveURL(/\/programs\/odia-learning/)
  })

  test('/about/contact redirects to the home page', async ({ page }) => {
    const response = await page.goto('/about/contact')
    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/$/)
  })

  test('/about/committees redirects to /programs/osa-committees', async ({ page }) => {
    await page.goto('/about/committees')
    await expect(page).toHaveURL(/\/programs\/osa-committees/)
  })

  test('Annual Convention and Awards keep their original routes (not migrated)', async ({ page }) => {
    const conventionResponse = await page.goto('/activities/convention')
    expect(conventionResponse?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/activities\/convention/)

    const awardsResponse = await page.goto('/activities/awards')
    expect(awardsResponse?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/activities\/awards/)
  })
})

test.describe('New SPEC-15 stub pages render without 404', () => {
  // These are static "Coming soon" stubs — they render 200 regardless of whether
  // their backing static_page Sanity doc has been authored yet.
  for (const path of ['/about/policy-documents', '/about/forms']) {
    test(`${path} returns 200`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('h1')).toBeVisible()
    })
  }

  test('/programs/[slug] 404s for an unknown slug (route wiring is correct)', async ({ page }) => {
    const response = await page.goto('/programs/this-slug-does-not-exist')
    expect(response?.status()).toBe(404)
  })
})
