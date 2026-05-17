import type { Metadata } from 'next'

export const metadata: Metadata = {
  other: { refresh: '5;url=/dashboard' },
}

export default function MembershipSuccessPage() {
  return (
    <main>
      <h1>Payment Successful</h1>
      <p>Thank you for joining OSA! Your membership is being activated — this usually takes a few seconds.</p>
      <p>You will be redirected to your dashboard in 5 seconds.</p>
      <p><a href="/dashboard">Go to dashboard now</a></p>
    </main>
  )
}
