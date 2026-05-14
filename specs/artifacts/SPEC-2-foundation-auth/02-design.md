# Phase 2: Architecture Design

> **Spec:** SPEC-2-foundation-auth
> **Architect Agent:** Claude Code (claude-sonnet-4-6)
> **Date:** 2026-05-13
> **Status:** Complete

---

## §1 Design Summary

This spec builds the authentication and data-access foundation for the OSA Next.js website exclusively inside `apps/web/`. It introduces four shared primitives — a Prisma singleton (`lib/db/prisma.ts`), a Supabase admin client (`lib/auth/supabase-admin.ts`), a role hierarchy constant (`lib/auth/roles.ts`), and the `withAuth()` route wrapper (`lib/auth/with-auth.ts`) — that every subsequent spec will import without modification. The pattern is a thin functional composition model: `withAuth(handler, { role? })` returns a Next.js App Router route handler whose internal pipeline is token extraction → `supabaseAdmin.auth.getUser()` → Prisma upsert JIT sync → soft-delete check → role check → delegate to handler. A standard `@supabase/ssr` OAuth callback route exchanges Google's authorization code for a session cookie. Page-level protection is handled by a lightweight `middleware.ts` that uses the anon-key cookie client to redirect unauthenticated visitors away from `/dashboard/*` and `/admin/*`; middleware is explicitly not a security boundary — all enforcement lives inside `withAuth()` in the API layer. Prisma lives in `apps/web/prisma/` with a generate output of `./node_modules/.prisma/client` so the generated client lands in the web package's local `node_modules`, compatible with Turborepo workspace isolation. The `members` table schema is a flat representation of `docs/osa-architecture.md` §2, not the NestJS `User/Profile/Membership` normalized structure.

---

## §2 Architecture Decisions

### Decision 1 — Prisma location: `apps/web/prisma/`

**Decision:** Place `prisma/schema.prisma` and the migration directory inside `apps/web/prisma/`. Set the generator `output` to `./node_modules/.prisma/client` (relative to `apps/web/`).

**Rationale:** Turborepo treats each `apps/*` package as an isolated build unit. The `apps/api/` package already has its own `prisma/` directory generating its own client against a different schema. If `apps/web/` referenced a root-level schema, `pnpm build --filter=web` would silently use the wrong (NestJS) schema. An isolated schema and generated client per package eliminates cross-contamination. The output path `./node_modules/.prisma/client` is the Prisma default convention and lands inside `apps/web/node_modules/`, meaning `@prisma/client` imports in `apps/web/` resolve to the web-specific generated code.

**Alternatives rejected:**
- Root-level `prisma/` — would be shared between packages; the two apps have entirely different schemas (NestJS has 14+ models; new website starts with `members` only).
- `apps/web/generated/prisma/` — non-standard path requires additional tsconfig path aliases and complicates Vercel's Prisma build detection.

---

### Decision 2 — `withAuth()` signature and token extraction strategy

**Decision:**
```ts
type AuthHandler = (req: Request, ctx: { user: MemberRow }) => Promise<Response>

function withAuth(
  handler: AuthHandler,
  options?: { role?: Role }
): (req: Request) => Promise<Response>
```
Token extraction: read the `Authorization` header, split on `' '`, take index 1 as the Bearer token. Validate by calling `supabaseAdmin.auth.getUser(token)` — never decode the JWT locally.

**Rationale:** Bearer token strategy works for both browser clients (passing `supabaseClient.auth.getSession()` access token) and server-to-server calls. Supabase's `getUser(token)` makes an authoritative call to the Supabase Auth server for signature verification and expiry checks — removing any risk of a locally misconfigured JWT secret accepting forged tokens. The `ctx.user` typed as `MemberRow` gives handlers compile-time certainty about available fields.

**Alternatives rejected:**
- Cookie-based auth in API routes — requires importing the `@supabase/ssr` cookie client in every route, coupling route handlers to the Next.js request/response cycle. Bearer token is cleaner and independently testable.
- Local JWT decode via `jose` — reduces round-trips but introduces a locally managed secret and misses server-side token revocation. Supabase `getUser()` is the authoritative validator per spec §4.2.

---

### Decision 3 — JIT sync strategy: upsert on `email`

**Decision:** Use Prisma `upsert` with `where: { email: authUser.email }`. The `create` branch sets `email`, `userId`, and `role: 'member'`. The `update` branch writes `userId` (to link user_id if the record was admin-pre-created with a null `user_id`).

**Rationale:** The `members.email` column has a `UNIQUE` constraint, making `upsert` on `email` safe and idempotent. A plain `create` would throw a unique-constraint error on the second login. A `findUnique` + conditional `create` is two round-trips with a TOCTOU race window. Prisma's `upsert` compiles to a single `INSERT ... ON CONFLICT DO UPDATE` in PostgreSQL, which is atomic at the database level and safe under PgBouncer transaction mode.

**Alternatives rejected:**
- Upsert on `user_id` — `user_id` is nullable (admin-linked accounts may not have it set yet), so it cannot serve as the lookup key for a user arriving via OAuth.
- `findUnique` + `create` — two round-trips; race condition possible under concurrent first requests.

---

### Decision 4 — Middleware scope: UX redirect only, anon key

**Decision:** `middleware.ts` uses `createServerClient` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to check whether a session cookie is present. If no session exists and the pathname starts with `/dashboard` or `/admin`, it redirects to `/login`. The middleware does not import `supabase-admin.ts`, does not query Prisma, and makes no security enforcement decisions.

**Rationale:** Next.js middleware runs in the Edge runtime. The Edge runtime cannot use Prisma (Node.js native bindings) or the Supabase admin client (service role key exposure risk in the Edge bundle). The actual security gate is `withAuth()` in API routes, which runs in the Node.js runtime. Middleware is a UX affordance only — preventing unauthenticated users from seeing a blank dashboard before a client-side redirect would kick in.

