'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { STATE_OPTIONS, COUNTRY_OPTIONS, chapterDisplayName } from '@/lib/constants/address-options'
import type { MemberRow } from '@/lib/auth/with-auth'
import type { FamilyMember } from '@prisma/client'

interface ProfileClientProps {
  member: MemberRow
  familyMembers: FamilyMember[]
  chapterName: string
  bio: string
  spouseName: string
}

interface AddressForm {
  street: string; city: string; state: string; zip: string; country: string
}

interface ProfileForm {
  fullName: string
  phone: string
  address: AddressForm
  bio: string
  spouseName: string
  souvenirPreference: string
  show_phone: boolean
  show_email: boolean
  show_chapter: boolean
}

interface AddFamilyForm {
  fullName: string
  relation: string
  dateOfBirth: string
  highSchoolGraduationYear: string
  email: string
}

interface EditFamilyForm {
  fullName: string
  dateOfBirth: string
  highSchoolGraduationYear: string
  email: string
}

// FamilyMember rows include email after the migration; cast until Prisma client regenerates.
type FamilyMemberWithEmail = FamilyMember & { email?: string | null }

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
  honoraryNoVote:      'Honorary',
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function ProfileClient({
  member,
  familyMembers: initialFamilyMembers,
  chapterName: initialChapterName,
  bio: initialBio,
  spouseName: initialSpouseName,
}: ProfileClientProps) {
  const addr = (member.address as Record<string, string> | null) ?? {}
  const vis  = (member.profileVisibility as Record<string, boolean> | null) ?? {}

  const [form, setForm] = useState<ProfileForm>({
    fullName:           member.fullName ?? '',
    phone:              member.phone    ?? '',
    address: {
      street:  addr.street  ?? '',
      city:    addr.city    ?? '',
      state:   addr.state   ?? '',
      zip:     addr.zip     ?? '',
      country: addr.country ?? 'USA',
    },
    bio:                initialBio,
    spouseName:         initialSpouseName,
    souvenirPreference: member.souvenirPreference ?? '',
    show_phone:         vis.show_phone   ?? false,
    show_email:         vis.show_email   ?? false,
    show_chapter:       vis.show_chapter ?? false,
  })
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [chapterName, setChapterName] = useState(initialChapterName)

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberWithEmail[]>(
    initialFamilyMembers as FamilyMemberWithEmail[]
  )
  const [addingFamily,  setAddingFamily]  = useState(false)
  const [addForm,       setAddForm]       = useState<AddFamilyForm>({
    fullName: '', relation: 'child', dateOfBirth: '', highSchoolGraduationYear: '', email: '',
  })
  const [addError,     setAddError]    = useState<string | null>(null)
  const [addInFlight,  setAddInFlight] = useState(false)
  const [editingId,    setEditingId]   = useState<string | null>(null)
  const [editForm,     setEditForm]    = useState<EditFamilyForm>({
    fullName: '', dateOfBirth: '', highSchoolGraduationYear: '', email: '',
  })
  const [editError,    setEditError]   = useState<string | null>(null)
  const [editInFlight, setEditInFlight] = useState(false)

  async function getToken(): Promise<string> {
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const payload: Record<string, unknown> = {
      fullName:   form.fullName.trim()  || undefined,
      phone:      form.phone.trim()     || undefined,
      bio:        form.bio,
      spouseName: form.spouseName,
      profileVisibility: {
        show_phone:   form.show_phone,
        show_email:   form.show_email,
        show_chapter: form.show_chapter,
      },
    }

    // Only send address when at least one field is filled — prevents overwriting
    // a complete address (and nullifying chapterId) when user saves without touching address.
    const addrFields = [
      form.address.street.trim(),
      form.address.city.trim(),
      form.address.state,
      form.address.zip.trim(),
    ]
    if (addrFields.some((f) => f !== '')) {
      payload.address = {
        street:  form.address.street.trim(),
        city:    form.address.city.trim(),
        state:   form.address.state,
        zip:     form.address.zip.trim(),
        country: form.address.country || 'USA',
      }
    }
    if (form.souvenirPreference) {
      payload.souvenirPreference = form.souvenirPreference
    }

    try {
      const token = await getToken()
      const res = await fetch('/api/members/me', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError((body as { error?: string })?.error ?? 'Save failed. Please try again.')
        return
      }
      const { member: updated } = await res.json()
      setChapterName(chapterDisplayName(updated.chapterId))
      setSaveSuccess(true)
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddFamily(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddInFlight(true)

    const payload: Record<string, unknown> = {
      fullName: addForm.fullName.trim(),
      relation: addForm.relation,
    }
    if (addForm.dateOfBirth)              payload.dateOfBirth              = addForm.dateOfBirth
    if (addForm.highSchoolGraduationYear) payload.highSchoolGraduationYear = parseInt(addForm.highSchoolGraduationYear, 10)
    if (addForm.relation === 'spouse' && addForm.email.trim()) payload.email = addForm.email.trim()

    try {
      const token = await getToken()
      const res = await fetch('/api/members/me/family', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAddError((body as { error?: string })?.error ?? 'Failed to add family member.')
        return
      }
      const { familyMember } = await res.json()
      setFamilyMembers((prev) => [...prev, familyMember as FamilyMemberWithEmail])
      setAddForm({ fullName: '', relation: 'child', dateOfBirth: '', highSchoolGraduationYear: '', email: '' })
      setAddingFamily(false)
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAddInFlight(false)
    }
  }

  async function handleRemoveFamily(id: string) {
    try {
      const token = await getToken()
      const res = await fetch(`/api/members/me/family/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setFamilyMembers((prev) => prev.filter((m) => m.id !== id))
      }
    } catch {
      // Silently ignore — row remains in list; user can retry
    }
  }

  function startEdit(fm: FamilyMemberWithEmail) {
    setEditingId(fm.id)
    setEditError(null)
    setEditForm({
      fullName:                 fm.fullName,
      dateOfBirth:              fm.dateOfBirth
        ? new Date(fm.dateOfBirth).toISOString().slice(0, 10)
        : '',
      highSchoolGraduationYear: fm.highSchoolGraduationYear
        ? String(fm.highSchoolGraduationYear)
        : '',
      email: fm.email ?? '',
    })
  }

  async function handleSaveEdit(id: string) {
    setEditError(null)
    setEditInFlight(true)

    const fm = familyMembers.find((m) => m.id === id)

    // H-3 fix: validate fullName client-side before sending
    if (!editForm.fullName.trim()) {
      setEditError('Name cannot be empty.')
      setEditInFlight(false)
      return
    }

    const payload: Record<string, unknown> = {
      fullName:                 editForm.fullName.trim(),
      // H-1 fix: send null to explicitly clear optional fields
      dateOfBirth:              editForm.dateOfBirth || null,
      highSchoolGraduationYear: editForm.highSchoolGraduationYear
        ? parseInt(editForm.highSchoolGraduationYear, 10)
        : null,
    }
    if (fm?.relation === 'spouse') payload.email = editForm.email.trim()

    try {
      const token = await getToken()
      const res = await fetch(`/api/members/me/family/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setEditError((body as { error?: string })?.error ?? 'Save failed.')
        return
      }
      const { familyMember: updated } = await res.json()
      setFamilyMembers((prev) => prev.map((m) => (m.id === id ? (updated as FamilyMemberWithEmail) : m)))
      setEditingId(null)
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditInFlight(false)
    }
  }

  return (
    <>
      <fieldset>
        <legend>Account</legend>
        <p><strong>Email:</strong> {member.email}</p>
        <p><em>To change your login email or switch login method, please contact an OSA admin.</em></p>
        <p><strong>Role:</strong> {member.role}</p>
        <p><strong>Chapter:</strong> {chapterName}</p>
      </fieldset>

      <fieldset>
        <legend>Membership</legend>
        <p><strong>Type:</strong> {member.membershipType ? (MEMBERSHIP_TYPE_LABELS[member.membershipType] ?? member.membershipType) : '—'}</p>
        <p><strong>Status:</strong> {member.memberStatus ?? '—'}</p>
        <p><strong>Join date:</strong> {formatDate(member.joinDate)}</p>
        <p><strong>Expiry date:</strong> {formatDate(member.expiryDate)}</p>
      </fieldset>

      <form onSubmit={handleSave}>
        <fieldset>
          <legend>Personal Information</legend>

          <div>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              rows={4}
              maxLength={1000}
              value={form.bio}
              onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
            />
            <p>{1000 - form.bio.length} characters remaining</p>
          </div>

          <div>
            <label htmlFor="spouseName">Spouse name</label>
            <input
              id="spouseName"
              type="text"
              value={form.spouseName}
              onChange={(e) => setForm((prev) => ({ ...prev, spouseName: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="souvenirPreference">Souvenir preference</label>
            <select
              id="souvenirPreference"
              value={form.souvenirPreference}
              onChange={(e) => setForm((prev) => ({ ...prev, souvenirPreference: e.target.value }))}
            >
              <option value="">— No preference —</option>
              <option value="electronic">Electronic</option>
              <option value="print">Print</option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Address</legend>
          <p><em>Chapter is assigned automatically from your address and shown read-only above.</em></p>

          <div>
            <label htmlFor="addrStreet">Street</label>
            <input
              id="addrStreet"
              type="text"
              value={form.address.street}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, street: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrCity">City</label>
            <input
              id="addrCity"
              type="text"
              value={form.address.city}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, city: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrState">State / Province</label>
            <select
              id="addrState"
              value={form.address.state}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, state: e.target.value } }))}
            >
              <option value="">— Select —</option>
              {STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="addrZip">ZIP / Postal code</label>
            <input
              id="addrZip"
              type="text"
              value={form.address.zip}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, zip: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrCountry">Country</label>
            <select
              id="addrCountry"
              value={form.address.country}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, country: e.target.value } }))}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Profile Visibility</legend>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_phone}
                onChange={(e) => setForm((prev) => ({ ...prev, show_phone: e.target.checked }))}
              />
              {' '}Show phone number to other members
            </label>
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_email}
                onChange={(e) => setForm((prev) => ({ ...prev, show_email: e.target.checked }))}
              />
              {' '}Show email address to other members
            </label>
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_chapter}
                onChange={(e) => setForm((prev) => ({ ...prev, show_chapter: e.target.checked }))}
              />
              {' '}Show chapter to other members
            </label>
          </div>
        </fieldset>

        {saveError   && <p role="alert">{saveError}</p>}
        {saveSuccess && <p role="status">Profile saved.</p>}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      <section>
        <h2>Family Members</h2>

        {familyMembers.length === 0 && <p>No family members added yet.</p>}

        {familyMembers.map((fm) => {
          const isEditing = editingId === fm.id
          return (
            <div key={fm.id}>
              {isEditing ? (
                <>
                  <div>
                    <label htmlFor={`edit_name_${fm.id}`}>Name</label>
                    <input
                      id={`edit_name_${fm.id}`}
                      type="text"
                      value={editForm.fullName}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit_dob_${fm.id}`}>Date of birth</label>
                    <input
                      id={`edit_dob_${fm.id}`}
                      type="date"
                      value={editForm.dateOfBirth}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit_grad_${fm.id}`}>HS graduation year</label>
                    <input
                      id={`edit_grad_${fm.id}`}
                      type="number"
                      value={editForm.highSchoolGraduationYear}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, highSchoolGraduationYear: e.target.value }))}
                    />
                  </div>
                  {fm.relation === 'spouse' && (
                    <div>
                      <label htmlFor={`edit_email_${fm.id}`}>Spouse email</label>
                      <input
                        id={`edit_email_${fm.id}`}
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  )}
                  {editError && <p role="alert">{editError}</p>}
                  <button type="button" onClick={() => handleSaveEdit(fm.id)} disabled={editInFlight}>
                    {editInFlight ? 'Saving…' : 'Save'}
                  </button>
                  {' '}
                  <button type="button" onClick={() => setEditingId(null)} disabled={editInFlight}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p>
                    <strong>{fm.fullName}</strong>
                    {' — '}{fm.relation}
                    {fm.dateOfBirth && ` — Born ${formatDate(fm.dateOfBirth)}`}
                    {fm.highSchoolGraduationYear && ` — HS grad ${fm.highSchoolGraduationYear}`}
                    {fm.relation === 'spouse' && fm.email && ` — ${fm.email}`}
                  </p>
                  <button type="button" onClick={() => startEdit(fm)}>Edit</button>
                  {' '}
                  <button type="button" onClick={() => handleRemoveFamily(fm.id)}>Remove</button>
                </>
              )}
            </div>
          )
        })}

        {!addingFamily && (
          <button type="button" onClick={() => setAddingFamily(true)}>Add family member</button>
        )}

        {addingFamily && (
          <form onSubmit={handleAddFamily}>
            <fieldset>
              <legend>New family member</legend>

              <div>
                <label htmlFor="add_name">Name</label>
                <input
                  id="add_name"
                  type="text"
                  required
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="add_relation">Relation</label>
                <select
                  id="add_relation"
                  value={addForm.relation}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, relation: e.target.value }))}
                >
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="add_dob">Date of birth (optional)</label>
                <input
                  id="add_dob"
                  type="date"
                  value={addForm.dateOfBirth}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="add_grad">HS graduation year (optional)</label>
                <input
                  id="add_grad"
                  type="number"
                  value={addForm.highSchoolGraduationYear}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, highSchoolGraduationYear: e.target.value }))}
                />
              </div>

              {addForm.relation === 'spouse' && (
                <div>
                  <label htmlFor="add_email">Spouse email (optional)</label>
                  <input
                    id="add_email"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              )}

              {addError && <p role="alert">{addError}</p>}

              <button type="submit" disabled={addInFlight}>
                {addInFlight ? 'Adding…' : 'Add'}
              </button>
              {' '}
              <button type="button" onClick={() => setAddingFamily(false)} disabled={addInFlight}>
                Cancel
              </button>
            </fieldset>
          </form>
        )}
      </section>
    </>
  )
}
