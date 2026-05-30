import { test, expect } from '@playwright/test'

test.describe('Dynamic Sitemap Page Crawler & Console Auditor', () => {
  const MAX_DEPTH = 3

  test('should crawl public routes and assert zero console exceptions', async ({ page }) => {
    // Declare inside the test so state resets correctly on retry
    const visited = new Set<string>()
    const errors: string[] = []

    // 1. Hook up listeners for unhandled exceptions and console errors
    page.on('pageerror', (exception) => {
      const msg = `🚨 JS Unhandled Exception: ${exception.message}\nStack: ${exception.stack}`
      console.error(msg)
      errors.push(msg)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const errorText = msg.text()
        // Filter out benign or external errors (e.g. third-party Stripe load logs, standard favicons)
        if (!errorText.includes('favicon.ico') && !errorText.includes('chrome-extension')) {
          const formatted = `❌ Browser Console Error: ${errorText}`
          console.error(formatted)
          errors.push(formatted)
        }
      }
    })

    // 2. Resolve target domain baseURL
    const baseURL = test.info().project.use.baseURL || 'http://localhost:3000'
    console.log(`🔍 Crawler initialized targeting Base URL: ${baseURL}`)

    // 3. Recursive crawling algorithm
    async function crawl(urlPath: string, depth: number) {
      // Normalize URL path and verify boundary conditions
      const fullUrl = new URL(urlPath, baseURL).toString()
      if (visited.has(fullUrl) || depth > MAX_DEPTH) return

      visited.add(fullUrl)
      console.log(`🌐 Crawling Level ${depth}: ${fullUrl}`)

      // Navigate and retrieve page response
      const response = await page.goto(fullUrl, { waitUntil: 'load', timeout: 15_000 })
      
      // Assert page successfully loaded without 4xx/5xx status
      if (response) {
        const status = response.status()
        console.log(`   └─ Response Status: ${status}`)
        expect(status, `Page ${fullUrl} returned non-success status ${status}`).toBeLessThan(400)
      } else {
        throw new Error(`Failed to retrieve response for URL: ${fullUrl}`)
      }

      // Gather all local anchor links on the current page
      const anchors = await page.locator('a[href]').all()
      const pathsToCrawl: string[] = []

      for (const anchor of anchors) {
        const href = await anchor.getAttribute('href')
        if (!href) continue

        // Exclude external anchors, hashes, and mailto/tel protocols
        if (
          href.startsWith('#') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('javascript:') ||
          href.includes('stripe.com') || // Skip Stripe redirects in public crawl
          href.includes('sanity.io')
        ) {
          continue
        }

        try {
          const resolved = new URL(href, baseURL)
          // Ensure we stay within our own target base domain
          if (resolved.origin === new URL(baseURL).origin) {
            pathsToCrawl.push(resolved.pathname)
          }
        } catch {
          // Ignore invalid URL structures
        }
      }

      // Recursively crawl unique discovered links
      for (const nextPath of pathsToCrawl) {
        await crawl(nextPath, depth + 1)
      }
    }

    // 4. Begin crawl at the landing page path
    await crawl('/', 0)

    // 5. Final report summaries and assertions
    console.log(`\n📊 Crawl Summary:`)
    console.log(`   - Visited Pages count: ${visited.size}`)
    visited.forEach(u => console.log(`     └─ ${u}`))

    if (errors.length > 0) {
      console.error(`\n🚨 Crawler audit failed due to browser console exceptions:`)
      errors.forEach(e => console.error(`   - ${e}`))
    }

    expect(errors.length, `Expected 0 unhandled console errors or exceptions. Found:\n${errors.join('\n')}`).toBe(0)
  })
})
