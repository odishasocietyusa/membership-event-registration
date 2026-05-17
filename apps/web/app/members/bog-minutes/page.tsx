import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  return <main><h1>BOG Meeting Minutes</h1><p>Coming soon.</p></main>
}
