import type { Metadata } from 'next'
import './globals.css'
import NavBar from './components/nav-bar'
import { getCurrentMember } from '@/lib/auth/get-current-member'

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
    const result = await getCurrentMember()
    user = result?.member ?? null
  } catch (err) {
    console.error('[layout] getCurrentMember failed:', err)
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
