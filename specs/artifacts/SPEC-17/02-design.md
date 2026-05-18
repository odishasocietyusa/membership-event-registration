# Phase 2 Design — SPEC-17: Member Messaging

> **Spec:** `specs/active/SPEC-17-member-messaging.md`
> **Status:** Complete
> **Date:** 2026-05-17
> **Depends on:** `01-analysis.md`

---

## 1. Architecture Overview

```
MemberSearchClient (existing Client Component)
  │
  ├─ "Send Message" button (replaces <a> stub from SPEC-16)
  │     └─ onClick → openOverlay(memberId, recipientName)
  │
  └─ <dialog ref={dialogRef}>   ← inline overlay, no navigation
        ├─ TO: recipientName (read-only)
        ├─ FROM: senderName prop (read-only)
        ├─ <textarea> max 1 000 chars + live counter
        ├─ [Send] [Cancel]
        └─ on Send → POST /api/members/message
                          ├─ withAuth → 401
                          ├─ active-status check → 403
                          ├─ Zod parse → 400
                          ├─ self-message guard → 400
                          ├─ prisma.member lookup → 404
                          └─ sendRelayEmail() → 200 / 500
```

**The `<dialog>` element** is used for the overlay — it provides native modal behaviour (focus trap, Escape key, backdrop) without any CSS.

---

## 2. Data Flow

```
page.tsx (Server Component)
  │  already calls /api/auth/me → { user }
  └─ passes senderName = user.fullName ?? user.email ?? 'OSA Member'
       └─ <MemberSearchClient senderName={senderName} />

MemberSearchClient
  │  onClick "Send Message"
  │    → openOverlay(m.memberId, displayName)
  │    → dialogRef.current.showModal()
  │
  │  onClick "Send"
  │    → POST /api/members/message
  │         { toMemberId, message }
  │         Authorization: Bearer <session token>
  │
  └─ /api/members/message
       ├─ withAuth resolves caller (has user.fullName, user.address)
       ├─ prisma.member.findUnique(toMemberId) → recipient.email
       └─ sendRelayEmail({ to, subject, senderName, senderCity, senderState, body })
```

---

## 3. File Design

### 3.1 `apps/web/lib/validation/member.schema.ts` — **Modify** (append)

Add after the existing `MemberSearchResponseSchema`:

```typescript
// ── Send member message (POST /api/members/message) ──────────────────────────

export const SendMemberMessageSchema = z.object({
  toMemberId: z.string().uuid(),
  message:    z.string().min(1, 'Message cannot be empty').max(1000, 'Maximum 1 000 characters'),
})
export type SendMemberMessageInput = z.infer<typeof SendMemberMessageSchema>
```

No `subject` field — subject is constructed server-side.

---

### 3.2 `apps/web/app/api/members/message/route.ts` — **Create**

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { sendRelayEmail } from '@/lib/messaging/resend'
import { SendMemberMessageSchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  if (user.memberStatus !== 'active') {
    return jsonResponse(403, { error: 'Member messaging is available to active members only.' })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = SendMemberMessageSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const { toMemberId, message } = parsed.data

  if (toMemberId === user.id) {
    return jsonResponse(400, { error: 'You cannot send a message to yourself.' })
  }

  const recipient = await prisma.member.findUnique({
    where:  { id: toMemberId, deletedAt: null },
    select: { email: true },
  })
  if (!recipient) {
    return jsonResponse(404, { error: 'Recipient not found.' })
  }

  const senderName = user.fullName ?? user.email
  const address    = user.address as { city?: string; state?: string } | null

  try {
    await sendRelayEmail({
      to:          recipient.email,
      subject:     `${senderName} from OSA has sent you a message`,
      senderName,
      senderCity:  address?.city  ?? null,
      senderState: address?.state ?? null,
      body:        message,
    })
  } catch (err) {
    console.error('sendRelayEmail failed', err)
    return jsonResponse(500, { error: 'Failed to send message. Please try again.' })
  }

  return jsonResponse(200, { ok: true })
})
```

**Notes:**
- `sendRelayEmail` is called inside a `try/catch` — if Resend fails, the caller gets a 500 with a user-facing error (not a false 200).
- Recipient `select` fetches `email` only — `fullName` is not needed (subject/body don't use it).
- Sender's city/state enriches the relay email header at no extra cost (already on `user` from `withAuth`).

---

### 3.3 `apps/web/app/members/search/page.tsx` — **Modify**

Single change: pass `senderName` prop to `<MemberSearchClient>`.

```typescript
// Before:
return (
  <main>
    <h1>Member Search</h1>
    <MemberSearchClient />
  </main>
)

// After:
const senderName = user?.fullName ?? user?.email ?? 'OSA Member'

