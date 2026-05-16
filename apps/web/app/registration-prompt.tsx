'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

export default function RegistrationPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/members/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return

      const { member } = await res.json()
      const isActive = member?.memberStatus === 'active'
      if (!isActive) setShow(true)
    }
    check()
  }, [])

  if (!show) return null

  return (
    <section>
      <p>Complete your registration to become an OSA member.</p>
      <a href="/register">Register now</a>
    </section>
  )
}
