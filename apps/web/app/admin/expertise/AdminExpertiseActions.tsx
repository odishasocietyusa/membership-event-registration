'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

interface Props {
  profileId: string
  isHidden: boolean
}

export default function AdminExpertiseActions({ profileId, isHidden }: Props) {
  const router = useRouter()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleHidden() {
    setWorking(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); return }

      const res = await fetch(`/api/expertise/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ isHidden: !isHidden }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to update entry')
        return
      }

      router.refresh()
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Permanently delete this expertise entry?')) return
    setWorking(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); return }

      const res = await fetch(`/api/expertise/${profileId}`, {
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
      <button onClick={toggleHidden} disabled={working}>
        {isHidden ? 'Unhide' : 'Hide'}
      </button>
      {' '}
      <button onClick={handleDelete} disabled={working}>Delete</button>
      {error && <span role="alert"> {error}</span>}
    </>
  )
}
