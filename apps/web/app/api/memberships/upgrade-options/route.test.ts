// app/api/memberships/upgrade-options/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function) =>
    (req: Request) => handler(req, { user: { id: 'mem-1', email: 'user@test.com', role: 'member' } }),
}))

jest.mock('@/lib/payments/payment-service', () => ({
  getUpgradeOptions: jest.fn(),
}))

import { GET } from './route'
import { getUpgradeOptions } from '@/lib/payments/payment-service'

const mockGetUpgradeOptions = getUpgradeOptions as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeReq() {
  return new Request('http://test/api/memberships/upgrade-options', {
    method: 'GET',
    headers: { Authorization: 'Bearer token' },
  })
}

describe('GET /api/memberships/upgrade-options', () => {
  it('returns upgrade options successfully', async () => {
    const mockResult = {
      cumulativePaidCents: 12000,
      options: [
        {
          membershipType: 'fiveYearFamily',
          displayName: 'Five-Year Family',
          fullPriceDollars: 100,
          upgradeFeeCents: 8000,
        },
      ],
    }
    mockGetUpgradeOptions.mockResolvedValueOnce(mockResult)

    const res = await GET(makeReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(mockResult)
    expect(mockGetUpgradeOptions).toHaveBeenCalledWith('mem-1')
  })

  it('returns 500 when getUpgradeOptions throws an error', async () => {
    mockGetUpgradeOptions.mockRejectedValueOnce(new Error('DB error'))

    const res = await GET(makeReq())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})
