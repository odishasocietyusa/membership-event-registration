// lib/messaging/resend.test.ts

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

import { sendRelayEmail } from './resend'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'noreply@test.com'
})

describe('sendRelayEmail()', () => {
  it('sends email with city/state when both are present', async () => {
    mockSend.mockResolvedValueOnce({ id: 'email-1' })

    await sendRelayEmail({
      to: 'recipient@test.com',
      subject: 'Hello',
      senderName: 'Utkal Nayak',
      senderCity: 'Seattle',
      senderState: 'WA',
      body: 'Test body',
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@test.com',
        subject: 'Hello',
        text: expect.stringContaining('Utkal Nayak from Seattle, WA'),
      })
    )
  })

  it('omits location clause when city/state are absent', async () => {
    mockSend.mockResolvedValueOnce({ id: 'email-2' })

    await sendRelayEmail({
      to: 'recipient@test.com',
      subject: 'Hi',
      senderName: 'Utkal Nayak',
      senderCity: null,
      senderState: null,
      body: 'Hello',
    })

    const text: string = mockSend.mock.calls[0][0].text
    expect(text).toContain('Utkal Nayak sent you this message')
    expect(text).not.toContain('from ,')
    expect(text).not.toContain('from null')
  })

  it('propagates transport errors to the caller', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend API error'))

    await expect(
      sendRelayEmail({
        to: 'r@test.com',
        subject: 'Fail',
        senderName: 'A',
        body: 'B',
      })
    ).rejects.toThrow('Resend API error')
  })
})
