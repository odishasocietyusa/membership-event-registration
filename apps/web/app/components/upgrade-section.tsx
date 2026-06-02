'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import type { MembershipType } from '@prisma/client'
import type { UpgradeOptionsResult } from '@/lib/payments/payment-service'

async function getToken(): Promise<string> {
  const supabase = createSupabaseBrowser()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export function UpgradeSection({ cumulativePaidCents, options }: UpgradeOptionsResult) {
  const router = useRouter()
  const [selected,   setSelected]   = useState<MembershipType | ''>('')
  const [confirming, setConfirming] = useState(false)
  const [inFlight,   setInFlight]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  if (options.length === 0) return null

  const selectedOption  = options.find((o) => o.membershipType === selected)
  const cumulativeDollars = (cumulativePaidCents / 100).toFixed(2)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOption) return

    if (selectedOption.upgradeFeeCents === 0 && !confirming) {
      setConfirming(true)
      return
    }

    setInFlight(true)
    setError(null)

    try {
      const token = await getToken()
      const res   = await fetch('/api/payments/upgrade-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ targetType: selectedOption.membershipType }),
      })
      const body = await res.json()

      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Upgrade failed. Please try again.')
        setConfirming(false)
        return
      }

      if ((body as { activated?: boolean }).activated) {
        router.refresh()
        return
      }

      const url = (body as { url?: string }).url
      if (url) window.location.href = url
    } catch {
      setError('Network error. Please try again.')
      setConfirming(false)
    } finally {
      setInFlight(false)
    }
  }

  return (
    <fieldset>
      <legend>Upgrade Membership</legend>
      <p>You have paid <strong>${cumulativeDollars}</strong> toward your membership.</p>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="upgrade-select">Select a tier to upgrade to</label>
          <select
            id="upgrade-select"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as MembershipType)
              setConfirming(false)
              setError(null)
            }}
            required
          >
            <option value="">— Choose a tier —</option>
            {options.map((opt) => {
              const fee = opt.upgradeFeeCents === 0
                ? 'No additional fee'
                : `Upgrade fee: $${(opt.upgradeFeeCents / 100).toFixed(2)}`
              return (
                <option key={opt.membershipType} value={opt.membershipType}>
                  {opt.displayName} — ${opt.fullPriceDollars} ({fee})
                </option>
              )
            })}
          </select>
        </div>

        {confirming && selectedOption && (
          <p role="status">
            Upgrade to {selectedOption.displayName} at no additional cost. Click confirm to proceed.
          </p>
        )}

        {error && <p role="alert">{error}</p>}

        <button type="submit" disabled={!selected || inFlight}>
          {inFlight ? 'Processing...' : confirming ? 'Confirm Upgrade' : 'Upgrade'}
        </button>

        {confirming && (
          <button type="button" onClick={() => setConfirming(false)} disabled={inFlight}>
            Cancel
          </button>
        )}
      </form>
    </fieldset>
  )
}
