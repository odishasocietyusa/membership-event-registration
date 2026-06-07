'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

interface Props {
  providerId: string
  currentStatus: 'pending' | 'active' | 'inactive'
}

export default function AdminServiceActions({ providerId, currentStatus }: Props) {
  const router = useRouter()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(status: 'active' | 'inactive' | 'pending') {
    setWorking(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); return }

      const res = await fetch(`/api/services/${providerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to update status')
        return
      }

      router.refresh()
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Permanently delete this service provider profile?')) return
    setWorking(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); return }

      const res = await fetch(`/api/services/${providerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to delete')
        return
      }

      router.refresh()
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      {currentStatus === 'pending' && (
        <button onClick={() => setStatus('active')} disabled={working}>Approve</button>
      )}
      {currentStatus === 'active' && (
        <button onClick={() => setStatus('inactive')} disabled={working}>Deactivate</button>
      )}
      {currentStatus === 'inactive' && (
        <button onClick={() => setStatus('active')} disabled={working}>Re-activate</button>
      )}
      {' '}
      <button onClick={handleDelete} disabled={working}>Delete</button>
      {error && <span role="alert"> {error}</span>}
    </>
  )
}
