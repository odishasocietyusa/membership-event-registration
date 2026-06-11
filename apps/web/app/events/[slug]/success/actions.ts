'use server'

import { cookies } from 'next/headers'

export async function setGuestRegistrationCookie(sanityEventId: string) {
  const cookieStore = await cookies()
  cookieStore.set(`osa_reg_${sanityEventId}`, '1', {
    maxAge:   60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
  })
}
