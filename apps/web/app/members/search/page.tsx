import { redirect } from 'next/navigation'
import { PortableText } from '@portabletext/react'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function MemberSearchPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'members-search' })
  if (!page) return <main><h1>Member Search</h1><p>Coming soon.</p></main>
  return <main><h1>{page.title}</h1><PortableText value={page.body} /></main>
}
