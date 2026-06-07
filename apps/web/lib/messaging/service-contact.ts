import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'

export interface ServiceContactEmailInput {
  to: string           // provider email — server-internal only, never returned to client
  providerName: string
  senderName: string
  senderEmail: string  // included in body as reply-to coordinates
  subject: string
  body: string
}

export async function sendServiceContactEmail(input: ServiceContactEmailInput): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: input.to,
    subject: `[OSA Services] ${input.subject}`,
    text: [
      `${input.senderName} (${input.senderEmail}) found your profile on the OSA Services Directory and would like to connect with you:`,
      '',
      input.body,
      '',
      '---',
      `To reply, contact ${input.senderName} directly at ${input.senderEmail}.`,
      'This message was sent via the OSA Community Platform.',
      '',
      'Odisha Society of the Americas — www.odishasociety.org',
    ].join('\n'),
  })
}