**Alternatives rejected:**
- Full RBAC in middleware — Edge runtime constraints prevent Prisma usage; duplicating role logic in two places creates drift risk.
- No middleware — users would see the dashboard skeleton before `withAuth()` rejects them, creating a jarring UX.

---

### Decision 5 — OAuth callback route: essential, added to spec

**Decision:** Add `app/api/auth/callback/route.ts`. This route handles Supabase's OAuth redirect: reads the `code` query param, calls `supabase.auth.exchangeCodeForSession(code)`, sets session cookies via `@supabase/ssr`, then redirects to `/dashboard`.

**Rationale:** Google OAuth with Supabase requires a registered redirect URI. Supabase redirects to this route after the user authorizes with Google. Without it, `signInWithOAuth` would have no endpoint to land on and the session would never be established. This route was missing from the original spec's file list (identified in analysis §2.2) but is mandatory for the OAuth flow to function.

**Alternatives rejected:**
- Client-side code exchange — would expose tokens in the browser URL and bypass httpOnly cookie security.
- Omitting entirely and using Supabase's hosted callback — not applicable for custom Next.js deployments.

---

### Decision 6 — Role hierarchy: lowercase `{ member: 1, admin: 2 }`

**Decision:**
```ts
export const ROLE_HIERARCHY: Record<Role, number> = {
  member: 1,
  admin: 2,
}
```

**Rationale:** The architecture document (`docs/osa-architecture.md` §2) defines `members.role` as `enum { member · admin }` in lowercase. The NestJS app used uppercase `MEMBER / ADMIN / CONTRIBUTOR / GUEST` because it had four roles and a different naming convention. The new website has exactly two roles. Lowercase string values that match the DB enum avoid a mapping layer between the Prisma enum and display strings.

**Alternatives rejected:**
- Four-level hierarchy (guest, member, contributor, admin) — `contributor` role does not exist in the new architecture; Sanity CMS handles content authors independently.
- Uppercase enum values — would diverge from the architecture doc schema without benefit; also breaks Prisma enum matching since the DB stores lowercase literals.

---

## §3 Prisma Schema Design

Full content for `apps/web/prisma/schema.prisma`:

```prisma
// OSA Website — Prisma Schema
// apps/web/prisma/schema.prisma
// Only the members table is defined here.
// All other tables are added in later specs (SPEC-3 through SPEC-7).

generator client {
  provider = "prisma-client-js"
  output   = "./node_modules/.prisma/client"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum Role {
  member
  admin

  @@map("role")
}

enum MembershipType {
  annualStudentNoVote @map("annual-student-no-vote")
  annualSingle        @map("annual-single")
  annualFamily        @map("annual-family")
  fiveYearFamily      @map("five-year-family")
  life
  lifeWard            @map("life-ward")
  patron
  benefactor
  honoraryNoVote      @map("honorary-no-vote")

  @@map("membership_type")
}

enum MemberStatus {
  active
  expired
  suspended

  @@map("member_status")
}

enum SouvenirPreference {
  electronic
  print

  @@map("souvenir_preference")
}

enum FamilyRole {
  primary
  partner
  minor

  @@map("family_role")
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

model Member {
  id                 String              @id @default(uuid()) @db.Uuid
  userId             String?             @unique @map("user_id") @db.Uuid
  stripeCustomerId   String?             @map("stripe_customer_id")
  email              String              @unique
  fullName           String?             @map("full_name")
  phone              String?
  address            Json?
  chapterId          String?             @map("chapter_id") @db.Uuid
  membershipType     MembershipType?     @map("membership_type")
  memberStatus       MemberStatus?       @map("member_status")
  joinDate           DateTime?           @map("join_date") @db.Date
  expiryDate         DateTime?           @map("expiry_date") @db.Date
  profileVisibility  Json?               @map("profile_visibility")
  role               Role                @default(member)
  souvenirPreference SouvenirPreference? @map("souvenir_preference")
  // Family linkage — all household members share the same familyId UUID
  familyId           String?             @map("family_id") @db.Uuid
  familyRole         FamilyRole?         @map("family_role")
  // Primary members only: links to the familyId of a related family unit
  parentFamilyId     String?             @map("parent_family_id") @db.Uuid
  createdAt          DateTime            @default(now()) @map("created_at") @db.Timestamptz
  deletedAt          DateTime?           @map("deleted_at") @db.Timestamptz

  paymentRecords     PaymentRecord[]

  @@map("members")
}
```

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECORDS
// ─────────────────────────────────────────────────────────────────────────────

