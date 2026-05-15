// app/register/page.test.ts
// Tests for SPEC-10 registration Zod schemas (REG-xx)

import {
  AccountSchema,
  PersonalInfoSchema,
  ChildSchema,
  FamilyInfoSchema,
  AddressSchema,
} from '@osa/validation'

// ---------------------------------------------------------------------------
// AccountSchema
// ---------------------------------------------------------------------------

describe('AccountSchema', () => {
  // REG-ACCT-01: valid account passes
  it('REG-ACCT-01: valid email + matching passwords pass', () => {
    const result = AccountSchema.safeParse({
      email: 'user@example.com',
      password: 'securepassword',
      confirmPassword: 'securepassword',
    })
    expect(result.success).toBe(true)
  })

  // REG-ACCT-02: invalid email rejected
  it('REG-ACCT-02: invalid email is rejected', () => {
    const result = AccountSchema.safeParse({
      email: 'not-an-email',
      password: 'securepassword',
      confirmPassword: 'securepassword',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined()
    }
  })

  // REG-ACCT-03: password too short rejected
  it('REG-ACCT-03: password shorter than 8 chars is rejected', () => {
    const result = AccountSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
      confirmPassword: 'short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined()
    }
  })

  // REG-ACCT-04: mismatched passwords rejected
  it('REG-ACCT-04: mismatched passwords are rejected', () => {
    const result = AccountSchema.safeParse({
      email: 'user@example.com',
      password: 'securepassword',
      confirmPassword: 'differentpassword',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors
      expect(errs.confirmPassword).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// PersonalInfoSchema
// ---------------------------------------------------------------------------

describe('PersonalInfoSchema', () => {
  // REG-PERS-01: all required fields pass
  it('REG-PERS-01: firstName and lastName pass when provided', () => {
    const result = PersonalInfoSchema.safeParse({
      firstName: 'Ananya',
      lastName: 'Patel',
    })
    expect(result.success).toBe(true)
  })

  // REG-PERS-02: empty firstName rejected
  it('REG-PERS-02: empty firstName is rejected', () => {
    const result = PersonalInfoSchema.safeParse({ firstName: '', lastName: 'Patel' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.firstName).toBeDefined()
    }
  })

  // REG-PERS-03: empty lastName rejected
  it('REG-PERS-03: empty lastName is rejected', () => {
    const result = PersonalInfoSchema.safeParse({ firstName: 'Ananya', lastName: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.lastName).toBeDefined()
    }
  })

  // REG-PERS-04: optional phone left blank passes
  it('REG-PERS-04: empty phone string passes (treated as omitted)', () => {
    const result = PersonalInfoSchema.safeParse({
      firstName: 'Ananya',
      lastName: 'Patel',
      phone: '',
    })
    expect(result.success).toBe(true)
  })

  // REG-PERS-05: invalid phone format rejected
  it('REG-PERS-05: non-E.164 phone is rejected', () => {
    const result = PersonalInfoSchema.safeParse({
      firstName: 'Ananya',
      lastName: 'Patel',
      phone: '555-1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.phone).toBeDefined()
    }
  })

  // REG-PERS-06: valid E.164 phone passes
  it('REG-PERS-06: valid E.164 phone passes', () => {
    const result = PersonalInfoSchema.safeParse({
      firstName: 'Ananya',
      lastName: 'Patel',
      phone: '+12125551234',
    })
    expect(result.success).toBe(true)
  })

  // REG-PERS-07: bio over 500 chars rejected
  it('REG-PERS-07: bio over 500 characters is rejected', () => {
    const result = PersonalInfoSchema.safeParse({
      firstName: 'Ananya',
      lastName: 'Patel',
      bio: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.bio).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// ChildSchema
// ---------------------------------------------------------------------------

describe('ChildSchema', () => {
  const currentYear = new Date().getFullYear()
  const validYear = String(currentYear + 4)

  // REG-CHILD-01: valid child passes (graduation year is optional)
  it('REG-CHILD-01: valid child with name and gender passes', () => {
    const result = ChildSchema.safeParse({ name: 'Ria', gender: 'F' })
    expect(result.success).toBe(true)
  })

  // REG-CHILD-01b: valid child with graduation year passes
  it('REG-CHILD-01b: valid child with graduation year passes', () => {
    const result = ChildSchema.safeParse({ name: 'Ria', highSchoolGraduationYear: validYear, gender: 'F' })
    expect(result.success).toBe(true)
  })

  // REG-CHILD-02: empty name rejected
  it('REG-CHILD-02: empty child name is rejected', () => {
    const result = ChildSchema.safeParse({ name: '', gender: 'F' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined()
    }
  })

  // REG-CHILD-03: graduation year out of range rejected
  it('REG-CHILD-03: graduation year too far in the future is rejected', () => {
    const futureYear = String(currentYear + 25)
    const result = ChildSchema.safeParse({ name: 'Ria', highSchoolGraduationYear: futureYear, gender: 'F' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.highSchoolGraduationYear).toBeDefined()
    }
  })

  // REG-CHILD-04: non-numeric graduation year rejected
  it('REG-CHILD-04: non-numeric graduation year is rejected', () => {
    const result = ChildSchema.safeParse({ name: 'Ria', highSchoolGraduationYear: 'twenty-twenty', gender: 'F' })
    expect(result.success).toBe(false)
  })

  // REG-CHILD-05: invalid gender rejected
  it('REG-CHILD-05: gender outside M/F/Other is rejected', () => {
    const result = ChildSchema.safeParse({ name: 'Ria', highSchoolGraduationYear: validYear, gender: 'X' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.gender).toBeDefined()
    }
  })

  // REG-CHILD-06: all three gender values accepted
  it('REG-CHILD-06: M, F, Other are all valid genders', () => {
    for (const gender of ['M', 'F', 'Other']) {
      const result = ChildSchema.safeParse({ name: 'Ria', gender })
      expect(result.success).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// FamilyInfoSchema
// ---------------------------------------------------------------------------

describe('FamilyInfoSchema', () => {
  // REG-FAM-01: empty family passes (all optional)
  it('REG-FAM-01: empty spouseName and empty children array passes', () => {
    const result = FamilyInfoSchema.safeParse({ spouseName: '', children: [] })
    expect(result.success).toBe(true)
  })

  // REG-FAM-02: valid children array passes
  it('REG-FAM-02: valid children array passes', () => {
    const result = FamilyInfoSchema.safeParse({
      spouseName: 'Priya',
      children: [{ name: 'Ria', gender: 'F' }],
    })
    expect(result.success).toBe(true)
  })

  // REG-FAM-03: more than 10 children rejected
  it('REG-FAM-03: more than 10 children is rejected', () => {
    const children = Array.from({ length: 11 }, (_, i) => ({
      name: `Child${i}`,
      gender: 'M',
    }))
    const result = FamilyInfoSchema.safeParse({ spouseName: '', children })
    expect(result.success).toBe(false)
  })

  // REG-FAM-04: exactly 10 children passes
  it('REG-FAM-04: exactly 10 children passes', () => {
    const children = Array.from({ length: 10 }, (_, i) => ({
      name: `Child${i}`,
      gender: 'M',
    }))
    const result = FamilyInfoSchema.safeParse({ spouseName: '', children })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AddressSchema
// ---------------------------------------------------------------------------

describe('AddressSchema', () => {
  const validAddress = {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'USA',
  }

  // REG-ADDR-01: valid address passes
  it('REG-ADDR-01: valid address passes', () => {
    const result = AddressSchema.safeParse(validAddress)
    expect(result.success).toBe(true)
  })

  // REG-ADDR-02: missing required fields rejected
  it.each(['street', 'city', 'state', 'zip', 'country'])(
    'REG-ADDR-02: empty %s is rejected',
    (field) => {
      const data = { ...validAddress, [field]: '' }
      const result = AddressSchema.safeParse(data)
      expect(result.success).toBe(false)
      if (!result.success) {
        const errs = result.error.flatten().fieldErrors as Record<string, string[] | undefined>
        expect(errs[field]).toBeDefined()
      }
    }
  )

  // REG-ADDR-03: zip shorter than 5 chars rejected
  it('REG-ADDR-03: ZIP shorter than 5 chars is rejected', () => {
    const result = AddressSchema.safeParse({ ...validAddress, zip: '100' })
    expect(result.success).toBe(false)
  })

  // REG-ADDR-04: country defaults to USA when using z.default() in schema context
  it('REG-ADDR-04: country can be set to non-USA value', () => {
    const result = AddressSchema.safeParse({ ...validAddress, country: 'India' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.country).toBe('India')
    }
  })
})
