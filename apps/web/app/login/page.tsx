import type { Metadata } from 'next'
import GoogleLoginButton from './login-button'
import EmailLoginForm from './email-login-form'

export const metadata: Metadata = {
  title: 'Sign In | OSA Community Platform',
}

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to OSA</h1>

      <section>
        <h2>Continue with Google</h2>
        <GoogleLoginButton />
      </section>

      <hr />

      <section>
        <h2>Sign in with email</h2>
        <EmailLoginForm />
      </section>
    </main>
  )
}