model PaymentRecord {
  id            String    @id @default(uuid()) @db.Uuid
  memberId      String    @map("member_id") @db.Uuid
  transactionId String?   @map("transaction_id")
  paymentDate   DateTime? @map("payment_date") @db.Timestamptz
  amount        Decimal?  @db.Decimal(10, 2)
  notes         String?
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz

  member Member @relation(fields: [memberId], references: [id])

  @@map("payment_records")
}
```

**Schema notes:**

- `@@map("role")` and similar `@@map` directives on enums tell Prisma the PostgreSQL enum type names are lowercase snake_case. Prisma enum values (`member`, `admin`) must match the DB enum literal values exactly.
- `userId` is nullable (`String?`) to support the admin-linked-account flow: admins can pre-create member records before the person has authenticated, then JIT sync links the `user_id` on first login.
- `deleted_at` is added per the analysis requirement (§2.2) — not in the architecture doc's column list but required by `withAuth()` soft-delete logic. It uses `@db.Timestamptz` consistent with `created_at`.
- `@db.Uuid` on id fields ensures Prisma uses the PostgreSQL `uuid` type, matching the architecture doc's `uuid PK` specification.
- `@db.Date` on date columns and `@db.Timestamptz` on timestamp columns matches Supabase's default column types for these field categories.
- No `updatedAt` column — the architecture doc does not include `updated_at` on the `members` table. If needed in a later spec, it will be added via migration then.
- `chapterId` replaces the earlier plain `chapter String?` field. It stores a UUID reference to a future `chapters` table. No Prisma `@relation` is declared here — the FK constraint and `Chapter` model are added when the chapters spec is implemented. For now the field is an unvalidated UUID store.
- `familyId` is a shared UUID — all members of the same household receive the same value. It is NOT a PK and has no `@unique` constraint. Multiple members may share the same `familyId`.
- `parentFamilyId` is for **primary** members only. It holds the `familyId` UUID of a related family unit (e.g., linking a student to their parent family). Prisma has no declared relation for this field; the application enforces the linkage semantics. Constraint: only set when `familyRole = primary`.
- `PaymentRecord` is a child table (one member : many records). The `member` relation on `PaymentRecord` and the `paymentRecords` array on `Member` form a standard one-to-many Prisma relation. Payment records are append-only; no soft-delete on this table.

---

## §4 Component Design

### 4.1 File: `prisma/schema.prisma`

**Path:** `apps/web/prisma/schema.prisma`
**Purpose:** Defines the Prisma data model for the web package — `members` table only.
**Key exports:** None (schema file, not TypeScript).
**Implementation notes:** Run `pnpm prisma generate` from `apps/web/` after creating this file. The `output = "./node_modules/.prisma/client"` path puts the generated client at `apps/web/node_modules/.prisma/client/`. The `@prisma/client` package in `apps/web/node_modules/@prisma/client` re-exports from that path automatically.

---

### 4.2 File: `lib/db/prisma.ts`

**Path:** `apps/web/lib/db/prisma.ts`
**Purpose:** Exports a singleton `PrismaClient` instance safe for serverless/Next.js hot-reload environments.
**Key exports:**
```ts
export const prisma: PrismaClient
```
**Implementation notes:** Use the `globalThis` pattern to avoid creating a new `PrismaClient` on every hot-module-reload in development:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```
This file must never be imported in client components. `PrismaClient` is Node.js-only.

---

### 4.3 File: `lib/auth/supabase-admin.ts`

**Path:** `apps/web/lib/auth/supabase-admin.ts`
**Purpose:** Exports a singleton Supabase admin client using the service role key (bypasses RLS).
**Key exports:**
```ts
export const supabaseAdmin: SupabaseClient
```
**Implementation notes:**
- Uses `createClient` from `@supabase/supabase-js` (not `@supabase/ssr`) — the admin client does not manage cookies.
- Environment variables are validated at module import time, not at first usage:
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    'Missing required environment variables: ' +
    (!supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL ' : '') +
    (!serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : '')
  )
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
```
- `autoRefreshToken: false` and `persistSession: false` are required for server-side admin clients. They must not attempt to store or refresh tokens.
- This file must never be imported in `middleware.ts` or any client component.

---

### 4.4 File: `lib/auth/roles.ts`

**Path:** `apps/web/lib/auth/roles.ts`
**Purpose:** Defines the `Role` type and `ROLE_HIERARCHY` constant used by `withAuth()` and future role-check helpers.
**Key exports:**
```ts
export type Role = 'member' | 'admin'

export const ROLE_HIERARCHY: Record<Role, number> = {
  member: 1,
  admin: 2,
}
```
**Implementation notes:** This file has zero runtime dependencies. It is kept separate from `with-auth.ts` so future specs can import `Role` and `ROLE_HIERARCHY` without pulling in `withAuth()` and its Prisma/Supabase dependencies.

---

### 4.5 File: `lib/auth/with-auth.ts`

**Path:** `apps/web/lib/auth/with-auth.ts`
**Purpose:** Higher-order function that wraps a Next.js App Router API route handler with authentication, JIT sync, soft-delete check, and role enforcement.
**Key exports:**
```ts
import type { Member } from '@prisma/client'
export type MemberRow = Member

export type AuthHandler = (
  req: Request,
  ctx: { user: MemberRow }
) => Promise<Response>

export function withAuth(
  handler: AuthHandler,
  options?: { role?: Role }
): (req: Request) => Promise<Response>
```
**Implementation logic (pseudocode):**
```
function withAuth(handler, options):
  return async function routeHandler(req):

    // Step 1: Extract Bearer token
    authHeader = req.headers.get('Authorization')
    if not authHeader or not authHeader.startsWith('Bearer '):
      return jsonResponse(401, { error: 'Missing or invalid Authorization header' })

    token = authHeader.split(' ')[1]
    if not token:
      return jsonResponse(401, { error: 'Missing or invalid Authorization header' })

    // Step 2: Validate token with Supabase
    { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token)
    if error or not authUser or not authUser.email:
      return jsonResponse(401, { error: 'Invalid or expired token' })

    // Step 3: JIT sync — upsert members row
    member = await prisma.member.upsert({
      where: { email: authUser.email },
      create: {
        email: authUser.email,
        userId: authUser.id,
        role: 'member',
      },
      update: {
        userId: authUser.id,
      },
    })

    // Step 4: Soft-delete check
    if member.deletedAt is not null:
      return jsonResponse(401, { error: 'Account has been deactivated' })

    // Step 5: Role check (only if options.role is specified)
    if options?.role is defined:
      userLevel = ROLE_HIERARCHY[member.role]
      requiredLevel = ROLE_HIERARCHY[options.role]
      if userLevel < requiredLevel:
        return jsonResponse(403, { error: 'Insufficient permissions' })

    // Step 6: Call handler
    return handler(req, { user: member })

