# Phase 1: Analysis — SPEC-20 NestJS Cleanup & Next.js Test Expansion

**Spec:** SPEC-20-nestjs-cleanup-and-test-expansion  
**Phase:** 1 — Analysis  
**Status:** Complete  
**Date:** 2026-05-23  

---

## 1. Current State Assessment

### 1.1 What SPEC-11 Already Completed
- `apps/api/` directory deleted — NestJS process is gone
- All API business logic ported to `apps/web/app/api/` route handlers
- `apps/web/lib/` service layer (member-service, membership-service, payment-service, message-service, webhook-handlers)
- Prisma moved to `apps/web/prisma/`
- Basic Playwright e2e suite established in `apps/web/e2e/`

### 1.2 What Remains — Documentation

| File | NestJS Artifacts Found |
|------|----------------------|
| `CLAUDE.md` (root) | Entire architecture section describes `apps/api/`, NestJS modules, port 3001, test:api, postman collection |
| `CLAUDE.md` (project) | ~400 lines of NestJS-specific content: module structure, Prisma commands for `apps/api`, postman, session reports, 78-test NestJS suite |
| `README.md` | Backend listed as NestJS 10.4.8+port 3001; curl examples hit `localhost:3001`; references `apps/api/.env`, `postman/README.md` |
| `pnpm-workspace.yaml` | `allowBuilds` entry `'@nestjs/core': false` — harmless but stale |
| `scripts/get-auth-token.sh` | Line 30: `if [ ! -f "apps/api/.env" ]` — **script is broken**, will always fail |
| `scripts/get-auth-token.ts` | Likely mirrors the same broken path — needs verification |

### 1.3 What Remains — Test Coverage

Current Playwright e2e suite (`apps/web/e2e/`):

| File | Tests | Coverage |
|------|-------|---------|
| `public.spec.ts` | 5 | Public page renders (home, login, register, forgot-pw, about) |
| `auth.spec.ts` | 6 | Login form validation + redirect middleware |
| `register.spec.ts` | 6 | Registration step 1+2 validation |
| `api.spec.ts` | 8 | 2 public API routes + 6 unauthenticated 401 checks |
| `dashboard.spec.ts` | 4 | Authenticated dashboard page + 2 API routes (auth/me, members/me) |
| **Total** | **~29** | **No coverage of memberships, payments, family, messages, admin** |

### 1.4 Full API Route Inventory

Below is the complete route map derived from inspecting every `route.ts` file. The **Tested** column reflects the current e2e suite.

#### Auth
| Route | Methods | Auth Required | Tested |
|-------|---------|--------------|--------|
| `/api/auth/me` | GET | Yes | ✅ 401 + ✅ authed |
| `/api/auth/callback` | GET | No | ❌ |
| `/api/auth/signout` | POST | No | ❌ |

#### Members
| Route | Methods | Auth Required | Tested |
|-------|---------|--------------|--------|
| `/api/members/me` | GET, PUT, DELETE | Yes | ✅ GET authed, ❌ PUT/DELETE |
| `/api/members/me/export` | GET | Yes | ❌ |
| `/api/members/me/family` | GET, POST | Yes | ❌ |
| `/api/members/me/family/[id]` | GET, PUT, DELETE | Yes | ❌ |
| `/api/members` | GET | Admin | ❌ |
| `/api/members/[id]` | GET, PUT, DELETE | Admin | ❌ |
| `/api/members/[id]/role` | PUT | Admin | ❌ |
| `/api/members/[id]/export` | GET | Admin | ❌ |
| `/api/members/search` | GET | Yes | ❌ |
| `/api/members/message` | POST | Yes | ❌ |

#### Memberships
| Route | Methods | Auth Required | Tested |
|-------|---------|--------------|--------|
| `/api/memberships/types` | GET | No | ✅ public |
| `/api/memberships` | POST | Yes | ✅ 401 only |
| `/api/memberships` | GET | Admin | ✅ 401 only |
| `/api/memberships/me` | GET, DELETE | Yes | ✅ 401 only |
| `/api/memberships/me/history` | GET | Yes | ❌ |
| `/api/memberships/[id]` | GET, DELETE | Admin | ❌ |
| `/api/memberships/[id]/approve` | POST | Admin | ❌ |
| `/api/memberships/[id]/reject` | POST | Admin | ❌ |
| `/api/memberships/[id]/status` | PUT | Admin | ❌ |
| `/api/memberships/honorary/assign` | POST | Admin | ✅ 401 only |

