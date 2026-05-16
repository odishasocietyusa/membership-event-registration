'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

const ERROR_MESSAGES: Record<string, string> = {
  'Email not confirmed': 'Please verify your email before signing in.',
  'Invalid login credentials': 'Invalid email or password.',
}

export default function EmailLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const result = schema.safeParse({ email, password })
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      })
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      const message = ERROR_MESSAGES[error.message] ?? 'Sign in failed. Please try again.'
      setErrors({ form: message })
      return
    }

    // Check profile completeness to determine where to send the user
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const res = await fetch('/api/members/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const { member } = await res.json()
        const isRegistered = member?.address != null
        const isActive = member?.memberStatus === 'active'
        router.push(!isRegistered || !isActive ? '/register' : '/dashboard')
        return
      }
    }

    router.push('/register')
  }

  return (
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
        {errors.email && <p role="alert">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errors.password && <p role="alert">{errors.password}</p>}
      </div>

      {errors.form && <p role="alert">{errors.form}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p>
        <a href="/auth/forgot-password">Forgot password?</a>
      </p>
      <p>
        Don&apos;t have an account? <a href="/register">Register</a>
      </p>
    </form>
  )
}
