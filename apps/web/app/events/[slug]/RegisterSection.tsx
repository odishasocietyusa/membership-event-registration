'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

export interface RegisterSectionProps {
  sanityEventId:       string
  slug:                string
  accessLevel:         'membersOnly' | 'openToAll'
  registrationFee:     number
  guestCountEnabled:   boolean
  isSoldOut:           boolean
  isAlreadyRegistered: boolean
  memberStatus:        string | null
  isAuthenticated:     boolean
}

function extractError(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object' && 'formErrors' in err) {
      return (err as { formErrors: string[] }).formErrors.join(', ') || 'Check your inputs.'
    }
  }
  return 'Something went wrong. Please try again.'
}

function GuestCountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label>
        Additional guests joining you (not counting yourself)
        <br />
        <input
          type="number"
          min={0}
          max={20}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
      </label>
    </div>
  )
}

function MemberRegisterButton({
  sanityEventId,
  registrationFee,
  guestCountEnabled,
}: {
  sanityEventId:    string
  registrationFee:  number
  guestCountEnabled: boolean
}) {
  const [guestCount, setGuestCount] = useState(0)
  const [error,      setError]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Your session has expired. Please log in again.')
        return
      }

      const res = await fetch(`/api/events/${sanityEventId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ guestCount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(extractError(data)); return }
      if (data.url)           window.location.href = data.url
      else if (data.redirect) window.location.href = data.redirect
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {guestCountEnabled && (
        <GuestCountInput value={guestCount} onChange={setGuestCount} />
      )}
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting
          ? 'Registering...'
          : registrationFee > 0
          ? `Register — $${registrationFee}`
          : 'Register (Free)'}
      </button>
    </form>
  )
}

export default function RegisterSection({
  sanityEventId,
  accessLevel,
  registrationFee,
  guestCountEnabled,
  isSoldOut,
  isAlreadyRegistered,
  memberStatus,
  isAuthenticated,
}: RegisterSectionProps) {
  const [guestName,  setGuestName]  = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestCount, setGuestCount] = useState(0)
  const [error,      setError]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isSoldOut)           return <p>This event is sold out.</p>
  if (isAlreadyRegistered) return <p>You are registered for this event.</p>

  if (accessLevel === 'membersOnly') {
    if (!isAuthenticated)
      return <p><a href="/login">Log in to register for this event</a></p>
    if (memberStatus !== 'active')
      return <p>An active membership is required. <a href="/membership">Become a member</a></p>
    return (
      <MemberRegisterButton
        sanityEventId={sanityEventId}
        registrationFee={registrationFee}
        guestCountEnabled={guestCountEnabled}
      />
    )
  }

  // openToAll — active members use the member endpoint for a cleaner flow
  if (isAuthenticated && memberStatus === 'active') {
    return (
      <MemberRegisterButton
        sanityEventId={sanityEventId}
        registrationFee={registrationFee}
        guestCountEnabled={guestCountEnabled}
      />
    )
  }

  // openToAll — unauthenticated or non-active member → guest form
  async function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/events/${sanityEventId}/register/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, guestEmail, guestCount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(extractError(data)); return }
      if (data.url) {
        window.location.href = data.url
      } else if (data.redirect) {
        // Append ?guest=1 so the success page sets the osa_reg_{id} cookie
        window.location.href = `${data.redirect}?guest=1`
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleGuestSubmit}>
      <div>
        <label>
          Your name
          <br />
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
            maxLength={100}
          />
        </label>
      </div>
      <div>
        <label>
          Email address
          <br />
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            required
            maxLength={255}
          />
        </label>
      </div>
      {guestCountEnabled && (
        <GuestCountInput value={guestCount} onChange={setGuestCount} />
      )}
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting
          ? 'Registering...'
          : registrationFee > 0
          ? `Register — $${registrationFee}`
          : 'Register (Free)'}
      </button>
    </form>
  )
}