#### Payments
| Route | Methods | Auth Required | Tested |
|-------|---------|--------------|--------|
| `/api/payments/checkout-session` | POST | Yes | ❌ |
| `/api/payments/upgrade-session` | POST | Yes | ❌ |
| `/api/payments/donate` | POST | No | ❌ |
| `/api/payments/me` | GET | Yes | ❌ |
| `/api/payments` | GET | Admin | ❌ |
| `/api/payments/[id]/receipt` | POST | Yes | ❌ |
| `/api/payments/[id]/refund` | POST | Admin | ❌ |
| `/api/webhooks/stripe` | POST | No (signature) | ❌ |

#### Other
| Route | Methods | Auth Required | Tested |
|-------|---------|--------------|--------|
| `/api/chapters` | POST | No | ✅ (GET tested, POST is actually seed-only) |
| `/api/chapters/[id]` | — | — | ❌ |
| `/api/messages` | GET, POST | Yes | ❌ |
| `/api/messages/[id]` | GET, PUT, DELETE | Yes | ❌ |
| `/api/admin/link-member` | POST | Admin | ❌ |
| `/api/cron/expiry-reminders` | POST | Cron secret | ❌ |
| `/api/users/me/profile` | POST | Yes | ❌ |

---

## 2. Token Infrastructure Assessment

The `global-setup.ts` already:
1. Creates a pre-confirmed test user via Supabase Admin API
2. Signs in and stores the access token to `.auth/test-user.json` as `accessToken`
3. Saves browser storage state to `.auth/user.json` for the `member` project

The `dashboard.spec.ts` already demonstrates the token-reading helper pattern:
```typescript
function getAccessToken(): string {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken } = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return accessToken
}
```

**This pattern is reusable as-is in all new test files.** No changes to `global-setup.ts` are needed.

---

## 3. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Test user has no `Membership` record on first run — `GET /api/memberships/me` returns 404 not 200 | High | Medium | Assert 200 OR 404; or create membership in test then clean up |
| Admin-required routes can't be tested without promoting the test user | High | Low | Use `test.skip()` with clear comment; document manual promotion path |
| Stripe routes require valid Stripe keys — checkout-session will fail in local dev without keys | Medium | Medium | Assert 200 or 402/400 based on Stripe key presence; skip in CI if no keys |
| `pnpm-workspace.yaml` `@nestjs/core: false` entry — safe to remove | Low | Low | Remove cleanly |
| `scripts/get-auth-token.ts` may need different env variable names than the `.sh` version | Low | Low | Inspect file before patching |

---

## 4. Scope Confirmation

### In Scope for SPEC-20
1. **Rewrite `CLAUDE.md`** — remove all NestJS content; document current Next.js-only architecture accurately
2. **Update `README.md`** — remove NestJS/port 3001 references; update quick-start to reflect single Next.js server
3. **Update `pnpm-workspace.yaml`** — remove stale `@nestjs/core: false` allowBuilds entry
4. **Fix `scripts/get-auth-token.sh`** — change `apps/api/.env` to `apps/web/.env.local`; update env var names to match what `apps/web/.env.local` uses (`SUPABASE_SERVICE_ROLE_KEY` not `SUPABASE_SERVICE_KEY`)
5. **Fix `scripts/get-auth-token.ts`** — same update
6. **Expand `apps/web/e2e/api.spec.ts`** — add authenticated member routes (PUT `/api/members/me`, family CRUD, search, export)
7. **Create `apps/web/e2e/memberships.spec.ts`** — cover membership apply, GET me, history, cancel; skip admin routes
8. **Create `apps/web/e2e/payments.spec.ts`** — cover GET `/api/payments/me`, checkout-session, upgrade-session; skip admin + webhook
9. **Update `apps/web/playwright.config.ts`** — add `member` project match to new spec files so auth token is available

### Out of Scope
- Changing any API route handlers or service logic
- Modifying completed spec artifacts
- Adding a new admin test project (requires DB-level user promotion)
- Testing webhook signature validation

---

## 5. Resolved Open Questions (from Spec)

| Question | Answer |
|----------|--------|
| Does `global-setup.ts` store access token for API reuse? | **Yes** — stored in `.auth/test-user.json` as `accessToken`; `dashboard.spec.ts` already reads it |
| Are there remaining `NEXT_PUBLIC_API_URL` references in `apps/web` source? | **No** — grep found zero hits in `apps/web/app` and `apps/web/lib` |
| Does `pnpm-workspace.yaml` still list `apps/api`? | **No** — workspace glob is `apps/*` (picks up whatever is in `apps/`); only stale entry is the `allowBuilds` `@nestjs/core` line |

---

## 6. Implementation Sequence (for Phase 2 Design)

1. Fix scripts (quick, unblocks manual dev workflow)
2. Clean `pnpm-workspace.yaml`
3. Rewrite `CLAUDE.md` and `README.md`
4. Add `member` project to cover new spec files in `playwright.config.ts`
5. Expand `api.spec.ts`
6. Create `memberships.spec.ts`
7. Create `payments.spec.ts`
8. Run full e2e suite — confirm all pass
