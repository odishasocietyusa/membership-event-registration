// lib/auth/supabase-admin.ts
// Exports a singleton Supabase admin client using the service role key (bypasses RLS).
// Must never be imported in middleware.ts or any client component.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    'Missing required environment variables: ' +
      (!supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL ' : '') +
      (!serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '')
  )
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
