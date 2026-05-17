import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const revalidate = 60

export default async function OdishaDevelopmentPage() {
  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'activities-odisha-development' })
  if (!page) return <main><h1>Odisha Development</h1><p>Coming soon.</p></main>
  return <main><h1>{page.title}</h1><PortableText value={page.body} /></main>
}
