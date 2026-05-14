// lib/db/prisma.test.ts
// TDD test for PRISMA-01: singleton pattern — same PrismaClient reference across imports

describe('prisma singleton', () => {
  // PRISMA-01: same reference on two imports (globalThis pattern)
  it('returns the same PrismaClient instance on repeated imports', async () => {
    // Clear module registry so we get fresh imports in this test
    jest.resetModules()

    // Import prisma twice — both must resolve to the same object
    const { prisma: first } = await import('@/lib/db/prisma')
    const { prisma: second } = await import('@/lib/db/prisma')

    expect(first).toBe(second)
  })
})
