import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { ABOUT_PAGE_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const revalidate = 60

export default async function AboutPage() {
  const page = await sanityFetch<SanityStaticPage>(ABOUT_PAGE_QUERY)

  if (!page) {
    return (
      <main>
        <h1>About OSA</h1>
        <p>Content coming soon.</p>
      </main>
    )
  }

  return (
    <main>
      <h1>{page.title}</h1>
      <PortableText value={page.body} />
    </main>
  )
}
