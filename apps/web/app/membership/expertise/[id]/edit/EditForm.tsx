'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { EXPERTISE_CATEGORIES } from '@/lib/expertise/constants'
import type { ExpertiseProfilePublic } from '@/lib/expertise/expertise-profile-service'

function extractError(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object' && 'formErrors' in err) {
      const fe = (err as { formErrors: string[] }).formErrors
      if (fe.length > 0) return fe.join(', ')
      return 'Please check your form inputs and try again.'
    }
  }
  return 'Something went wrong.'
}

export default function EditForm({ profile }: { profile: ExpertiseProfilePublic }) {
  const router = useRouter()
  const [organization, setOrganization] = useState(profile.organization ?? '')
  const [categories, setCategories] = useState<string[]>(profile.categories)
  const [blurb, setBlurb] = useState(profile.blurb)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    )
  }

  async function getToken() {
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const token = await getToken()
      if (!token) { setError('You must be logged in.'); return }

      const res = await fetch(`/api/expertise/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organization: organization || undefined,
          categories,
          blurb,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(extractError(data))
        return
      }

      router.push('/membership/expertise')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Remove your expertise entry? This cannot be undone.')) return
    setDeleting(true)

    try {
      const token = await getToken()
      if (!token) { setError('You must be logged in.'); return }

      const res = await fetch(`/api/expertise/${profile.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(extractError(data))
        return
      }

      router.push('/membership/expertise')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          Organization (optional)
          <input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            maxLength={200}
          />
        </label>
      </div>

      <fieldset>
        <legend>Areas of Expertise</legend>
        {EXPERTISE_CATEGORIES.map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={categories.includes(c)}
              onChange={() => toggleCategory(c)}
            />
            {' '}{c}
          </label>
        ))}
      </fieldset>

      <div>
        <label>
          Blurb (10-500 characters)
          <textarea
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            maxLength={500}
            rows={5}
            required
          />
        </label>
        <p>{blurb.length}/500</p>
      </div>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Save Changes'}
      </button>
      {' '}
      <button type="button" onClick={handleDelete} disabled={deleting}>
        {deleting ? 'Removing...' : 'Remove Entry'}
      </button>
    </form>
  )
}
