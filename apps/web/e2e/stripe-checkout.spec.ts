import { test, expect } from '@playwright/test'

test.describe('Stripe E2E Subscription Checkout Flow', () => {
  test('should complete membership registration and Stripe mock checkout', async ({ page }) => {
    const baseURL = test.info().project.use.baseURL || 'http://localhost:3000'
    console.log(`🚀 Stripe spec starting against baseURL: ${baseURL}`)

    // 1. Navigate to the /register page as an authenticated user
    await page.goto('/register')
    
    // We expect the page to bootstrap and determine the starting step.
    // If the user profile is completely empty, it will start on Step 2 (Personal Info)
    // If it's already filled, it will jump to Step 5.
    const heading = page.locator('h2')
    await expect(heading).toBeVisible({ timeout: 15_000 })
    const headingText = await heading.textContent()
    console.log(`   └─ Registration landed on step heading: "${headingText}"`)

    if (headingText?.includes('Personal information')) {
      // 📝 STEP 2: Fill Personal Information
      console.log(`📝 Filling Step 2: Personal Information...`)
      await page.fill('#firstName', 'E2EFirst')
      await page.fill('#lastName', 'E2ELast')
      await page.fill('#phone', '+12065550199')
      await page.click('button[type="submit"]') // Submit step 2

      // 📝 STEP 3: Family Information (Optional)
      console.log(`📝 Skipping Step 3: Family Information...`)
      await expect(page.locator('h2')).toContainText('Family information', { timeout: 10_000 })
      await page.click('button[type="submit"]') // Submit step 3 (skip optional fields)

      // 📝 STEP 4: Mailing Address
      console.log(`📝 Filling Step 4: Mailing Address...`)
      await expect(page.locator('h2')).toContainText('Mailing address', { timeout: 10_000 })
      await page.fill('#street', '100 Playwright Blvd')
      await page.fill('#city', 'Seattle')
      await page.selectOption('#state', 'WA')
      await page.fill('#zip', '98101')
      await page.click('button[type="submit"]') // Submit step 4
    }

    // 📝 STEP 5: Choose Membership Type & Proceed to Payment
    console.log(`📝 Reached Step 5: Choose Membership...`)
    await expect(page.locator('h2')).toContainText('Choose your membership', { timeout: 10_000 })

    // Check the Single Annual Membership radio button
    await page.check('input[value="annualSingle"]')
    console.log(`   └─ Checked: annualSingle`)

    // Click Proceed to Payment
    const paymentButton = page.locator('button:has-text("Proceed to Payment")')
    await expect(paymentButton).toBeEnabled()
    
    // We expect a redirection to Stripe Checkout.
    console.log(`💳 Triggering checkout. Waiting for Stripe redirection...`)
    await Promise.all([
      page.waitForURL(/.*stripe.com.*/, { timeout: 30_000 }),
      paymentButton.click()
    ])

    console.log(`✅ Redirected successfully to Stripe Checkout page: ${page.url()}`)

    // 💳 INTERACT WITH STRIPE CHECKOUT FORM
    // Wait for the secure checkout page elements to load
    await page.waitForLoadState('load')

    console.log(`📥 Locating Stripe Elements Card fields...`)

    // Fill the email field if visible (Stripe pre-fills from customer object when possible)
    const emailInput = page.locator('input[type="email"][autocomplete="email"]')
    if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emailInput.fill('e2e@playwright.test')
    }

    // Stripe Checkout (hosted) renders card inputs inside named iframes for PCI compliance.
    // Each field lives in its own iframe identified by its title attribute.
    const cardNumberFrame = page.frameLocator('iframe[title="Secure card number input frame"]')
    const cardExpiryFrame = page.frameLocator('iframe[title="Secure expiry date input frame"]')
    const cardCvcFrame    = page.frameLocator('iframe[title="Secure CVC input frame"]')

    await cardNumberFrame.locator('input[name="cardnumber"]').fill('4242 4242 4242 4242')
    await cardExpiryFrame.locator('input[name="exp-date"]').fill('12 / 30')
    await cardCvcFrame.locator('input[name="cvc"]').fill('123')

    console.log(`💳 Mock credit card details entered. Submitting transaction...`)

    // Submit mock payment
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeEnabled()
    
    // Clicking pay will process and redirect back to our app (dashboard or register success)
    await Promise.all([
      page.waitForURL(new RegExp(baseURL), { timeout: 45_000 }),
      submitButton.click()
    ])

    console.log(`🎉 Redirection back to portal completed! URL resolved to: ${page.url()}`)
    
    // Assert redirect lands back on dashboard or a registration confirmation state
    await expect(page).toHaveURL(/\/(dashboard|register)/)
  })
})