return (
  <main>
    <h1>Member Search</h1>
    <MemberSearchClient senderName={senderName} />
  </main>
)
```

The `user` object is already in scope from the `/api/auth/me` response at line 20.

---

### 3.4 `apps/web/app/members/search/MemberSearchClient.tsx` — **Modify**

Four changes to the existing file:

**a) Add `useRef` to imports and accept `senderName` prop:**
```typescript
import { useState, useRef } from 'react'
// ...
export default function MemberSearchClient({ senderName }: { senderName: string }) {
```

**b) Add overlay state + ref (after existing state declarations):**
```typescript
// Overlay state
const dialogRef              = useRef<HTMLDialogElement>(null)
const [overlayRecipientId,   setOverlayRecipientId]   = useState<string | null>(null)
const [overlayRecipientName, setOverlayRecipientName] = useState('')
const [messageText,          setMessageText]          = useState('')
const [sending,              setSending]              = useState(false)
const [sendError,            setSendError]            = useState<string | null>(null)
```

**c) Add overlay handlers (after existing `handleSubmit`):**
```typescript
function openOverlay(memberId: string, recipientName: string) {
  setOverlayRecipientId(memberId)
  setOverlayRecipientName(recipientName)
  setMessageText('')
  setSendError(null)
  dialogRef.current?.showModal()
}

function closeOverlay() {
  setOverlayRecipientId(null)
  setOverlayRecipientName('')
  setMessageText('')
  setSendError(null)
  // .close() already called by browser when Escape pressed;
  // calling it again when triggered programmatically is safe (no-op if already closed)
  dialogRef.current?.close()
}

async function handleSend() {
  if (!overlayRecipientId || !messageText.trim()) return
  setSending(true)
  setSendError(null)

  try {
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/members/message', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ toMemberId: overlayRecipientId, message: messageText.trim() }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSendError((data as { error?: string })?.error ?? 'Failed to send. Please try again.')
      return
    }

    closeOverlay()
  } catch {
    setSendError('Network error. Please try again.')
  } finally {
    setSending(false)
  }
}
```

**d) Replace the Send Message anchor in the results table:**
```tsx
// Before:
<td><a href={`/messages/new?to=${m.memberId}`}>Send Message</a></td>

// After:
<td>
  <button
    type="button"
    onClick={() => openOverlay(
      m.memberId,
      [m.firstName, m.lastName].filter(Boolean).join(' ') || 'this member'
    )}
  >
    Send Message
  </button>
</td>
```

**e) Add `<dialog>` element just before the closing `</>` of the return:**
```tsx
<dialog ref={dialogRef} onClose={closeOverlay}>
  <p><strong>To:</strong> {overlayRecipientName}</p>
  <p><strong>From:</strong> {senderName}</p>

  <div>
    <label htmlFor="messageText">Message</label>
    <textarea
      id="messageText"
      value={messageText}
      onChange={(e) => setMessageText(e.target.value)}
      maxLength={1000}
      rows={6}
    />
    <p>{1000 - messageText.length} characters remaining</p>
  </div>

  {sendError && <p role="alert">{sendError}</p>}

  <button
    type="button"
    onClick={handleSend}
    disabled={!messageText.trim() || sending}
  >
    {sending ? 'Sending…' : 'Send'}
  </button>
  <button type="button" onClick={closeOverlay} disabled={sending}>
    Cancel
  </button>
</dialog>
```

---

## 4. Implementation Sequence

| Step | File | Action |
|------|------|--------|
| 1 | `lib/validation/member.schema.ts` | Append `SendMemberMessageSchema` |
| 2 | `app/api/members/message/route.ts` | Create |
| 3 | `app/members/search/page.tsx` | Add `senderName` prop |
| 4 | `app/members/search/MemberSearchClient.tsx` | Add ref, state, handlers, overlay, replace anchor |

---

## 5. API Contract

### Request
```
POST /api/members/message
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{
  "toMemberId": "uuid",
  "message":    "Hello, I wanted to connect with you."
}
```

### Response 200
```json
{ "ok": true }
```

### Error responses
| Status | Condition |
|--------|-----------|
| 400 | Invalid JSON / Zod validation failure / self-message attempt |
| 401 | Missing or invalid token |
| 403 | Caller not active |
| 404 | `toMemberId` not found or soft-deleted |
| 500 | Resend email dispatch failed |

---

## 6. Email Output

```
From:    noreply@odishasociety.org
To:      <recipient registered email — server-side only>
Subject: Utkal Nayak from OSA has sent you a message

Utkal Nayak from Atlanta, GA sent you this message via the OSA platform:

Hello, I wanted to connect with you about the upcoming event...

---
To reply, log in to the OSA member portal and send a message directly.
Do not reply to this email — replies are not monitored.
```

---

## 7. Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| `<dialog>` for overlay | Native modal semantics; Escape key handled; focus trapped; no CSS needed |
| `sendRelayEmail` called inside `try/catch` that returns 500 | False 200 is worse than visible error — user knows to retry |
| Subject constructed server-side | Prevents client from injecting arbitrary subject lines |
| `recipient.email` fetched server-side only, not in response | Privacy — client never learns the recipient's email |
| `senderName` passed as prop (not fetched by client) | Zero extra API calls; server already has it from auth check |
| `closeOverlay()` called as `onClose` handler on `<dialog>` | Covers both programmatic close and Escape key in one place |
| Recipient display name: `[firstName, lastName].filter(Boolean).join(' ') \|\| 'this member'` | Handles null name fields gracefully |
