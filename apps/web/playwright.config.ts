import { defineConfig } from '@playwright/test'

const targetBaseURL = process.env.BASE_URL || 'http://localhost:3000'
const isRemote = !!process.env.BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: targetBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'guest',
      testMatch: [
        '**/public.spec.ts',
        '**/auth.spec.ts',
        '**/register.spec.ts',
        '**/api.spec.ts',
        '**/crawler.spec.ts', // 🟢 Dynamic page crawler (anonymous context)
      ],
    },
    {
      name: 'member',
      testMatch: [
        '**/dashboard.spec.ts',
        '**/memberships.spec.ts',
        '**/payments.spec.ts',
        '**/stripe-checkout.spec.ts', // 🟢 Stripe Elements mock payment (authenticated context)
      ],
      use: {
        storageState: '.auth/user.json',
      },
    },
  ],

  // ⚠️ Only spin up the local Next.js dev server if we are running in local mode
  webServer: isRemote
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
