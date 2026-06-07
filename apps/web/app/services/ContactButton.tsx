'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

interface Props {
  providerId: string
  providerName: string
  memberIsActive: boolean
}

export default function ContactButton({ providerId, providerName, memberIsActive }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!memberIsActive) {
    return <p>An active membership is required to contact service providers.</p>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('You must be logged in to send a message.')
        return
      }

      const res = await fetch(`/api/services/${providerId}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subject, body }),
      })

      if (res.status === 429) {
        setError('You have reached the limit of 5 messages per hour. Please try again later.')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Something went wrong.')
        return
      }

      setSuccess(true)
      setSubject('')
      setBody('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {!open && !success && (
        <button onClick={() => setOpen(true)}>Contact {providerName}</button>
      )}
      {success && <p>Message sent successfully.</p>}
      {open && !success && (
        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={100}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                rows={5}
                required
              />
            </label>
          </div>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      )}
    </>
  )
}
