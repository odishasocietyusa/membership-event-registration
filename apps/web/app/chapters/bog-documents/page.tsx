import { redirect } from 'next/navigation'
import { PortableText } from '@portabletext/react'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function BogDocumentsPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const { user } = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  }).then(r => r.json())

  if (!user?.email?.endsWith('@odishasociety.org')) {
    return (
      <main>
        <h1>Access Restricted</h1>
        <p>This page is available only to OSA staff with an @odishasociety.org email address.</p>
      </main>
    )
  }

  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'chapters-bog-documents' })
  if (!page) return <main><h1>BOG Documents</h1><p>Coming soon.</p></main>
  return <main><h1>{page.title}</h1><PortableText value={page.body} /></main>
}
