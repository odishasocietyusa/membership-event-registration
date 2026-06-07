'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error_code') ?? params.get('error')

    if (errorCode) {
      setExpired(true)
      return
    }

    const supabase = createSupabaseBrowser()

    // The server-side /api/auth/callback route exchanges the PKCE code and sets
    // the recovery session in cookies before redirecting here. We just need to
    // detect that session — either via the auth state event or getSession().
    let settled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        settled = true
        setReady(true)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!settled && session) {
        settled = true
        setReady(true)
      }
    })

    const timer = setTimeout(() => {
      if (!settled) setExpired(true)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const result = schema.safeParse({ password, confirmPassword })
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      const formErrors = result.error.flatten().formErrors
      setErrors({
        password: fieldErrors.password?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
        form: formErrors[0],
      })
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setErrors({ form: error.message })
      return
    }

    setSuccess(true)
    setTimeout(() => { window.location.href = '/login' }, 2000)
  }

  if (success) {
    return (
      <main>
        <h1>Password updated</h1>
        <p>Your password has been changed. Redirecting to sign in…</p>
      </main>
    )
  }

  if (expired && !ready) {
    return (
      <main>
        <h1>Link expired</h1>
        <p>This reset link is invalid or has expired.</p>
        <p>
          <a href="/auth/forgot-password">Request a new reset link</a>
        </p>
      </main>
    )
  }

  if (!ready) {
    return (
      <main>
        <p>Verifying reset link…</p>
      </main>
    )
  }

  return (
    <main>
      <h1>Set a new password</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password && <p role="alert">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {errors.confirmPassword && <p role="alert">{errors.confirmPassword}</p>}
        </div>

        {errors.form && <p role="alert">{errors.form}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </main>
  )
}
