import { stripe } from '@/lib/payments/stripe'
import { handleCheckoutCompleted, handlePaymentFailed } from '@/lib/payments/webhook-handlers'

export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await handlePaymentFailed(event.data.object)
        break
      default:
        // Unhandled event types — acknowledge and ignore
        break
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response('Internal server error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
