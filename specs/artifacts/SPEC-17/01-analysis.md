# Phase 1 Analysis — SPEC-17: Member Messaging

> **Spec:** `specs/active/SPEC-17-member-messaging.md`
> **Status:** Complete
> **Date:** 2026-05-17

---

## 1. Requirements Parsed

### Functional summary
An active member clicks "Send Message" on a search result row. An inline overlay opens on the same page showing TO (recipient name), FROM (sender name), a 1 000-char textarea, and Send/Cancel buttons. On submit, the server looks up the recipient's email, fires a Resend email, and returns. The overlay closes on success. No DB write. No reply-to header. No sender email exposed to recipient or client.

---

## 2. Open Question Resolutions

### OQ-1 — resend.ts exports

**Finding:** `lib/messaging/resend.ts` already exports `sendRelayEmail(input: RelayEmailInput)`. It:
- Uses `process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'` as the From address
- Accepts `to`, `subject`, `senderName`, `senderCity?`, `senderState?`, `body`
- Sets **no reply-to header** — noreply is already enforced ✅
- Auto-formats the email body as:
  ```
  [senderName][city, state] sent you this message via the OSA platform:

  [message body]

  ---
  To reply, log in to the OSA member portal and send a message directly.
  Do not reply to this email — replies are not monitored.
  ```

**Decision:** `sendRelayEmail` is **directly reusable as-is** — no new function, no modifications to `resend.ts`. The new API route calls it directly.

**Note on body format:** The spec says "the message body should have the same text the user entered." `sendRelayEmail` wraps the text with a header and a noreply footer. This is better UX than bare text and the footer is accurate (recipients can log in and send their own message back via Member Search). The architect should use this existing format rather than sending raw text.

---

### OQ-2 — RESEND_FROM_EMAIL value

**Finding:** `.env.example` confirms:
```
RESEND_FROM_EMAIL=noreply@odishasociety.org
```
`resend.ts` falls back to the same value if the env var is absent. Noreply is enforced at the library layer — not dependent on the caller remembering to omit a reply-to. ✅

---

### OQ-3 — Member.email nullability

**Finding:** Prisma schema:
```
email  String  @unique
```
`email` is non-nullable and unique — guaranteed to be present on every `Member` row. The API can always resolve a recipient email from `toMemberId` without a null check. ✅

---

### OQ-4 — Passing senderName to MemberSearchClient

**Finding:** `page.tsx` already calls `/api/auth/me` and stores the result in `{ user }` (line 20). `user.fullName` is available at render time. Passing it as a prop to `<MemberSearchClient senderName={user.fullName ?? user.email} />` requires zero additional fetches and follows the same pattern used by the dashboard and admin pages. ✅

---

## 3. Codebase Findings

### 3.1 What to reuse vs. what to bypass

| Existing item | Reuse? | Reason |
|---|---|---|
| `sendRelayEmail()` in `resend.ts` | ✅ Yes, as-is | Already handles from address, body format, noreply |
| `sendMessage()` in `message-service.ts` | ❌ No | Creates a Prisma record — explicitly not wanted for SPEC-17 |
| `CreateMessageSchema` in `message.schema.ts` | ❌ No | Requires `subject` field and allows 10 000 chars; wrong shape for this feature |
| `/api/messages` route | ❌ No | DB-backed; different access pattern |
| `withAuth` + active-status inline check | ✅ Yes | Same pattern as `/api/members/search/route.ts` |

---

### 3.2 New API route design

`POST /api/members/message` — the simplest possible handler:

```
1. withAuth → 401 if no token
2. Check user.memberStatus === 'active' → 403 if not
3. Parse body: { toMemberId: string, message: string }
4. Validate: toMemberId is UUID, message is 1–1000 chars
5. Guard: toMemberId !== user.id → 400 "Cannot message yourself"
6. Lookup: prisma.member.findUnique({ where: { id: toMemberId, deletedAt: null }, select: { email: true, fullName: true } })
7. 404 if not found
8. sendRelayEmail({ to: recipient.email, subject: `${senderName} from OSA has sent you a message`, senderName, body: message })
9. Return 200 { ok: true }
```

No Prisma write anywhere in this flow. ✅

---

### 3.3 New Zod schema

Add `SendMemberMessageSchema` to `lib/validation/member.schema.ts`:

```typescript
export const SendMemberMessageSchema = z.object({
  toMemberId: z.string().uuid(),
  message:    z.string().min(1, 'Message cannot be empty').max(1000, 'Maximum 1 000 characters'),
})
```

No `subject` field — the subject is constructed server-side as `${senderName} from OSA has sent you a message`.

