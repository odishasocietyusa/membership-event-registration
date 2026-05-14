import { sanityFetch } from '@/sanity/lib/client'
import { ALL_LEADERSHIP_QUERY } from '@/sanity/lib/queries'
import type { SanityLeadershipProgram } from '@/types/sanity'

export const revalidate = 60

export default async function LeadershipProgramPage() {
  const records =
    (await sanityFetch<SanityLeadershipProgram[]>(ALL_LEADERSHIP_QUERY)) ?? []

  const byYear = records.reduce<Record<number, SanityLeadershipProgram[]>>((acc, r) => {
    ;(acc[r.year] ??= []).push(r)
    return acc
  }, {})

  const sortedYears = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a)

  return (
    <main>
      <h1>Leadership Program</h1>
      {sortedYears.length === 0 ? (
        <p>No records found.</p>
      ) : (
        sortedYears.map((year) => (
          <section key={year}>
            <h2>{year}</h2>
            <ul>
              {byYear[year].map((r) => (
                <li key={r._id}>
                  {r.recipient_name} — {r.program_name} ({r.chapter})
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
