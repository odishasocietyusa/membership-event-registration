import { redirect } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_CONVENTION_YEARS_QUERY } from '@/sanity/lib/queries'
import type { SanityConventionYear } from '@/types/sanity'

export const revalidate = 60

export default async function PastConventionsIndexPage() {
  const years = (await sanityFetch<SanityConventionYear[]>(ALL_CONVENTION_YEARS_QUERY)) ?? []

  if (years.length === 0) {
    return (
      <main>
        <h1>Past Conventions</h1>
        <p>No past conventions have been published yet.</p>
      </main>
    )
  }

  redirect(`/activities/convention/past/${years[0].year}`)
}