helper jsonResponse(status, body):
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
```
**Implementation notes:**
- Import `prisma` from `@/lib/db/prisma`.
- Import `supabaseAdmin` from `@/lib/auth/supabase-admin`.
- Import `ROLE_HIERARCHY`, `Role` from `@/lib/auth/roles`.
- The `update` branch of the upsert intentionally only writes `userId` — it does not overwrite profile data (`fullName`, `memberStatus`, etc.) that may have been set by an admin.

---

### 4.6 File: `app/api/auth/callback/route.ts`

**Path:** `apps/web/app/api/auth/callback/route.ts`
**Purpose:** Handles Supabase OAuth redirect — exchanges the `code` parameter for a session cookie and redirects to the dashboard.
**Key exports:**
```ts
export async function GET(request: Request): Promise<Response>
```
**Implementation notes:**
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```
- The Supabase project's "Redirect URLs" must include `http://localhost:3000/api/auth/callback` for local dev.
- The `next` param allows deep-link support in future specs (e.g., `/api/auth/callback?next=/dashboard/profile`).
- Uses `await cookies()` — required in Next.js 15 where `cookies()` is async.

---

### 4.7 File: `app/api/auth/me/route.ts`

**Path:** `apps/web/app/api/auth/me/route.ts`
**Purpose:** Canonical health-check endpoint that returns the authenticated member's record. Demonstrates `withAuth()` at its simplest form.
**Key exports:**
```ts
export const GET: (req: Request) => Promise<Response>
```
**Implementation notes:**
```ts
import { withAuth } from '@/lib/auth/with-auth'

export const GET = withAuth(async (_req, { user }) => {
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```
No role restriction. Any authenticated (non-deleted) user can call it.

---

### 4.8 File: `app/login/page.tsx`

**Path:** `apps/web/app/login/page.tsx`
**Purpose:** Login page — renders the OSA heading and a "Sign in with Google" button.
**Key exports:** Default export `LoginPage` React server component.
**Implementation notes:**
- Server component shell with `Metadata` export for page title.
- Renders `<LoginButton />` as a client component child.
- **NO brand styling, colors, or visual design** — use only structural HTML elements (`<main>`, `<h1>`, `<p>`) with no Tailwind classes or inline styles. A Figma design will be applied later; this placeholder must be trivially replaceable.
- If user is already authenticated (session cookie present), optionally redirect to `/dashboard` using `redirect()` — prevents showing login page to logged-in users.

---

### 4.9 File: `app/login/login-button.tsx`

**Path:** `apps/web/app/login/login-button.tsx`
**Purpose:** Client component containing the OAuth trigger — must be `'use client'` because it uses `onClick`.
**Key exports:** Default export `LoginButton` React client component.
**Implementation notes:**
```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'

export default function LoginButton() {
  const handleSignIn = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
  }

  return (
    <button onClick={handleSignIn}>
      Sign in with Google
    </button>
  )
}
```
- `createBrowserClient` is created inside the click handler (or via `useState`), not at module level — consistent with `@supabase/ssr` documentation recommending initialization inside the request lifecycle.
- **No styling** — plain `<button>` element with no classes. Figma design will replace this entirely.

---

### 4.10 File: `app/dashboard/page.tsx`

**Path:** `apps/web/app/dashboard/page.tsx`
**Purpose:** Minimal placeholder page that prevents a 404 after successful OAuth login redirect.
**Key exports:** Default export `DashboardPage` React server component.
**Implementation notes:**
- Server component. Creates a Supabase SSR client with `await cookies()`, calls `supabase.auth.getUser()`. If no user, calls `redirect('/login')`. This is defense-in-depth UX — the security boundary is `withAuth()`.
- Content: bare `<h1>Dashboard</h1>` and `<p>You are logged in.</p>` — no styling, no layout.
- **No styling** — this is a routing stub only. Future specs will replace it with Figma-designed content.

---

### 4.11 File: `middleware.ts`

**Path:** `apps/web/middleware.ts`
**Purpose:** Intercepts page navigation to redirect unauthenticated visitors away from protected routes before rendering.
**Key exports:**
```ts
export async function middleware(request: NextRequest): Promise<NextResponse>
export const config: { matcher: string[] }
```
**Implementation notes:**
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth/callback).*)',
  ],
}
```
- The `setAll` cookie refresh pattern (copying cookies to both `request` and `supabaseResponse`) is the standard `@supabase/ssr` middleware pattern for propagating refreshed session tokens.
- Must NOT import `supabase-admin.ts`, `lib/db/prisma.ts`, or `lib/auth/with-auth.ts`.
- The `config.matcher` explicitly excludes `api/auth/callback` so the OAuth exchange route is never intercepted.

---

### 4.12 Package changes required

Add to `apps/web/package.json` dependencies:
```json
"@prisma/client": "^6.2.0"
```

Add to `apps/web/package.json` devDependencies:
```json
"prisma": "^6.2.0"
```

Add to `apps/web/package.json` scripts:
```json
"prisma:generate": "prisma generate",
"prisma:push": "prisma db push",
"prisma:studio": "prisma studio"
```

`@supabase/ssr` (`^0.5.2`) and `@supabase/supabase-js` (`^2.47.10`) are already present. No version bumps needed for this spec.

For unit testing Group A files, also add as devDependencies (check root-level Jest config first — if the monorepo already provides Jest to `apps/web/`, skip):
```json
"jest": "^29",
"@types/jest": "^29",
"ts-jest": "^29",
"jest-environment-node": "^29"
```

---

### 4.13 `.env.example` content

**Path:** `apps/web/.env.example`

```bash
# ─────────────────────────────────────────────────────────────────
# Supabase Project (Public — safe for client-side use)
# ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from: supabase status → anon key>

# ─────────────────────────────────────────────────────────────────
# Supabase Service Role Key (SERVER-ONLY — never expose to client)
# ─────────────────────────────────────────────────────────────────
SUPABASE_SERVICE_ROLE_KEY=<from: supabase status → service_role key>

# ─────────────────────────────────────────────────────────────────
# Database (for Prisma)
#
# LOCAL DEVELOPMENT:
#   Both URLs point to local Supabase PostgreSQL on port 54322.
#
# PRODUCTION (replace [ref] and [password] with your project values):
#   DATABASE_URL uses PgBouncer (port 6543, ?pgbouncer=true)
#   DIRECT_URL uses direct connection (port 5432) for migrations
# ─────────────────────────────────────────────────────────────────

