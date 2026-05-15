import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

export const TEST_USER_EMAIL = 'e2e-test@playwright.local'
export const TEST_USER_PASSWORD = 'Test1234!'

export default async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Clean up any leftover test user from a previous run
  const { data: { users } } = await admin.auth.admin.listUsers()
  const existing = users.find((u) => u.email === TEST_USER_EMAIL)
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id)
  }

  // Create a pre-confirmed test user (no email verification needed)
  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`globalSetup: failed to create test user — ${error?.message}`)
  }

  // Persist user ID so globalTeardown can delete it, and sign in to get access token
  const { data: signInData, error: signInError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_USER_EMAIL,
  })
  // Get an access token via password sign-in using the anon key
  const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData } = await anonClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  })
  void signInData
  void signInError

  const authDir = path.resolve(__dirname, '../.auth')
  fs.mkdirSync(authDir, { recursive: true })
  fs.writeFileSync(
    path.join(authDir, 'test-user.json'),
    JSON.stringify({
      id: data.user.id,
      accessToken: sessionData.session?.access_token ?? '',
    })
  )

  // Log in via the UI and save storage state for the "member" project
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('http://localhost:3000/login')
  await page.fill('#email', TEST_USER_EMAIL)
  await page.fill('#password', TEST_USER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 15_000 })

  await context.storageState({ path: path.join(authDir, 'user.json') })
  await browser.close()
}
