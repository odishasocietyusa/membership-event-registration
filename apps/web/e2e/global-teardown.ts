import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

export default async function globalTeardown() {
  const testUserFile = path.resolve(__dirname, '../.auth/test-user.json')
  if (!fs.existsSync(testUserFile)) return

  const { id } = JSON.parse(fs.readFileSync(testUserFile, 'utf-8')) as { id: string }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin.auth.admin.deleteUser(id)
  fs.rmSync(path.resolve(__dirname, '../.auth'), { recursive: true, force: true })
}
