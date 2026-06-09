import { Resend } from 'resend'

const resend   = new Resend(process.env.RESEND_API_KEY)
const FROM     = process.env.RESEND_FROM_EMAIL ?? 'noreply@osa-americas.org'
const ORG_NAME = process.env.RESEND_ORG_NAME  ?? 'The Odisha Society of the Americas'

export interface EventRegistrationConfirmationInput {
  to:         string
  name:       string | null
  eventTitle: string
  eventDate:  string | null
  location:   string | null
  onlineLink: string | null
}

export async function sendEventRegistrationConfirmation(
  input: EventRegistrationConfirmationInput,
): Promise<void> {
  const greeting = input.name ? `Dear ${input.name},` : 'Dear Registrant,'
  const dateStr  = input.eventDate
    ? new Date(input.eventDate).toLocaleDateString('en-US', { dateStyle: 'full' })
    : null

  const lines = [
    greeting,
    '',
    `You are registered for: ${input.eventTitle}`,
    '',
    ...(dateStr          ? [`  Date        : ${dateStr}`]          : []),
    ...(input.location   ? [`  Location    : ${input.location}`]   : []),
    ...(input.onlineLink ? [`  Join online : ${input.onlineLink}`] : []),
    '',
    'We look forward to seeing you there!',
    '',
    'Thank you,',
    ORG_NAME,
  ]

  await resend.emails.send({
    from:    FROM,
    to:      input.to,
    subject: `Registration Confirmed — ${input.eventTitle}`,
    text:    lines.join('\n'),
  })
}
