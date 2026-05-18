# Phase 4 QA Report — SPEC-17: Member Messaging

> **Spec:** `specs/active/SPEC-17-member-messaging.md`
> **Status:** Complete — PASSED
> **Date:** 2026-05-17
> **Depends on:** `03-implementation.md`

---

## 1. Automated Checks

| Check | Result | Notes |
|-------|--------|-------|
| `pnpm build --filter=web` | ✅ PASS | Clean build |
| `pnpm lint --filter=web` | ✅ PASS | No ESLint warnings or errors |
| `tsc --noEmit` (new/modified files) | ✅ PASS | Zero errors |

---

## 2. Acceptance Criteria Verification

| # | Criterion | Result | Evidence |
|---|-----------|--------|---------|
| AC-01 | "Send Message" is a `<button>`, not an `<a>` | ✅ | `MemberSearchClient.tsx:279` |
| AC-02 | Clicking opens overlay without navigation | ✅ | `openOverlay()` → `dialogRef.current?.showModal()` — no `router.push` |
| AC-03 | Overlay shows correct TO and FROM | ✅ | `<dialog>:318-319` — TO = `overlayRecipientName`, FROM = `senderName` prop |
| AC-04 | Textarea max 1 000 chars + live counter | ✅ | `maxLength={1000}` + `{1000 - messageText.length} characters remaining` |
| AC-05 | Empty body blocks Send button | ✅ | `disabled={!messageText.trim() \|\| sending}` |
| AC-06 | Cancel closes overlay; results intact | ✅ | `closeOverlay()` resets overlay state only; search results state untouched |
| AC-07 | Escape key closes overlay | ✅ | `<dialog onClose={closeOverlay}>` — browser fires `close` event on Escape natively |
| AC-08 | On success overlay closes, results stay | ✅ | `closeOverlay()` called after 200 response; no search state mutation |
| AC-09 | On failure error shown inside overlay | ✅ | `setSendError(...)` keeps overlay open with error message |
| AC-10 | Recipient email not in API response | ✅ | Response is `{ ok: true }` only; email used server-side and never serialised |
| AC-11 | Email sent with correct subject | ✅ | `subject: \`${senderName} from OSA has sent you a message\`` |
| AC-12 | noreply enforced; no reply-to header | ✅ | `resend.ts` has no `replyTo` field — confirmed by grep |
| AC-13 | No DB write | ✅ | No Prisma `create`/`update` in route; `sendRelayEmail` only |
| AC-14 | API 401 — no token | ✅ | `withAuth` |
| AC-15 | API 403 — non-active caller | ✅ | `route.ts:16-18` |
| AC-16 | API 400 — empty message | ✅ | `SendMemberMessageSchema` `min(1)` |
| AC-17 | API 400 — message > 1 000 chars | ✅ | `SendMemberMessageSchema` `max(1000)` |
| AC-18 | API 400 — self-message | ✅ | `route.ts:31-33` — `toMemberId === user.id` guard |
| AC-19 | API 404 — unknown recipient | ✅ | `route.ts:39-41` — Prisma returns null → 404 |
| AC-20 | API 500 — Resend failure | ✅ | `try/catch` around `sendRelayEmail` → 500 with user-facing error |

---

## 3. Logic Verification

### 3.1 Zod schema — `SendMemberMessageSchema` (executed)

| Input | Expected | Result |
|-------|----------|--------|
| Valid UUID + "Hello" | Pass | ✅ |
| Empty message `""` | Fail | ✅ |
| Message 1 001 chars | Fail | ✅ |
| Message exactly 1 000 chars | Pass | ✅ |
| Invalid UUID | Fail | ✅ |
| Empty object `{}` | Fail | ✅ |

### 3.2 `closeOverlay()` double-call safety (executed)

When Cancel is clicked, `closeOverlay()` runs, then the dialog fires `onClose` triggering `closeOverlay()` a second time. Verified idempotent — all state resets are no-ops on second call; `dialogRef.current?.close()` on an already-closed dialog is a browser no-op.

### 3.3 Recipient display name (executed)

| firstName | lastName | Result |
|-----------|----------|--------|
| null | null | `"this member"` ✅ |
| `"Utkal"` | null | `"Utkal"` ✅ |
| null | `"Nayak"` | `"Nayak"` ✅ |
| `"Utkal"` | `"Nayak"` | `"Utkal Nayak"` ✅ |

### 3.4 Security review

| Check | Result |
|-------|--------|
| Recipient email in API response | ✅ Not present — response is `{ ok: true }` |
| Sender email in API response | ✅ Not present |
| reply-to header in outbound email | ✅ Absent — `resend.ts` has no `replyTo` field |
| Message body size enforced server-side | ✅ `SendMemberMessageSchema max(1000)` |
| Self-message via direct API call | ✅ Blocked server-side — `toMemberId === user.id` |
| Messaging a soft-deleted member | ✅ Blocked — `where: { id, deletedAt: null }` → 404 |
| SQL injection / Prisma parameterisation | ✅ All values parameterised by Prisma |

---

## 4. Known Limitations

| Limitation | Severity | Accepted? |
|------------|----------|-----------|
| Pressing Escape while a send is in-flight closes the overlay but the email still sends server-side (user sees no result) | Low — rare race; email is delivered correctly | ✅ Yes — acceptable for this phase |
| No rate limiting — an active member could send many emails in quick succession | Low — deferred to a future anti-spam spec | ✅ Yes — noted in spec non-goals |

---

## 5. Verdict

**PASSED.** All 20 acceptance criteria verified. Build and lint clean. Zod schema validated against 6 cases. Security review clear — no PII leaks, noreply enforced, no DB writes. Double-call and null-name edge cases confirmed safe.

Ready to be marked **Complete** and moved to `specs/completed/`.
