'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AccountSchema,
  PersonalInfoSchema,
  FamilyInfoSchema,
  AddressSchema,
  ChildSchema,
} from '@osa/validation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Child = { name: string; highSchoolGraduationYear: string; gender: string }

type FormData = {
  account: { email: string; password: string; confirmPassword: string }
  personal: { firstName: string; lastName: string; phone: string; bio: string }
  family: { spouseName: string; children: Child[] }
  address: { street: string; city: string; state: string; zip: string; country: string }
}

type FieldErrors = Record<string, string | undefined>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL: FormData = {
  account: { email: '', password: '', confirmPassword: '' },
  personal: { firstName: '', lastName: '', phone: '', bio: '' },
  family: { spouseName: '', children: [] },
  address: { street: '', city: '', state: '', zip: '', country: 'USA' },
}

function flattenZodErrors(result: ReturnType<typeof AccountSchema.safeParse>): FieldErrors {
  if (result.success) return {}
  const fe = result.error.flatten().fieldErrors
  const out: FieldErrors = {}
  for (const [k, v] of Object.entries(fe)) {
    if (v?.[0]) out[k] = v[0]
  }
  const formErrors = result.error.flatten().formErrors
  if (formErrors[0]) out['form'] = formErrors[0]
  return out
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3 | 4 | null>(null) // null = loading
  const [formData, setFormData] = useState<FormData>(INITIAL)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null)

  // Check session on mount — determine starting step
  useEffect(() => {
    async function bootstrap() {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStep(1)
        return
      }

      // Already authenticated — show a message instead of proceeding
      setAuthenticatedEmail(session.user.email ?? null)
      setStep(1)
    }
    bootstrap()
  }, [router])

  // -------------------------------------------------------------------
  // Step handlers
  // -------------------------------------------------------------------

  function handleAccountNext() {
    setErrors({})
    const result = AccountSchema.safeParse(formData.account)
    if (!result.success) {
      setErrors(flattenZodErrors(result as Parameters<typeof flattenZodErrors>[0]))
      return
    }
    submitAccountStep()
  }

  async function submitAccountStep() {
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signUp({
      email: formData.account.email,
      password: formData.account.password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    setLoading(false)

    if (error) {
      const msg =
        error.message === 'User already registered'
          ? 'An account with this email already exists.'
          : error.message
      setErrors({ email: msg })
      return
    }

    setAccountCreated(true)
  }

  function handlePersonalNext() {
    setErrors({})
    const result = PersonalInfoSchema.safeParse(formData.personal)
    if (!result.success) {
      setErrors(flattenZodErrors(result as Parameters<typeof flattenZodErrors>[0]))
      return
    }
    setStep(3)
  }

  function handleFamilyNext() {
    setErrors({})
    const result = FamilyInfoSchema.safeParse(formData.family)
    if (!result.success) {
      setErrors(flattenZodErrors(result as Parameters<typeof flattenZodErrors>[0]))
      // Also surface per-child errors
      const childrenErrors = result.error.flatten().fieldErrors
      if (childrenErrors.children) {
        setErrors((prev) => ({ ...prev, children: childrenErrors.children?.[0] }))
      }
      return
    }
    setStep(4)
  }

  async function handleAddressSubmit() {
    setErrors({})
    const result = AddressSchema.safeParse(formData.address)
    if (!result.success) {
      setErrors(flattenZodErrors(result as Parameters<typeof flattenZodErrors>[0]))
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setErrors({ form: 'Your session has expired. Please sign in again.' })
      setLoading(false)
      return
    }

    const payload = {
      firstName: formData.personal.firstName,
      lastName: formData.personal.lastName,
      phone: formData.personal.phone || undefined,
      bio: formData.personal.bio || undefined,
      spouseName: formData.family.spouseName || undefined,
      children: formData.family.children.map((c) => ({
        name: c.name,
        highSchoolGraduationYear: c.highSchoolGraduationYear ? parseInt(c.highSchoolGraduationYear, 10) : undefined,
        gender: c.gender,
      })),
      address: {
        street: formData.address.street,
        city: formData.address.city,
        state: formData.address.state,
        zip: formData.address.zip,
        country: formData.address.country,
      },
    }

    const res = await fetch('/api/users/me/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
    setLoading(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setErrors({ form: body.message ?? 'Failed to save profile. Please try again.' })
      return
    }

    router.push('/membership')
  }

  // -------------------------------------------------------------------
  // Child list helpers
  // -------------------------------------------------------------------

  function addChild() {
    if (formData.family.children.length >= 10) return
    setFormData((prev) => ({
      ...prev,
      family: {
        ...prev.family,
        children: [...prev.family.children, { name: '', highSchoolGraduationYear: '', gender: '' }],
      },
    }))
  }

  function removeChild(idx: number) {
    setFormData((prev) => ({
      ...prev,
      family: {
        ...prev.family,
        children: prev.family.children.filter((_, i) => i !== idx),
      },
    }))
  }

  function updateChild(idx: number, field: keyof Child, value: string) {
    setFormData((prev) => {
      const children = prev.family.children.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c
      )
      return { ...prev, family: { ...prev.family, children } }
    })
  }

  function validateChild(idx: number): FieldErrors {
    const child = formData.family.children[idx]
    const result = ChildSchema.safeParse(child)
    if (result.success) return {}
    const fe = result.error.flatten().fieldErrors
    const out: FieldErrors = {}
    for (const [k, v] of Object.entries(fe)) {
      if (v?.[0]) out[k] = v[0]
    }
    return out
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (step === null) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    )
  }

  return (
    <main>
      <h1>Create your OSA account</h1>
      <p>Step {step} of 4</p>

      {/* ---------------------------------------------------------------- */}
      {/* STEP 1 — Account                                                 */}
      {/* ---------------------------------------------------------------- */}
      {step === 1 && (
        <section>
          <h2>Step 1: Create account</h2>

          {authenticatedEmail ? (
            <div>
              <p>
                You are already signed in as <strong>{authenticatedEmail}</strong>.
              </p>
              <p>
                <a href="/dashboard">Go to dashboard</a> or{' '}
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createSupabaseBrowser()
                    await supabase.auth.signOut()
                    setAuthenticatedEmail(null)
                  }}
                >
                  Sign out and register a new account
                </button>
              </p>
            </div>
          ) : accountCreated ? (
            <div>
              <p>
                We sent a verification link to <strong>{formData.account.email}</strong>.
                Click the link in your email to verify your account, then come back and{' '}
                <a href="/login">sign in</a> to continue your registration.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleAccountNext()
              }}
              noValidate
            >
              <div>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={formData.account.email}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      account: { ...prev.account, email: e.target.value },
                    }))
                  }
                />
                {errors.email && <p role="alert">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.account.password}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      account: { ...prev.account, password: e.target.value },
                    }))
                  }
                />
                {errors.password && <p role="alert">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.account.confirmPassword}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      account: { ...prev.account, confirmPassword: e.target.value },
                    }))
                  }
                />
                {errors.confirmPassword && <p role="alert">{errors.confirmPassword}</p>}
              </div>

              {errors.form && <p role="alert">{errors.form}</p>}

              <p>
                Already have an account? <a href="/login">Sign in</a>
              </p>

              <button type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Next'}
              </button>
            </form>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STEP 2 — Personal Info                                           */}
      {/* ---------------------------------------------------------------- */}
      {step === 2 && (
        <section>
          <h2>Step 2: Personal information</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handlePersonalNext()
            }}
            noValidate
          >
            <div>
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={formData.personal.firstName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personal: { ...prev.personal, firstName: e.target.value },
                  }))
                }
              />
              {errors.firstName && <p role="alert">{errors.firstName}</p>}
            </div>

            <div>
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={formData.personal.lastName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personal: { ...prev.personal, lastName: e.target.value },
                  }))
                }
              />
              {errors.lastName && <p role="alert">{errors.lastName}</p>}
            </div>

            <div>
              <label htmlFor="phone">Phone (optional)</label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+12125551234"
                value={formData.personal.phone}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personal: { ...prev.personal, phone: e.target.value },
                  }))
                }
              />
              {errors.phone && <p role="alert">{errors.phone}</p>}
            </div>

            <div>
              <label htmlFor="bio">Bio (optional)</label>
              <textarea
                id="bio"
                rows={4}
                maxLength={500}
                value={formData.personal.bio}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personal: { ...prev.personal, bio: e.target.value },
                  }))
                }
              />
              {errors.bio && <p role="alert">{errors.bio}</p>}
            </div>

            <button type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="submit">Next</button>
          </form>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STEP 3 — Family Info                                             */}
      {/* ---------------------------------------------------------------- */}
      {step === 3 && (
        <section>
          <h2>Step 3: Family information</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleFamilyNext()
            }}
            noValidate
          >
            <div>
              <label htmlFor="spouseName">Spouse name (optional)</label>
              <input
                id="spouseName"
                type="text"
                value={formData.family.spouseName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    family: { ...prev.family, spouseName: e.target.value },
                  }))
                }
              />
            </div>

            <fieldset>
              <legend>Children</legend>

              {formData.family.children.map((child, idx) => {
                const childErrors = errors[`child_${idx}`]
                  ? JSON.parse(errors[`child_${idx}`] as string)
                  : validateChild(idx)
                void childErrors // suppress unused warning — used for display
                return (
                  <div key={idx}>
                    <div>
                      <label htmlFor={`child_name_${idx}`}>Name</label>
                      <input
                        id={`child_name_${idx}`}
                        type="text"
                        value={child.name}
                        onChange={(e) => updateChild(idx, 'name', e.target.value)}
                      />
                    </div>

                    <div>
                      <label htmlFor={`child_graduation_${idx}`}>High school graduation year (optional)</label>
                      <input
                        id={`child_graduation_${idx}`}
                        type="number"
                        min={new Date().getFullYear() - 6}
                        max={new Date().getFullYear() + 18}
                        placeholder={String(new Date().getFullYear() + 4)}
                        value={child.highSchoolGraduationYear}
                        onChange={(e) => updateChild(idx, 'highSchoolGraduationYear', e.target.value)}
                      />
                    </div>

                    <div>
                      <label htmlFor={`child_gender_${idx}`}>Gender</label>
                      <select
                        id={`child_gender_${idx}`}
                        value={child.gender}
                        onChange={(e) => updateChild(idx, 'gender', e.target.value)}
                      >
                        <option value="">Select…</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <button type="button" onClick={() => removeChild(idx)}>
                      Remove
                    </button>
                  </div>
                )
              })}

              {errors.children && <p role="alert">{errors.children}</p>}

              <button
                type="button"
                onClick={addChild}
                disabled={formData.family.children.length >= 10}
              >
                Add child
              </button>
            </fieldset>

            <button type="button" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="submit">Next</button>
          </form>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STEP 4 — Address                                                 */}
      {/* ---------------------------------------------------------------- */}
      {step === 4 && (
        <section>
          <h2>Step 4: Mailing address</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleAddressSubmit()
            }}
            noValidate
          >
            <div>
              <label htmlFor="street">Street address</label>
              <input
                id="street"
                type="text"
                autoComplete="street-address"
                value={formData.address.street}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: { ...prev.address, street: e.target.value },
                  }))
                }
              />
              {errors.street && <p role="alert">{errors.street}</p>}
            </div>

            <div>
              <label htmlFor="city">City</label>
              <input
                id="city"
                type="text"
                autoComplete="address-level2"
                value={formData.address.city}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: { ...prev.address, city: e.target.value },
                  }))
                }
              />
              {errors.city && <p role="alert">{errors.city}</p>}
            </div>

            <div>
              <label htmlFor="state">State</label>
              <input
                id="state"
                type="text"
                autoComplete="address-level1"
                value={formData.address.state}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: { ...prev.address, state: e.target.value },
                  }))
                }
              />
              {errors.state && <p role="alert">{errors.state}</p>}
            </div>

            <div>
              <label htmlFor="zip">ZIP code</label>
              <input
                id="zip"
                type="text"
                autoComplete="postal-code"
                value={formData.address.zip}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: { ...prev.address, zip: e.target.value },
                  }))
                }
              />
              {errors.zip && <p role="alert">{errors.zip}</p>}
            </div>

            <div>
              <label htmlFor="country">Country</label>
              <input
                id="country"
                type="text"
                autoComplete="country-name"
                value={formData.address.country}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: { ...prev.address, country: e.target.value },
                  }))
                }
              />
              {errors.country && <p role="alert">{errors.country}</p>}
            </div>

            {errors.form && <p role="alert">{errors.form}</p>}

            <button type="button" onClick={() => setStep(3)}>
              Back
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Complete registration'}
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
