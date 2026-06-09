// app/api/admin/events/registrations/[id]/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, opts?: { role?: string }) => {
    if (opts?.role === 'admin') {
      return (req: Request) =>
        handler(req, { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } })
    }
    return (req: Request) =>
      new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 })
  },
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    eventRegistration: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
  },
}))

import { PATCH } from './route'
import { prisma } from '@/lib/db/prisma'

const mockFindUnique = prisma.eventRegistration.findUnique as jest.Mock
const mockUpdate     = prisma.eventRegistration.update     as jest.Mock

function makeRequest(body: unknown) {
  return new Request('http://test/api/admin/events/registrations/reg-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'reg-1' })

beforeEach(() => jest.clearAllMocks())

describe('PATCH /api/admin/events/registrations/[id]', () => {
  it('DEREG-01: admin + confirmed registration → 200, status cancelled', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'reg-1', status: 'confirmed' })
    mockUpdate.mockResolvedValueOnce({ id: 'reg-1', status: 'cancelled', cancelledAt: new Date() })

    const res = await PATCH(makeRequest({ status: 'cancelled' }), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.registration.status).toBe('cancelled')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reg-1' },
        data:  expect.objectContaining({ status: 'cancelled' }),
      }),
    )
  })

  it('DEREG-03: registration not found → 404', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const res = await PATCH(makeRequest({ status: 'cancelled' }), { params })
    expect(res.status).toBe(404)
  })

  it('DEREG-04: body with status "confirmed" → 400', async () => {
    const res = await PATCH(makeRequest({ status: 'confirmed' }), { params })
    expect(res.status).toBe(400)
  })
})
