import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

export default async function globalTeardown() {
  const testUserFile = path.resolve(__dirname, '../.auth/test-user.json')
  if (!fs.existsSync(testUserFile)) return

  const { id, isRemote } = JSON.parse(fs.readFileSync(testUserFile, 'utf-8')) as { id: string; isRemote?: boolean }

  const authDir = path.resolve(__dirname, '../.auth')

  if (isRemote) {
    console.log(`🧹 Teardown: Remote Mode detected. Skipping dynamic database user deletion for safety.`)
  } else {
    console.log(`🧹 Teardown: Local Sandbox Mode detected. Deleting temporary E2E user ${id} from local database.`)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await admin.auth.admin.deleteUser(id)
    }
  }

  // Always clean up local files
  fs.rmSync(authDir, { recursive: true, force: true })
  console.log(`✅ Temporary E2E auth directory cleaned up.`)
}
