// lib/auth/roles.test.ts
// TDD tests for ROLES-01 and ROLES-02

import { ROLE_HIERARCHY } from '@/lib/auth/roles'

describe('ROLE_HIERARCHY', () => {
  // ROLES-01: admin role level is greater than member role level
  it('admin role level is greater than member role level', () => {
    expect(ROLE_HIERARCHY['admin'] > ROLE_HIERARCHY['member']).toBe(true)
  })

  // ROLES-02: ROLE_HIERARCHY keys are exactly 'member' and 'admin'
  it("ROLE_HIERARCHY keys are exactly 'member' and 'admin'", () => {
    expect(Object.keys(ROLE_HIERARCHY).sort()).toEqual(['admin', 'member'])
  })
})