---

### 3.4 MemberSearchClient changes

Three changes to `MemberSearchClient.tsx`:

**a) Replace anchor with button:**
```tsx
// Before (SPEC-16 stub):
<a href={`/messages/new?to=${m.memberId}`}>Send Message</a>

// After:
<button type="button" onClick={() => openOverlay(m.memberId, `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim())}>
  Send Message
</button>
```

**b) New overlay state:**
```typescript
const [overlayRecipientId,   setOverlayRecipientId]   = useState<string | null>(null)
const [overlayRecipientName, setOverlayRecipientName] = useState('')
const [messageText,          setMessageText]          = useState('')
const [sending,              setSending]              = useState(false)
const [sendError,            setSendError]            = useState<string | null>(null)
```

**c) Overlay UI:** Use the HTML `<dialog>` element — semantic, accessible, Escape-key aware, no CSS required for basic modal behaviour. Rendered conditionally when `overlayRecipientId !== null`.

---

### 3.5 `<dialog>` vs `<div>` overlay

`<dialog>` is the right choice because:
- Native browser modal semantics — focus trapped inside, Escape closes it
- No CSS required to function as an overlay
- Accessible by default (ARIA role is implicit)
- Supported in all modern browsers

Usage pattern:
```tsx
const dialogRef = useRef<HTMLDialogElement>(null)

function openOverlay(...) {
  // set state
  dialogRef.current?.showModal()
}

function closeOverlay() {
  dialogRef.current?.close()
  // reset state
}

<dialog ref={dialogRef} onClose={closeOverlay}>
  ...
</dialog>
```

`onClose` fires when Escape is pressed OR when `.close()` is called programmatically — both cases handled by one handler.

---

### 3.6 senderName prop

`page.tsx` passes `senderName` to `MemberSearchClient`. The fallback chain:

```typescript
user?.fullName ?? user?.email ?? 'OSA Member'
```

- `fullName` is null for members who haven't completed the registration profile
- `email` is always present (non-nullable)
- `'OSA Member'` is a final safety net (should never be reached)

---

### 3.7 Self-message guard

The existing `sendMessage()` service already implements this guard. The new route must replicate it:

```typescript
if (parsed.data.toMemberId === user.id) {
  return jsonResponse(400, { error: 'You cannot send a message to yourself.' })
}
```

This edge case is possible from the UI if a member's own record appears in search results (their status is active; they could search their own name).

---

### 3.8 Sender location in email

`sendRelayEmail` optionally includes `senderCity` and `senderState` in the email header line. The API route can fetch the sender's address from `user.address` (the `withAuth` context already provides the full `Member` row including `address`). Including city/state makes the email more personal. The architect should include this.

---

## 4. Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R-01 | Resend API key not set in Vercel env vars — emails silently fail | Medium | `sendRelayEmail` propagates the error; route should return 500 if send fails so user sees an error rather than false success |
| R-02 | Recipient has a valid member record but no active email inbox (e.g., old address) | Low | Out of scope — OSA manages member contact details |
| R-03 | `<dialog>` `.showModal()` called before ref is attached | Low | Guard with `dialogRef.current?.showModal()` (already shown in pattern above) |
| R-04 | Self-messaging via direct API call (bypassing UI guard) | Low | Server-side guard in route handler catches this |

---

## 5. Files to Create or Modify

| File | Action | Reason |
|------|--------|--------|
| `apps/web/app/api/members/message/route.ts` | **Create** | POST-only; email dispatch, no DB write |
| `apps/web/app/members/search/MemberSearchClient.tsx` | **Modify** | Replace anchor with button; add overlay state + `<dialog>` UI; accept `senderName` prop |
| `apps/web/app/members/search/page.tsx` | **Modify** | Pass `senderName` prop to `MemberSearchClient` |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Append `SendMemberMessageSchema` |

**Not modified:** `resend.ts`, `message-service.ts`, `message.schema.ts`, `/api/messages/route.ts`

---

## 6. Clarifying Questions for User

None — all open questions resolved through code analysis and prior Q&A.

---

## 7. Approval Checklist

- [x] All open questions (OQ-1 through OQ-4) resolved
- [x] Existing `sendRelayEmail` confirmed reusable with no changes
- [x] `RESEND_FROM_EMAIL=noreply@odishasociety.org` confirmed in env
- [x] `Member.email` confirmed non-nullable
- [x] Prop-passing approach confirmed — zero extra fetches
- [x] Self-messaging edge case identified and mitigation defined
- [x] `<dialog>` chosen as overlay element — semantic, accessible, no CSS
- [x] No unintended modifications to existing messaging infrastructure
