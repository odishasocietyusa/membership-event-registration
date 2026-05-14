'use client'

import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

export default function GoogleLoginButton() {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
  }

  return (
    <button onClick={handleSignIn}>
      Sign in with Google
    </button>
  )
}
