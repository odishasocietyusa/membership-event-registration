import type { Metadata } from 'next'
import './globals.css'
import NavBar from './components/nav-bar'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export const metadata: Metadata = {
  title: 'OSA Community Platform',
  description: 'The Odisha Society of the Americas - Community Platform',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  let user = null
  try {
    const supabase = await createSupabaseServer()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const body = await res.json()
        user = body.user ?? null
      }
    }
  } catch {
    // Nav renders as unauthenticated if session lookup fails
  }

  return (
    <html lang="en">
      <body className="antialiased">
        <NavBar user={user} />
        {children}
      </body>
    </html>
  )
}
