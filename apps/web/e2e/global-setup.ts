import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// Default local sandbox credentials — exported so specs can reference the expected email
export const TEST_USER_EMAIL = 'e2e-test@playwright.local'
export const TEST_USER_PASSWORD = 'Test1234!'
export const DEFAULT_TEST_USER_EMAIL = TEST_USER_EMAIL
export const DEFAULT_TEST_USER_PASSWORD = TEST_USER_PASSWORD

export default async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

  const customEmail = process.env.TEST_USER_EMAIL
  const customPassword = process.env.TEST_USER_PASSWORD
  const isRemoteMode = !!customEmail

  const email = customEmail || DEFAULT_TEST_USER_EMAIL
  const password = customPassword || DEFAULT_TEST_USER_PASSWORD

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const authDir = path.resolve(__dirname, '../.auth')
  fs.mkdirSync(authDir, { recursive: true })

  let userId = ''
  let accessToken = ''

  if (isRemoteMode) {
    console.log(`🔑 Dynamic Remote Mode: Authenticating E2E user ${email} against remote Supabase: ${supabaseUrl}`)
    
    if (!supabaseUrl || !anonKey) {
      throw new Error('globalSetup: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be provided for dynamic remote authentication.')
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !sessionData.user || !sessionData.session) {
      throw new Error(`globalSetup (remote): failed to sign in dynamic test user — ${signInError?.message}`)
    }

    userId = sessionData.user.id
    accessToken = sessionData.session.access_token

    // Write metadata to .auth/test-user.json with isRemote flag so global-teardown knows not to delete it
    fs.writeFileSync(
      path.join(authDir, 'test-user.json'),
      JSON.stringify({
        id: userId,
        accessToken,
        isRemote: true, // ⚠️ Safety flag
      })
    )
  } else {
    console.log(`🔌 Local Sandbox Mode: Provisioning temporary E2E user ${email} in local Supabase database`)

    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new Error('globalSetup: Supabase config and Admin Service Key must be available in local mode.')
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Clean up any leftover test user from a previous run
    const { data: { users } } = await admin.auth.admin.listUsers()
    const existing = users.find((u) => u.email === email)
    if (existing) {
      await admin.auth.admin.deleteUser(existing.id)
    }

    // Create a pre-confirmed test user (no email verification needed)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) {
      throw new Error(`globalSetup: failed to create test user — ${error?.message}`)
    }

    // Get an access token via password sign-in using the anon key
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: sessionData } = await anonClient.auth.signInWithPassword({
      email,
      password,
    })

    userId = data.user.id
    accessToken = sessionData.session?.access_token ?? ''

    fs.writeFileSync(
      path.join(authDir, 'test-user.json'),
      JSON.stringify({
        id: userId,
        accessToken,
        isRemote: false,
      })
    )
  }

  // Log in via the UI and save storage state for the "member" project
  console.log(`🌐 Navigating browser to capture storageState at: ${baseURL}/login`)
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${baseURL}/login`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  
  // Wait for redirect to dashboard or register (cookies are set for both)
  await page.waitForURL(/\/(dashboard|register)/, { timeout: 15_000 })

  await context.storageState({ path: path.join(authDir, 'user.json') })
  await browser.close()
  console.log(`✅ Authentication state captured and written to .auth/user.json`)
}
