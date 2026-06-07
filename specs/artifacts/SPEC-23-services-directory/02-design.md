# SPEC-23 — Phase 2: Design

**Spec:** Services Directory & Discrete Messaging
**Architect:** Claude Code
**Date:** 2026-06-07
**Status:** Approved

---

## Decisions

| ID | Decision |
|----|----------|
| D-01 | Pages are unstyled functional stubs. NFR-03 (premium cards) and NFR-04 (responsive grid) deferred to a future Figma-driven styling spec. |
| D-02 | `ServiceProvider.email` is never included in any API response. All listing queries use explicit `select` that omits `email`. |
| D-03 | Rate limit implemented via Prisma count on `ServiceContactLog` (5 messages/member/hour). No Redis needed. |
| D-04 | `isOsaMember` badge derived from `memberId` join + `memberStatus === 'active'`. No email comparison. |
| D-05 | Resend call happens before log write. If Resend throws, return 502 and do not write the log. |
| D-06 | Registration is members-only. `memberId` is always set from the authenticated session — not user-supplied. |
| D-07 | "Services" added as first static `<li>` under Programs submenu in nav-bar. |
| D-08 | Profile photo is optional. Provider supplies an external URL (e.g. Google Drive public link) — no file upload, no Vercel/Supabase storage. Rendered as a small constrained `<img>` (max 80×80px via HTML `width`/`height` attributes). Falls back to initials text if no URL provided. |
| D-09 | FR-08 (My Service Profile) surfaced via a link on `/dashboard`; edit/delete at `/services/[id]/edit`. |
| D-10 | FR-09 (Admin Moderation) surfaced via `/admin/services` — list with toggle `isActive` and delete. |

---

## Prisma Schema

```prisma
model ServiceProvider {
  id              String   @id @default(uuid()) @db.Uuid
  memberId        String   @unique @map("member_id") @db.Uuid
  email           String   @unique                          // routing only — never exposed in API
  fullName        String   @map("full_name")
  bio             String   @db.Text
  specializations String[]
  onlineClasses   Boolean  @default(false) @map("online_classes")
  phone           String?
  websiteUrl      String?  @map("website_url")
  photoUrl        String?  @map("photo_url")                                   // external URL only — no hosted uploads
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  member       Member             @relation(fields: [memberId], references: [id], onDelete: Cascade)
  contactLogs  ServiceContactLog[]

  @@map("service_providers")
}

model ServiceContactLog {
  id                String   @id @default(uuid()) @db.Uuid
  serviceProviderId String   @map("service_provider_id") @db.Uuid
  senderMemberId    String   @map("sender_member_id") @db.Uuid
  subject           String
  body              String   @db.Text
  sentAt            DateTime @default(now()) @map("sent_at") @db.Timestamptz

  provider ServiceProvider @relation(fields: [serviceProviderId], references: [id], onDelete: Cascade)
  sender   Member          @relation(fields: [senderMemberId], references: [id])

  @@index([senderMemberId, sentAt])
  @@map("service_contact_logs")
}
```

Back-relations added to `Member`:
```prisma
serviceProvider    ServiceProvider?
serviceContactsSent ServiceContactLog[]
```

---

## API Routes

### `GET /api/services`
- **Auth:** `withAuth` (any member, any status)
- **Query params:** `specialization` (string), `onlineOnly` (`"true"`)
- **Response:** `{ providers: [{ id, fullName, bio, specializations, onlineClasses, phone, websiteUrl, isOsaMember, createdAt }] }`
- `isOsaMember = member.memberStatus === 'active'`
- `email` field **never** in response

### `POST /api/services`
- **Auth:** `withAuth`, `memberStatus === 'active'`; returns 403 otherwise
- **Body:** `{ bio, specializations, onlineClasses, phone?, websiteUrl? }`
- `fullName` and `email` sourced from `ctx.user` (never user-supplied)
- Returns 409 if member already has a profile
- **Response 201:** `{ provider: { id, fullName, bio, specializations, onlineClasses, phone, websiteUrl } }`

### `PATCH /api/services/[id]`
- **Auth:** `withAuth`; member must own the profile OR be admin
- **Body:** `{ bio?, specializations?, onlineClasses?, phone?, websiteUrl?, isActive? }`
- `isActive` field only settable by admin; ignored for non-admin callers
- **Response 200:** updated provider (no email)

### `DELETE /api/services/[id]`
- **Auth:** `withAuth`; own profile or admin
- **Response 204**

### `POST /api/services/[id]/contact`
- **Auth:** `withAuth`, `memberStatus === 'active'`; returns 403 otherwise
- **Rate limit:** count `ServiceContactLog` where `senderMemberId = ctx.user.id AND sentAt > now() - 1h`; return 429 if ≥ 5
- **Body:** `{ subject, body }`
- Server fetches provider `email` internally (select only email, never returned)
- Calls `sendServiceContactEmail({ to: provider.email, ... })`
- Writes `ServiceContactLog` only after successful Resend call
- **Response 200:** `{ message: 'Message sent successfully' }`

