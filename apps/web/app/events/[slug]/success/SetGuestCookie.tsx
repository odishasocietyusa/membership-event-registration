'use client'

import { useEffect } from 'react'
import { setGuestRegistrationCookie } from './actions'

export default function SetGuestCookie({ sanityEventId }: { sanityEventId: string }) {
  useEffect(() => {
    setGuestRegistrationCookie(sanityEventId)
  }, [sanityEventId])

  return null
}