# Local development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Production example (uncomment and fill in for Vercel deployment):
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
# DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

---

## §4.4 File Ownership Map

This section gates parallel implementation. Every file created or modified in this spec appears in exactly one group.

### Group A — Backend (implementer-backend-s2)

Group A owns all shared infrastructure files and API routes. These files have no JSX and no browser dependencies.

| File (relative to `apps/web/`) | Action |
|-------------------------------|--------|
| `prisma/schema.prisma` | Create |
| `lib/db/prisma.ts` | Create |
| `lib/auth/supabase-admin.ts` | Create |
| `lib/auth/roles.ts` | Create |
| `lib/auth/with-auth.ts` | Create |
| `app/api/auth/callback/route.ts` | Create |
| `app/api/auth/me/route.ts` | Create |
| `package.json` | Modify (add prisma deps + scripts) |
| `.env.example` | Create |

Group A also runs: `pnpm prisma generate` and `pnpm prisma db push` after the schema is created.

### Group B — Frontend (implementer-frontend-s2)

Group B owns all React component files and the middleware.

| File (relative to `apps/web/`) | Action |
|-------------------------------|--------|
| `app/login/page.tsx` | Create |
| `app/login/login-button.tsx` | Create |
| `app/dashboard/page.tsx` | Create |
| `middleware.ts` | Create |

**Constraint:** Group B reads `Role` from `@/lib/auth/roles` (Group A file) as a read-only import if needed. Group B must not modify any Group A file.

---

## §4.5 Cross-Team Contracts

These types and constants are defined by Group A. Both teams code to the same signatures from day one.

### `Role` type
```ts
// lib/auth/roles.ts — owned by Group A
export type Role = 'member' | 'admin'
```

### `ROLE_HIERARCHY` constant
```ts
// lib/auth/roles.ts — owned by Group A
export const ROLE_HIERARCHY: Record<Role, number> = {
  member: 1,
  admin: 2,
}
```

### `MemberRow` type
```ts
// lib/auth/with-auth.ts — owned by Group A
// Re-exported alias of the Prisma Member model
export type { Member as MemberRow } from '@prisma/client'
```

Runtime shape (derived from §3 Prisma schema):
```ts
{
  id: string                                                // uuid
  userId: string | null
  stripeCustomerId: string | null
  email: string
  fullName: string | null
  phone: string | null
  address: Prisma.JsonValue | null
  chapterId: string | null                                  // uuid; FK to chapters table added in later spec
  membershipType: 'annualStudentNoVote' | 'annualSingle' | 'annualFamily' | 'fiveYearFamily' | 'life' | 'lifeWard' | 'patron' | 'benefactor' | 'honoraryNoVote' | null
  memberStatus: 'active' | 'expired' | 'suspended' | null
  joinDate: Date | null
  expiryDate: Date | null
  profileVisibility: Prisma.JsonValue | null
  role: 'member' | 'admin'
  souvenirPreference: 'electronic' | 'print' | null
  familyId: string | null                                   // uuid; shared by all household members
  familyRole: 'primary' | 'partner' | 'minor' | null
  parentFamilyId: string | null                             // uuid; primary members only — links to another family's familyId
  createdAt: Date
  deletedAt: Date | null
  // Note: paymentRecords: PaymentRecord[] is a relation and NOT included in the base
  // MemberRow type. Load it explicitly with { include: { paymentRecords: true } } when needed.
}
```

Group B's middleware does not import from `lib/auth/` at all — it uses `@supabase/ssr` directly. No runtime cross-team dependency exists for this spec.

---

## §5 Implementation Plan

### §5.1 Parallel Task Groups

#### Group A Tasks — implementer-backend-s2

All tasks follow TDD: write the failing test first (RED), implement until it passes (GREEN), clean up (REFACTOR).

**A1 — Prisma setup** (prerequisite for all A tasks, no test needed)
- [ ] Add `@prisma/client@^6.2.0` to `dependencies` in `apps/web/package.json`
- [ ] Add `prisma@^6.2.0` to `devDependencies` in `apps/web/package.json`
- [ ] Add `prisma:generate`, `prisma:push`, `prisma:studio` scripts
- [ ] Create `apps/web/prisma/schema.prisma` with full content from §3
- [ ] Run `pnpm install` from repo root
- [ ] Run `pnpm prisma generate` from `apps/web/`
- [ ] Run `pnpm prisma db push` from `apps/web/` (requires Supabase running)
- [ ] Verify: `pnpm prisma studio` shows `members` table with correct 20 columns and `payment_records` table with 7 columns
- **AC:** Database table exists, TypeScript types generated

**A2 — `lib/auth/roles.ts`**
- [ ] Write `lib/auth/roles.test.ts`: test ROLES-01, ROLES-02
- [ ] Implement `lib/auth/roles.ts`
- [ ] Tests GREEN
- **AC:** REQ-07 role hierarchy shape confirmed

**A3 — `lib/db/prisma.ts`**
- [ ] Write `lib/db/prisma.test.ts`: test PRISMA-01 (same reference on two imports)
- [ ] Implement `lib/db/prisma.ts`
- [ ] Tests GREEN
- **AC:** NFR-02 singleton pattern verified

**A4 — `lib/auth/supabase-admin.ts`**
- [ ] Write `lib/auth/supabase-admin.test.ts`: test ADMIN-01 (throws without env vars)
- [ ] Implement `lib/auth/supabase-admin.ts`
- [ ] Tests GREEN
- **AC:** NFR-03 early failure on missing secrets

