'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

const SPECIALIZATIONS = [
  'Odissi Dance',
  'Odissi Song',
  'Odia Art',
  'Odia Language',
  'Other',
]

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
  const [bio, setBio] = useState('')
  const [specializations, setSpecializations] = useState<string[]>([])
  const [onlineClasses, setOnlineClasses] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleSpec(s: string) {
    setSpecializations((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
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

      const res = await fetch('/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bio,
          specializations,
          onlineClasses,
          displayName: displayName || undefined,
          phone: phone || undefined,
          websiteUrl: websiteUrl || undefined,
          photoUrl: photoUrl || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(extractError(data))
        return
      }

      router.push('/services')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>
          Display Name / Business Name (optional)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Priya's Dance Studio or leave blank to use your member name"
          />
        </label>
      </div>

      <div>
        <label>
          Bio (min 10, max 1000 characters)
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={1000}
            rows={5}
            required
          />
        </label>
      </div>

      <fieldset>
        <legend>Specializations (select at least one)</legend>
        {SPECIALIZATIONS.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={specializations.includes(s)}
              onChange={() => toggleSpec(s)}
            />
            {' '}{s}
          </label>
        ))}
      </fieldset>

      <div>
        <label>
          <input
            type="checkbox"
            checked={onlineClasses}
            onChange={(e) => setOnlineClasses(e.target.checked)}
          />
          {' '}I offer online classes
        </label>
      </div>

      <div>
        <label>
          Phone (optional)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            type="tel"
          />
        </label>
      </div>

      <div>
        <label>
          Website URL (optional)
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            type="url"
            placeholder="https://..."
          />
        </label>
      </div>

      <div>
        <label>
          Profile Photo URL (optional — paste a public link e.g. from Google Drive)
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            type="url"
            placeholder="https://..."
          />
        </label>
      </div>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Registering...' : 'Register'}
      </button>
    </form>
  )
}
