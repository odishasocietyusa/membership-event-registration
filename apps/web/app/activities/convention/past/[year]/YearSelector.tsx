'use client'

import { useRouter } from 'next/navigation'
import type { SanityConventionYear } from '@/types/sanity'

export default function YearSelector({
  years,
  currentYear,
}: {
  years: SanityConventionYear[]
  currentYear: number | null
}) {
  const router = useRouter()

  if (years.length === 0) return null

  return (
    <select
      value={currentYear ?? ''}
      onChange={(e) => router.push(`/activities/convention/past/${e.target.value}`)}
    >
      {years.map(({ year }) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  )
}
