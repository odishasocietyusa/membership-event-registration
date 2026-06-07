import { notFound } from 'next/navigation'
import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const revalidate = 60

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug })

  if (!page) {
    notFound()
  }

  return (
    <main>
      <h1>{page.title}</h1>
      <PortableText value={page.body} />
    </main>
  )
}
