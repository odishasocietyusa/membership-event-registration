'use client'

import { useState } from 'react'
import { z } from 'zod'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(undefined)

    const result = schema.safeParse({ email })
    if (!result.success) {
      setEmailError(result.error.flatten().fieldErrors.email?.[0])
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowser()
    // Always show the same message regardless of whether the email exists — prevents enumeration
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main>
        <h1>Check your email</h1>
        <p>If that email is registered, you&apos;ll receive a reset link shortly.</p>
        <p>
          <a href="/login">Back to sign in</a>
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>Reset your password</h1>
      <p>Enter your email address and we&apos;ll send you a reset link.</p>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {emailError && <p role="alert">{emailError}</p>}
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <p>
          <a href="/login">Back to sign in</a>
        </p>
      </form>
    </main>
  )
}
