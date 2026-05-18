'use client'

import { useState, useRef } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { US_STATES, CA_PROVINCES } from '@/lib/constants/geo'
import { chapterDisplayName } from '@/lib/constants/address-options'
import type { MemberSearchResult, MemberSearchResponse } from '@/lib/validation/member.schema'

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
  honoraryNoVote:      'Honorary',
}

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active:    'Active',
  expired:   'Expired',
  suspended: 'Suspended',
}

const PAGE_SIZE = 100

export default function MemberSearchClient({ senderName }: { senderName: string }) {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [city,      setCity]      = useState('')
  const [country,   setCountry]   = useState<'USA' | 'Canada'>('USA')
  const [state,     setState]     = useState('')

  const [results,   setResults]   = useState<MemberSearchResult[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [truncated, setTruncated] = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Overlay state
  const dialogRef              = useRef<HTMLDialogElement>(null)
  const [overlayRecipientId,   setOverlayRecipientId]   = useState<string | null>(null)
  const [overlayRecipientName, setOverlayRecipientName] = useState('')
  const [messageText,          setMessageText]          = useState('')
  const [sending,              setSending]              = useState(false)
  const [sendError,            setSendError]            = useState<string | null>(null)
  const [sendSuccess,          setSendSuccess]          = useState(false)

  const stateOptions = country === 'Canada' ? CA_PROVINCES : US_STATES

  function handleCountryChange(value: 'USA' | 'Canada') {
    setCountry(value)
    setState('')
  }

  function validate(): string | null {
    const trimFirst = firstName.trim()
    const trimLast  = lastName.trim()
    const trimCity  = city.trim()
    if (trimFirst && trimFirst.length < 3) return 'First name must be at least 3 characters'
    if (trimLast  && trimLast.length  < 3) return 'Last name must be at least 3 characters'
    if (trimCity  && trimCity.length  < 3) return 'City must be at least 3 characters'
    if (!trimFirst && !trimLast && !trimCity && !state) {
      return 'Please enter at least a name, city, or select a state'
    }
    return null
  }

  async function fetchPage(targetPage: number) {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ page: String(targetPage) })
    if (firstName.trim()) params.set('firstName', firstName.trim())
    if (lastName.trim())  params.set('lastName',  lastName.trim())
    if (city.trim())      params.set('city',       city.trim())
    if (state)            params.set('state',      state)
    if (country)          params.set('country',    country)

    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(`/api/members/search?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string })?.error ?? 'Search failed. Please try again.')
        return
      }

      const data: MemberSearchResponse = await res.json()
      setResults(data.results)
      setTotal(data.total)
      setPage(data.page)
      setTruncated(data.truncated)
      setSearched(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    fetchPage(1)
  }

  function openOverlay(memberId: string, recipientName: string) {
    setOverlayRecipientId(memberId)
    setOverlayRecipientName(recipientName)
    setMessageText('')
    setSendError(null)
    dialogRef.current?.showModal()
  }

  function closeOverlay() {
    setOverlayRecipientId(null)
    setOverlayRecipientName('')
    setMessageText('')
    setSendError(null)
    setSendSuccess(false)
    dialogRef.current?.close()
  }

  async function handleSend() {
    if (!overlayRecipientId || !messageText.trim()) return
    setSending(true)
    setSendError(null)

    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/members/message', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ toMemberId: overlayRecipientId, message: messageText.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSendError((data as { error?: string })?.error ?? 'Failed to send. Please try again.')
        return
      }

      setSendSuccess(true)
      setTimeout(closeOverlay, 2000)
    } catch {
      setSendError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, total)

  return (
    <>
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Search Members</legend>

          <div>
            <label htmlFor="firstName">First Name</label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="lastName">Last Name</label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="city">City</label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="country">Country</label>
            <select
              id="country"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value as 'USA' | 'Canada')}
            >
              <option value="USA">USA</option>
              <option value="Canada">Canada</option>
            </select>
          </div>

          <div>
            <label htmlFor="state">State / Province</label>
            <select
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">— Select —</option>
              {stateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && <p role="alert">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </fieldset>
      </form>

      {searched && !loading && (
        <section>
          {truncated && (
            <p>Showing top 1,000 results — refine your search for more specific results.</p>
          )}

          {total > 0 && (
            <p>
              Showing {rangeStart}–{rangeEnd} of {total} result{total !== 1 ? 's' : ''}
            </p>
          )}

          {results.length === 0 ? (
            <p>No results found.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>City</th>
                    <th>State</th>
                    <th>Chapter</th>
                    <th>Member Since</th>
                    <th>Membership Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((m) => (
                    <tr key={m.memberId}>
                      <td>{m.lastName       ?? '—'}</td>
                      <td>{m.firstName      ?? '—'}</td>
                      <td>{m.city           ?? '—'}</td>
                      <td>{m.state          ?? '—'}</td>
                      <td>{chapterDisplayName(m.chapterId)}</td>
                      <td>{m.memberSince    ?? '—'}</td>
                      <td>{m.membershipType ? (MEMBERSHIP_TYPE_LABELS[m.membershipType] ?? m.membershipType) : '—'}</td>
                      <td>{m.memberStatus   ? (MEMBER_STATUS_LABELS[m.memberStatus]     ?? m.memberStatus)   : '—'}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openOverlay(
                            m.memberId,
                            [m.firstName, m.lastName].filter(Boolean).join(' ') || 'this member'
                          )}
                        >
                          Send Message
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <nav aria-label="Search results pagination">
                  <button
                    type="button"
                    onClick={() => fetchPage(page - 1)}
                    disabled={page <= 1 || loading}
                  >
                    Previous
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => fetchPage(page + 1)}
                    disabled={page >= totalPages || loading}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
      <dialog ref={dialogRef} onClose={closeOverlay}>
        {sendSuccess ? (
          <p role="status">Message sent to {overlayRecipientName}. This window will close shortly.</p>
        ) : (
          <>
            <p><strong>To:</strong> {overlayRecipientName}</p>
            <p><strong>From:</strong> {senderName}</p>

            <div>
              <label htmlFor="messageText">Message</label>
              <textarea
                id="messageText"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={1000}
                rows={6}
              />
              <p>{1000 - messageText.length} characters remaining</p>
            </div>

            {sendError && <p role="alert">{sendError}</p>}

            <button
              type="button"
              onClick={handleSend}
              disabled={!messageText.trim() || sending}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button type="button" onClick={closeOverlay} disabled={sending}>
              Cancel
            </button>
          </>
        )}
      </dialog>
    </>
  )
}
