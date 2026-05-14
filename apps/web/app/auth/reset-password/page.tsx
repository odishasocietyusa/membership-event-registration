'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowser()

    // Supabase processes the #access_token hash from the reset email and fires PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // If no recovery event arrives within 3 seconds, the link is invalid or expired
    const timer = setTimeout(() => {
      setExpired((prev) => {
        if (!prev) return true
        return prev
      })
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  // Once ready, clear the expired timer effect
  useEffect(() => {
    if (ready) setExpired(false)
  }, [ready])

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
    setTimeout(() => router.push('/login'), 2000)
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