**A5 — `lib/auth/with-auth.ts`** (depends on A2, A3, A4)
- [ ] Write `lib/auth/with-auth.test.ts`: tests WITHAUTH-01 through WITHAUTH-10
- [ ] Implement `lib/auth/with-auth.ts` using mocked `supabaseAdmin` and `prisma`
- [ ] All 10 tests GREEN
- **AC:** FR-02, FR-03, FR-05, FR-06, FR-07

**A6 — `app/api/auth/callback/route.ts`** (depends on A1)
- [ ] Write route tests: CALLBACK-01 (valid code → redirect to /dashboard), CALLBACK-02 (no code → redirect to /login?error=...)
- [ ] Implement route
- [ ] Tests GREEN
- **AC:** FR-01 OAuth flow can complete

**A7 — `app/api/auth/me/route.ts`** (depends on A5)
- [ ] Write integration tests: ME-01, ME-02, ME-03, ME-04, JIT-01, JIT-02
- [ ] Implement route (one-liner wrapping `withAuth`)
- [ ] All 6 tests GREEN
- **AC:** REQ-08, REQ-09, §3.1 DoD items 3–6

**A8 — `.env.example`** (no test needed)
- [ ] Create `apps/web/.env.example` with content from §4.13
- **AC:** Documentation completeness

#### Group B Tasks — implementer-frontend-s2

Group B can start immediately after A1 completes (DB and types available). Group B does not have compile-time dependencies on A2–A7.

**B1 — `middleware.ts`**
- [ ] Write `middleware.test.ts`: tests MW-01 through MW-05
- [ ] Implement `middleware.ts` with `config.matcher`
- [ ] All 5 tests GREEN
- **AC:** REQ-14

**B2 — `app/login/login-button.tsx`**
- [ ] Implement `LoginButton` client component with `signInWithOAuth` call
- [ ] Manual verification: click triggers Google OAuth redirect
- **AC:** FR-01, REQ-13

**B3 — `app/login/page.tsx`** (depends on B2)
- [ ] Implement server component shell rendering `<LoginButton />`
- [ ] Verify page loads at `http://localhost:3000/login` without errors
- **AC:** REQ-13

**B4 — `app/dashboard/page.tsx`**
- [ ] Implement placeholder page with session check and redirect
- [ ] Verify authenticated user lands here after OAuth without 404
- **AC:** §3.1 DoD first item

#### Sync Point

All Group A tests (A2–A7) and Group B tests (B1) must be GREEN, and manual verification of B2–B4 must pass, before the QA phase begins. The QA agent will run the complete OAuth flow end-to-end and verify all §3.1 Definition of Done items.

---

### §5.2 TDD Test Cases

For every acceptance criterion in §3.1 and §3.2, the corresponding test is defined below.

#### Unit Tests (mocked dependencies, no network)

**ROLES-01**
- Owner: Group A | File: `lib/auth/roles.test.ts`
- Type: Unit
- Name: "admin role level is greater than member role level"
- Setup: none
- Input: `ROLE_HIERARCHY['admin']`, `ROLE_HIERARCHY['member']`
- Expected: `ROLE_HIERARCHY['admin'] > ROLE_HIERARCHY['member']` === `true`
- AC: REQ-07

**ROLES-02**
- Owner: Group A | File: `lib/auth/roles.test.ts`
- Type: Unit
- Name: "ROLE_HIERARCHY keys are exactly 'member' and 'admin'"
- Setup: none
- Input: `Object.keys(ROLE_HIERARCHY).sort()`
- Expected: `['admin', 'member']`
- AC: REQ-07

**ADMIN-01**
- Owner: Group A | File: `lib/auth/supabase-admin.test.ts`
- Type: Unit
- Name: "throws at import time when SUPABASE_SERVICE_ROLE_KEY is missing"
- Setup: delete `process.env.SUPABASE_SERVICE_ROLE_KEY` before dynamic `import()`
- Input: `require('@/lib/auth/supabase-admin')`
- Expected: throws `Error` with message containing `'SUPABASE_SERVICE_ROLE_KEY'`
- AC: NFR-03

**WITHAUTH-01**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "returns 401 when Authorization header is missing"
- Setup: mock `supabaseAdmin.auth.getUser` — not called; mock `prisma.member.upsert` — not called
- Input: `withAuth(handler)(new Request('http://test/api/me'))`
- Expected: Response status 401; body `{ error: 'Missing or invalid Authorization header' }`; `handler` not called
- AC: FR-05, REQ-09

**WITHAUTH-02**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "returns 401 when Authorization scheme is not Bearer"
- Setup: same mocks
- Input: Request with header `Authorization: Basic dXNlcjpwYXNz`
- Expected: Response status 401
- AC: FR-05

**WITHAUTH-03**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "returns 401 when Supabase rejects the token"
- Setup: mock `supabaseAdmin.auth.getUser` to return `{ data: { user: null }, error: { message: 'invalid JWT' } }`
- Input: Request with header `Authorization: Bearer bad.token.here`
- Expected: Response status 401
- AC: FR-05, §3.2 scenario "Invalid token"

**WITHAUTH-04**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "calls prisma.member.upsert with correct create args on first login"
- Setup:
  - mock `supabaseAdmin.auth.getUser` returns `{ data: { user: { id: 'uid-1', email: 'new@test.com' } }, error: null }`
  - mock `prisma.member.upsert` returns `{ id: 'mem-1', email: 'new@test.com', role: 'member', deletedAt: null, ...rest }`
  - `handler` mock returns `new Response('ok', { status: 200 })`
- Input: Request with `Authorization: Bearer valid.token`
- Expected: `prisma.member.upsert` called once with `where: { email: 'new@test.com' }`, `create` object contains `{ email: 'new@test.com', userId: 'uid-1', role: 'member' }`, `update` object contains `{ userId: 'uid-1' }`; handler called with `ctx.user` equal to the upserted member
- AC: FR-02, REQ-04, REQ-05, §3.2 "First login JIT sync"

