'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { EXPERTISE_CATEGORIES } from '@/lib/expertise/constants'

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

export default function RegisterForm() {
  const router = useRouter()
  const [organization, setOrganization] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [blurb, setBlurb] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in.')
        return
      }

      const res = await fetch('/api/expertise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
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
        <legend>Areas of Expertise (select at least one)</legend>
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
        {submitting ? 'Registering...' : 'Register'}
      </button>
    </form>
  )
}
