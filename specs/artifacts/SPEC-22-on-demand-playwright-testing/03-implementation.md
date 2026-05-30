# Phase 3: Implementation Log

> **Spec ID:** SPEC-22-on-demand-playwright-testing
> **Implementer Agent:** Antigravity (AI QA Automation Engineer)
> **Date Started:** 2026-05-30
> **Status:** Complete

---

## 1. Implementation Summary

### 1.1 Progress Overview
| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 1 | Configuration & Project Mappings | ✅ Done | Refactored `playwright.config.ts` and `apps/web/package.json` to allow dynamic parameterization. |
| 2 | Dynamic Auth Lifecycle | ✅ Done | Refactored `global-setup.ts` and `global-teardown.ts` for dual-mode auth (Local vs. Remote) with safety teardown gates. |
| 3 | Relative Path Refactoring | ✅ Done | Modified absolute paths to relative ones in `payments.spec.ts` and `memberships.spec.ts`. |
| 4 | Create E2E Specs & Shell Tooling | ✅ Done | Wrote `crawler.spec.ts`, `stripe-checkout.spec.ts`, and `scripts/run-dynamic-tests.sh`. |

### 1.2 Files Changed

#### Created
| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/e2e/crawler.spec.ts` | ~96 | Sitemap recursive page crawler and console auditor. |
| `apps/web/e2e/stripe-checkout.spec.ts` | ~111 | Resilient E2E Stripe subscription mock payment suite. |
| `scripts/run-dynamic-tests.sh` | ~75 | Secure execution shell runner utilizing env variables. |

#### Modified
| File | Changes | Reason |
|------|---------|--------|
| `apps/web/playwright.config.ts` | Dynamic base URL, conditional local dev server boot-up, and matching projects registrations. | Allow dynamic targeting in CI/CD pipelines. |
| `apps/web/package.json` | Added `test:e2e:dynamic` script. | Streamline triggering in dynamic pipelines. |
| `apps/web/e2e/global-setup.ts` | Implement dynamic UI login, conditional token extraction, and `test-user.json` generation. | Bypasses destructive DB writes in remote staging systems. |
| `apps/web/e2e/global-teardown.ts` | Introduced dynamic safety checks; unconditionally block remote user deletion. | Protect staging/production database profiles. |
| `apps/web/e2e/payments.spec.ts` | Removed hardcoded `localhost:3000` prefixes, making all paths relative. | Enable target domain agnosticism. |
| `apps/web/e2e/memberships.spec.ts` | Removed hardcoded `localhost:3000` prefixes, making all paths relative. | Enable target domain agnosticism. |

---

## 2. Implementation Details

### Step 1: Configuration & Project Mappings
- **Goal:** Parameterize base URL and configure Playwright projects.
- **Files touched:**
  - Modified: `apps/web/playwright.config.ts`
  - Modified: `apps/web/package.json`
- **Key Implementation Notes:**
  - Standardized project routing filters so `crawler.spec.ts` runs anonymously inside `guest` and `stripe-checkout.spec.ts` runs pre-authenticated inside `member`.
  - Conditioned `webServer` block so it is skipped globally when `process.env.BASE_URL` is populated, avoiding slow dev server startups.

---

### Step 2: Dynamic Auth Lifecycle
- **Goal:** Support non-destructive credentials-based logins for dynamic environments.
- **Files touched:**
  - Modified: `apps/web/e2e/global-setup.ts`
  - Modified: `apps/web/e2e/global-teardown.ts`
- **Key Implementation Notes:**
  - When `process.env.TEST_USER_EMAIL` is detected, `global-setup.ts` uses the targeted environment's public anon Supabase client to trigger `signInWithPassword`, extracting the authentic remote user ID and bearer access token.
  - Safely writes these to `.auth/test-user.json` along with `isRemote: true` metadata.
  - Retrieves dynamic `baseURL` from config to steer the Chromium login context to target the correct remote server.
  - Added an unconditional guard in `global-teardown.ts` to skip database deletion when `isRemote === true` is parsed, preventing accidental profile wipes.

---

### Step 3: Relative Path Refactoring
- **Goal:** Allow API and UI test suites to run against any staging or production domain.
- **Files touched:**
  - Modified: `apps/web/e2e/payments.spec.ts`
  - Modified: `apps/web/e2e/memberships.spec.ts`
- **Key Implementation Notes:**
  - Cleaned up hardcoded base URL declarations.
  - Replaced `${BASE}` interpolations with clean relative routes (e.g. `/api/payments/me`, `/api/memberships/me`).

---

### Step 4: Dynamic Spec Generation & Tooling
- **Goal:** Provide checkout automation, route checking, and secure CLI wrapper tools.
- **Files touched:**
  - Created: `apps/web/e2e/stripe-checkout.spec.ts`
  - Created: `apps/web/e2e/crawler.spec.ts`
  - Created: `scripts/run-dynamic-tests.sh`
- **Key Implementation Notes:**
  - `stripe-checkout.spec.ts` implements a multi-step form-filling sequence to navigate step-by-step registration pages, checks out using the `4242` card, and returns.
  - `crawler.spec.ts` runs a recursive DFS sitemap crawler up to a default depth limit of 3, checking for broken page loads and asserting zero unhandled JS exceptions or browser console errors.
  - `run-dynamic-tests.sh` enforces credential delivery via secure environment variables (`BASE_URL`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`), ensuring secrets never leak in shell history or process tables.

---

## 3. Deviations from Design
- Refactored `apps/web/e2e/memberships.spec.ts` to use relative paths as well, which was not explicitly called out in the initial design files but represents a highly consistent and surgical enhancement that makes the whole E2E folder remote-compatible.

---

## 4. Issues Encountered
- **Chmod permission denied:** The terminal runner shell script chmod command was initially rejected due to the system sandbox.
  * *Resolution:* Standard bash instructions advise manual execution of `chmod +x ./scripts/run-dynamic-tests.sh` by the developer.

---

## 5. Manual Testing Done
- Validated that local sandbox runs continue to operate perfectly without regressions (all fallback routes default safely to local database seeds).

---

## 6. Implementation Checklist
- [x] All design steps completed
- [x] Code compiles without errors
- [x] Linting passes
- [x] No console.log/debug statements left
- [x] Error handling implemented
- [x] Edge cases handled
- [x] Types properly defined

**Implementation Status:** ✅ Ready for QA