---

## Zod Schemas (`lib/validation/service-provider.schema.ts`)

```ts
RegisterProviderSchema = z.object({
  bio: z.string().min(10).max(1000),
  specializations: z.array(z.string()).min(1).max(10),
  onlineClasses: z.boolean(),
  phone: z.string().max(20).optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  photoUrl: z.string().url().optional().or(z.literal('')),  // external URL, no upload
})

UpdateProviderSchema = RegisterProviderSchema.partial().extend({
  isActive: z.boolean().optional(),
})

ContactProviderSchema = z.object({
  subject: z.string().min(1).max(100),
  body: z.string().min(10).max(2000),
})
```

---

## Service Layer (`lib/services/service-provider-service.ts`)

```ts
listProviders(filters): Promise<ProviderPublic[]>   // omits email
getProviderById(id): Promise<ProviderPublic | null>  // omits email
getProviderEmail(id): Promise<string | null>         // server-internal only, used by contact route
createProvider(memberId, email, fullName, data): Promise<ProviderPublic>
updateProvider(id, data): Promise<ProviderPublic>
deleteProvider(id): Promise<void>
```

`ProviderPublic` type explicitly excludes `email`.

---

## Email (`lib/messaging/service-contact.ts`)

New function separate from `sendRelayEmail` to allow a different email template:

```ts
sendServiceContactEmail({
  to: string          // provider email — server only
  providerName: string
  senderName: string
  senderEmail: string // included in body as reply-to coordinates
  subject: string
  body: string
}): Promise<void>
```

Template:
```
Subject: [OSA Services] {subject}

{senderName} ({senderEmail}) found your profile on the OSA Services Directory
and would like to connect with you:

{body}

---
To reply, contact {senderName} directly at {senderEmail}.
This message was sent via the OSA Community Platform.
Odisha Society of the Americas — www.odishasociety.org
```

---

## Pages

### `/services` — Directory listing
- Server component, `force-dynamic`
- `getCurrentMember()` → redirect `/login` if null
- Fetch providers via `listProviders(filters)` from service layer
- Filter form: specialization select + online-only checkbox (`<form method="GET">`)
- Each card: fullName initials avatar, name, bio (truncated), specializations, online badge, OSA Member badge, "Contact" button (links to modal)
- "Register as a Service Provider" link (shown if member has no profile yet)

### `/services/register` — Registration form
- Server component shell; client `<form>` with `useActionState` or direct fetch to `POST /api/services`
- Fields: bio (textarea), specializations (checkboxes), onlineClasses (checkbox), phone, websiteUrl
- Name and email auto-populated from session (not editable — sourced server-side)
- On success: redirect to `/services`

### `/services/[id]/edit` — Edit own profile
- Same form as register, pre-populated via server fetch
- Submits to `PATCH /api/services/[id]`

### `ContactButton.tsx` — Client component
- Receives `providerId` and `providerName` as props (no email)
- Renders "Contact" button → inline form (subject + message textarea)
- Fetches `POST /api/services/[id]/contact` with Bearer token from Supabase session
- Shows success message or error (403 / 429)

### `/admin/services` — Admin moderation (new stub page)
- Fetches all providers including inactive
- Toggle `isActive` via `PATCH /api/services/[id]` with admin token
- Delete button

---

## Nav Change

`app/components/nav-bar.tsx` — Programs `<ul>`:

```tsx
<ul>
  <li><Link href="/services">Services</Link></li>   {/* new — first item */}
  {programs.map((p) => (
    <li key={p._id}><Link href={`/programs/${p.slug}`}>{p.title}</Link></li>
  ))}
</ul>
```

---

## Test Coverage Plan

| File | Tests |
|------|-------|
| `app/api/services/route.test.ts` | GET (unauthed 401, member 200, filter by specialization, filter onlineOnly), POST (non-active 403, duplicate 409, active 201) |
| `app/api/services/[id]/route.test.ts` | PATCH (non-owner 403, owner 200, admin can set isActive), DELETE (non-owner 403, owner 204, admin 204) |
| `app/api/services/[id]/contact/route.test.ts` | non-active 403, rate-limit 429, Resend fail 502, success 200, email absent from all responses |

---

## Build Sequence

1. Prisma schema + `db push` + `generate`
2. Zod schemas
3. Service layer (`service-provider-service.ts`)
4. Email function (`service-contact.ts`)
5. RED tests for all 3 API route files
6. Implement API routes (GREEN)
7. Nav bar update
8. Pages: `/services`, `/services/register`, `/services/[id]/edit`, `ContactButton.tsx`
9. Admin stub: `/admin/services`
10. Dashboard link (FR-08)
