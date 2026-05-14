import { Resend } from 'resend'
import type { Member, PaymentRecord } from '@prisma/client'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@osa-americas.org'
const ORG_NAME = process.env.RESEND_ORG_NAME ?? 'The Odisha Society of the Americas'
const ORG_EIN = process.env.RESEND_ORG_EIN ?? ''

export async function sendMembershipReceipt(
  member: Pick<Member, 'email' | 'fullName'>,
  payment: Pick<PaymentRecord, 'amountCents' | 'membershipType' | 'createdAt'>,
): Promise<void> {
  const amount = (payment.amountCents / 100).toFixed(2)
  const date = payment.createdAt.toLocaleDateString('en-US', { dateStyle: 'long' })

  await resend.emails.send({
    from: FROM,
    to: member.email,
    subject: `Payment Receipt — OSA ${payment.membershipType} Membership`,
    text: [
      `Dear ${member.fullName ?? 'Member'},`,
      '',
      `This is your payment receipt for your OSA membership.`,
      '',
      `  Membership type : ${payment.membershipType}`,
      `  Amount paid     : $${amount} USD`,
      `  Payment date    : ${date}`,
      '',
      `Please note: this payment is NOT a charitable contribution and is not tax-deductible.`,
      '',
      `Thank you for your continued support of ${ORG_NAME}.`,
    ].join('\n'),
  })
}

export async function sendDonationReceipt(
  donorEmail: string,
  donorName: string | null,
  payment: Pick<PaymentRecord, 'amountCents' | 'createdAt'>,
): Promise<void> {
  const amount = (payment.amountCents / 100).toFixed(2)
  const date = payment.createdAt.toLocaleDateString('en-US', { dateStyle: 'long' })

  await resend.emails.send({
    from: FROM,
    to: donorEmail,
    subject: `Donation Receipt — ${ORG_NAME}`,
    text: [
      `Dear ${donorName ?? 'Donor'},`,
      '',
      `Thank you for your generous donation to ${ORG_NAME}.`,
      '',
      `  Organization : ${ORG_NAME}`,
      `  EIN          : ${ORG_EIN}`,
      `  Donation date: ${date}`,
      `  Amount       : $${amount} USD`,
      '',
      `No goods or services were provided in exchange for this contribution.`,
      `This letter serves as your official receipt for income tax purposes under IRC Section 501(c)(3).`,
      '',
      `Thank you for supporting our mission.`,
    ].join('\n'),
  })
}
