import type { Metadata } from 'next'
import LoginButton from './login-button'

export const metadata: Metadata = {
  title: 'Sign In | OSA Community Platform',
}

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to OSA</h1>
      <p>Sign in to access your OSA Community Platform account.</p>
      <LoginButton />
    </main>
  )
}