**WITHAUTH-05**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "prisma upsert called exactly once even on repeated invocations"
- Setup: same mocks as WITHAUTH-04 (upsert always returns the same existing member)
- Input: Call `withAuth(handler)(request)` twice sequentially
- Expected: `prisma.member.upsert` called twice total (once per request call) — confirms idempotency by checking upsert is used (not create), not that it is deduplicated
- AC: REQ-05, §3.2 "Repeat login"

**WITHAUTH-06**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "returns 401 for soft-deleted user"
- Setup:
  - mock `supabaseAdmin.auth.getUser` returns valid user
  - mock `prisma.member.upsert` returns member with `deletedAt: new Date('2025-01-01T00:00:00Z')`
- Input: Request with valid Bearer token
- Expected: Response status 401; body `{ error: 'Account has been deactivated' }`; handler not called
- AC: FR-07, §3.2 "Deleted user"

**WITHAUTH-07**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "returns 403 when member role is insufficient for admin-only route"
- Setup: mock returns valid user; upsert returns member with `role: 'member'`, `deletedAt: null`
- Input: `withAuth(handler, { role: 'admin' })(request)`
- Expected: Response status 403; handler not called
- AC: FR-06, REQ-07, §3.2 "Insufficient role"

**WITHAUTH-08**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "calls handler when admin role satisfies admin requirement"
- Setup: mock returns member with `role: 'admin'`, `deletedAt: null`
- Input: `withAuth(handler, { role: 'admin' })(request)`
- Expected: handler called; Response from handler returned
- AC: FR-06

**WITHAUTH-09**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "calls handler when member role satisfies member requirement"
- Setup: mock returns member with `role: 'member'`, `deletedAt: null`
- Input: `withAuth(handler, { role: 'member' })(request)`
- Expected: handler called
- AC: FR-06

**WITHAUTH-10**
- Owner: Group A | File: `lib/auth/with-auth.test.ts`
- Type: Unit
- Name: "calls handler with no role option for any authenticated member"
- Setup: mock returns valid member (role: 'member'), `deletedAt: null`
- Input: `withAuth(handler)(request)` — no options
- Expected: handler called
- AC: FR-03

#### Integration Tests (real Supabase, real Prisma, test DB)

**ME-01**
- Owner: Group A | File: `app/api/auth/me/route.test.ts`
- Type: Integration
- Name: "GET /api/auth/me returns 200 with user object for authenticated user"
- Setup: create test Supabase auth user; obtain access token
- Input: GET /api/auth/me with `Authorization: Bearer <token>`
- Expected: 200; body has `{ user: { email: <test email>, role: 'member' } }`
- AC: REQ-08, §3.1 DoD item 4, §3.2 "Valid Bearer token"

**ME-02**
- Owner: Group A | File: same
- Type: Integration
- Name: "GET /api/auth/me returns 401 without Authorization header"
- Setup: none
- Input: GET /api/auth/me (no header)
- Expected: 401
- AC: REQ-09, §3.1 DoD item 5, §3.2 "Missing token"

**ME-03**
- Owner: Group A | File: same
- Type: Integration
- Name: "GET /api/auth/me returns 401 for expired/invalid token"
- Setup: none
- Input: GET /api/auth/me with `Authorization: Bearer this.is.not.a.real.token`
- Expected: 401
- AC: §3.2 "Invalid token"

**ME-04**
- Owner: Group A | File: same
- Type: Integration
- Name: "GET /api/auth/me returns 401 for soft-deleted member"
- Setup: create test user + token; directly set `deleted_at = NOW()` on their `members` row via Prisma or raw SQL
- Input: GET /api/auth/me with valid token
- Expected: 401
- AC: §3.1 DoD item 6, §3.2 "Deleted user"

**JIT-01**
- Owner: Group A | File: same (or separate integration test file)
- Type: Integration
- Name: "First API call creates exactly one members row with role 'member'"
- Setup: ensure no `members` row exists for test email (delete if present); create a new Supabase auth user; get access token
- Input: GET /api/auth/me with valid Bearer token
- Expected: Response 200; exactly 1 row in `members` table for that email; row has `role = 'member'`
- AC: FR-02, §3.1 DoD items 1 and 2, §3.2 "First login JIT sync"

**JIT-02**
- Owner: Group A | File: same
- Type: Integration
- Name: "Repeated API calls do not create duplicate members rows"
- Setup: JIT-01 already ran (1 row exists); use the same user/token
- Input: GET /api/auth/me again with same valid Bearer token
- Expected: Response 200; still exactly 1 row in `members` for that email
- AC: REQ-05, §3.1 DoD item 3, §3.2 "Repeat login"

#### Middleware Tests

**MW-01**
- Owner: Group B | File: `middleware.test.ts`
- Type: Unit
- Name: "redirects unauthenticated request to /dashboard to /login"
- Setup: mock Supabase `getUser()` returns `{ data: { user: null }, error: null }`
- Input: `NextRequest` to `http://localhost/dashboard`
- Expected: Response is redirect to `/login`
- AC: REQ-14

**MW-02**
- Owner: Group B | File: `middleware.test.ts`
- Type: Unit
- Name: "redirects unauthenticated request to /admin/users to /login"
- Setup: same mock
- Input: `NextRequest` to `http://localhost/admin/users`
- Expected: Response is redirect to `/login`
- AC: REQ-14

**MW-03**
- Owner: Group B | File: `middleware.test.ts`
- Type: Unit
- Name: "does not redirect unauthenticated request to /login"
- Setup: no session
- Input: `NextRequest` to `http://localhost/login`
- Expected: `NextResponse.next()` — passes through without redirect
- AC: Login page must remain accessible to unauthenticated users

**MW-04**
- Owner: Group B | File: `middleware.test.ts`
- Type: Unit
- Name: "does not redirect authenticated request to /dashboard"
- Setup: mock `getUser()` returns `{ data: { user: { id: 'uid-1', email: 'user@test.com' } }, error: null }`
- Input: `NextRequest` to `http://localhost/dashboard`
- Expected: `NextResponse.next()` — passes through
- AC: REQ-14 negative case

