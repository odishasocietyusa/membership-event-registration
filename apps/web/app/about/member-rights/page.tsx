import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const revalidate = 60

export default async function MemberRightsPage() {
  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'about-member-rights' })
  if (!page) return <main><h1>Member Rights &amp; Privileges</h1><p>Coming soon.</p></main>
  return <main><h1>{page.title}</h1><PortableText value={page.body} /></main>
}
