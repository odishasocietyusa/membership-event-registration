import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'

export interface RelayEmailInput {
  to: string
  subject: string
  senderName: string
  senderCity?: string | null
  senderState?: string | null
  body: string
}

export async function sendRelayEmail(input: RelayEmailInput): Promise<void> {
  const locationClause =
    input.senderCity && input.senderState
      ? ` from ${input.senderCity}, ${input.senderState}`
      : ''

  await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: input.subject,
    text: [
      `${input.senderName}${locationClause} sent you this message via the OSA platform:`,
      '',
      input.body,
      '',
      '---',
      'To reply, log in to the OSA member portal and send a message directly.',
      'Do not reply to this email — replies are not monitored.',
    ].join('\n'),
  })
}