**MW-05**
- Owner: Group B | File: `middleware.test.ts`
- Type: Unit
- Name: "config.matcher excludes /api/auth/callback"
- Setup: none
- Input: verify `config.matcher` regex does not match `/api/auth/callback`
- Expected: `config.matcher[0]` regex does not match the string `/api/auth/callback`
- AC: OAuth callback route must never be intercepted

---

## §6 Dependencies and Prerequisites

### npm Packages to Add to `apps/web/package.json`

| Package | Version | Type |
|---------|---------|------|
| `@prisma/client` | `^6.2.0` | dependency |
| `prisma` | `^6.2.0` | devDependency |
| `jest` | `^29` | devDependency (if not in root monorepo config) |
| `@types/jest` | `^29` | devDependency (if not in root) |
| `ts-jest` | `^29` | devDependency (if not in root) |
| `jest-environment-node` | `^29` | devDependency (if not in root) |

Already installed and sufficient: `@supabase/ssr ^0.5.2`, `@supabase/supabase-js ^2.47.10`, `zod ^3.24.1`.

### Environment Variables Required (in `apps/web/.env.local`)

| Variable | Source | Used by |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase status` → API URL | All files |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase status` → anon key | `middleware.ts`, callback route, `LoginButton` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase status` → service_role key | `supabase-admin.ts` |
| `DATABASE_URL` | Supabase PostgreSQL connection string | Prisma (via PgBouncer for prod) |
| `DIRECT_URL` | Supabase PostgreSQL direct connection | Prisma migrations |

### Prerequisite Steps (strict order)

1. `supabase start` — local Supabase must be running
2. `supabase status` — copy anon key, service_role key, JWT secret, DB port
3. Create `apps/web/.env.local` from `apps/web/.env.example` with values from step 2
4. Enable Google OAuth in Supabase dashboard → Authentication → Providers → Google (requires Google Cloud OAuth credentials)
5. Set allowed Redirect URL in Supabase Auth settings: `http://localhost:3000/api/auth/callback`
6. `pnpm install` from repo root (installs new prisma packages)
7. `cd apps/web && pnpm prisma generate` (generates Prisma client from schema)
8. `cd apps/web && pnpm prisma db push` (creates `members` table in local Supabase)
9. Verify DB: `pnpm prisma studio` shows `members` table

---

## §7 Risk Mitigations

**Risk: OAuth callback route missing from spec (analysis §4, risk row 1)**
Mitigation: `app/api/auth/callback/route.ts` is explicitly listed in the Group A ownership map (§4.4) and has dedicated tests (CALLBACK-01, CALLBACK-02) in A6 task group. It is treated as a required file on par with the other spec files. The design (§4.6) provides complete implementation code.

**Risk: Prisma missing from `apps/web/package.json` (analysis §4, risk row 2)**
Mitigation: §4.12 specifies exact packages (`prisma@^6.2.0`, `@prisma/client@^6.2.0`) with version pins. Task A1 is listed first in the Group A sequence and has an explicit verification step (Prisma Studio shows `members` table) that blocks proceeding to A2–A7. The Prisma generate output path (`./node_modules/.prisma/client`) ensures the generated code is isolated to the web package.

**Risk: `members.role` enum case mismatch (analysis §4, risk row 3)**
Mitigation: §3 schema defines `enum Role { member admin }` (lowercase). §4.4 `ROLE_HIERARCHY` uses lowercase string keys. The `withAuth()` JIT sync `create` block uses the string literal `'member'`. The `MemberRow` type derives from the Prisma-generated `Member` model, so TypeScript enforces that `role` values are `'member' | 'admin'` — uppercase values would be a compile error.

**Risk: Race condition on JIT sync (analysis §4, risk row 4)**
Mitigation: `prisma.member.upsert` with `where: { email }` compiles to PostgreSQL `INSERT INTO members ... ON CONFLICT (email) DO UPDATE SET user_id = ...`. This is a single atomic statement at the database level. No application-level locking is needed. The `email` column's `@unique` constraint in §3 guarantees the conflict target is valid.

**Risk: Middleware importing service-role secrets (analysis §4, risk row 5)**
Mitigation: `middleware.ts` is owned by Group B (§4.4). The design (§4.10) explicitly states: "Must NOT import `supabase-admin.ts`, `lib/db/prisma.ts`, or `lib/auth/with-auth.ts`." The Group B implementer only receives the middleware specification; they have no reason to reach into Group A's files. Code review verifies this boundary.

**Risk: `DATABASE_URL` pointed at wrong port (analysis §4, risk row 6)**
Mitigation: `.env.example` (§4.13) includes inline comments explaining PgBouncer port 6543 vs direct port 5432 for production, and shows the exact local development URLs (port 54322 for local Supabase PostgreSQL). The `directUrl` field in the Prisma schema ensures migrations always use the direct connection regardless of what `DATABASE_URL` is set to. Prerequisite step 8 (`prisma db push`) will immediately fail with a helpful connection error if the URL is wrong, surfacing the misconfiguration before any test runs.

---

## Handoff to Implementation Agents

**implementer-backend-s2** receives: Group A task list (§5.1), all Group A test cases (§5.2), §3 full schema, §4.1–§4.7 component designs, §4.11–§4.12 package/env configs, §6 prerequisites.

**implementer-frontend-s2** receives: Group B task list (§5.1), all Group B test cases (§5.2), §4.8–§4.10 component designs, §4.5 cross-team contracts (read-only imports of `Role` from `@/lib/auth/roles`), §6 prerequisites.

The cross-team contract (§4.5) is stable before either implementer writes a line of code. Group B can begin B1 (`middleware.ts`) in parallel with Group A's A1–A5 since B1 does not import from `lib/auth/` at all.
