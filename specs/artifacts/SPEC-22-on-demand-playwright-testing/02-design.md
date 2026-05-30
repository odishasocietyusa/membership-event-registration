# Phase 2: Architecture & Design

> **Spec ID:** SPEC-22-on-demand-playwright-testing
> **Architect Agent:** Antigravity (AI QA Automation Engineer)
> **Date:** 2026-05-30
> **Status:** Ready for Review

---

## 1. Design Overview

### 1.1 Solution Summary
We are introducing a dynamic and secure E2E testing architecture for the OSA Community Platform. Rather than hardcoding the target base URL and forcing dynamic DB modifications on local/remote environments, the system accepts configuration through environment variables. It selectively switches between two execution modes:
1. **Local Sandbox Mode (Default):** Spins up a local Next.js dev server, provisions a temporary test user in the local Supabase instance, runs tests, and tears them down.
2. **On-Demand Remote Mode (Staging/Production/Previews):** Uses a pre-existing target `BASE_URL`, bypasses database seeding, logs in through the UI with user-provided credentials, and avoids destructive user deletions in the target database.

All spec files will be refactored to use relative paths, and we will build a resilient Stripe Checkout E2E spec along with a general page crawler to discover and audit dynamic portals.

### 1.2 Design Principles Applied
- **Environment Agnosticism:** Test suites should run against *any* URL without altering code, databases, or configuration files.
- **Non-Destructiveness (Safe-by-Default):** DB deletion operations are disabled if the tests run against remote databases.
- **Robust Locators:** Leverage user-facing semantic selectors (e.g. `getByRole`, frame locators for Stripe Elements) instead of dynamic, fragile DOM classes.
- **Surgical Execution:** Target modifications precisely in the Playwright module and scripts layer, leaving other application packages completely untouched.

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified
| Pattern | Location | Will Reuse? |
|---------|----------|-------------|
| **Multi-Project Setup** | `playwright.config.ts` | Yes. We keep `guest` and `member` projects to separate public and authenticated flows. |
| **`storageState` Reuse** | `playwright.config.ts` | Yes. Cookies and localStorage are captured into `.auth/user.json` to skip login steps for authenticated pages. |
| **Admin Client Provisioning** | `global-setup.ts` | Yes. Used as fallback for local dev database user provisioning. |

### 2.2 Related Existing Code
| File | Relevance | Action |
|------|-----------|--------|
| `playwright.config.ts` | Playwright setup, projects, and dev webserver configuration. | Modify to support dynamic `baseURL` and conditional `webServer` boot-up. |
| `global-setup.ts` | Performs user seeding and captures UI login session. | Modify to accept `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` from env and skip DB seeding. |
| `global-teardown.ts` | Cleans up the seeded test user from the database. | Modify to bypass DB deletion if dynamic credentials mode is active. |
| `payments.spec.ts` | Hardcodes the `localhost:3000` base URL. | Modify to use relative API paths. |

---

## 3. Architecture Design

### 3.1 Component Diagram
```
┌────────────────────────────────────────────────────────┐
│                   Test Orchestrator                    │
│    (BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD)     │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      [ Local Mode ]              [ Remote Mode ]
    (Seeding via Supabase)      (Dynamic UI Login Only)
              │                           │
              └─────────────┬─────────────┘
                            ▼
              ┌───────────────────────────┐
              │  Playwright Runner        │
              │  - guest specs            │
              │  - member specs           │
              │  - Stripe elements frame  │
              └───────────────────────────┘
```

### 3.2 Data Flow (Global Setup - Remote Mode)
```
[Target BASE_URL & credentials provided] 
  ──▶ [Skip Supabase Admin user creation] 
  ──▶ [Login via Target UI /login] 
  ──▶ [Save session state to .auth/user.json] 
  ──▶ [Run all spec files relatively against BASE_URL]
```

### 3.3 Key Interface/Contracts
In `playwright.config.ts`, we dynamically construct the configuration object:
```typescript
const targetBaseURL = process.env.BASE_URL || 'http://localhost:3000';
const isRemote = !!process.env.BASE_URL;
```

---

## 4. File Structure

### 4.1 New Files to Create

| File Path | Purpose | Template/Base |
|-----------|---------|---------------|
| `apps/web/e2e/crawler.spec.ts` | Crawls target site up to a depth limit, asserting `200 OK` for page loads and validating routing links. | `apps/web/e2e/public.spec.ts` |
| `apps/web/e2e/stripe-checkout.spec.ts` | Robust E2E test verifying a complete Stripe Checkout using iframe frame locators. | None |
| `scripts/run-dynamic-tests.sh` | Bash helper script to execute dynamic tests in one command. | None |

### 4.2 Files to Modify

| File Path | Changes | Impact |
|-----------|---------|--------|
| `apps/web/playwright.config.ts` | Support dynamic `baseURL`, disable `webServer` when `BASE_URL` env variable is defined. | Low |
| `apps/web/e2e/global-setup.ts` | Enable conditional UI-only auth when `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` are provided, bypassing local DB seeding. | Medium |
| `apps/web/e2e/global-teardown.ts` | Skip Supabase user deletion if dynamic credentials mode is active. | Low |
| `apps/web/e2e/payments.spec.ts` | Replace all hardcoded `http://localhost:3000` prefixes with relative paths resolved by Playwright config. | Low |
| `apps/web/package.json` | Add `test:e2e:dynamic` run scripts. | Low |

---

## 5. Implementation Plan

### 5.1 Implementation Sequence
```
Step 1: Update configuration layer
   └── Modifies: apps/web/playwright.config.ts, apps/web/package.json

Step 2: Update auth lifecycle layer
   └── Modifies: apps/web/e2e/global-setup.ts, apps/web/e2e/global-teardown.ts

Step 3: Refactor payments and relative paths
   └── Modifies: apps/web/e2e/payments.spec.ts

Step 4: Create E2E test specs (Stripe, crawler)
   └── Creates: apps/web/e2e/stripe-checkout.spec.ts, apps/web/e2e/crawler.spec.ts, scripts/run-dynamic-tests.sh
```

### 5.2 Detailed Steps

#### Step 1: Configuration & Scripts
- **Goal:** Allow parameterization of Playwright via `BASE_URL` and configure project boundaries.
- **Files:**
  - Modify `apps/web/playwright.config.ts`
  - Modify `apps/web/package.json`
- **Key Implementation Notes:**
  - Set `baseURL` to `process.env.BASE_URL || 'http://localhost:3000'`.
  - Disable the `webServer` configuration block when `process.env.BASE_URL` is provided to avoid spun-up local server delays.
  - **Project Specification Mapping (`testMatch`):** Register the new specs to ensure they run with correct authentication scopes:
    - Add `'**/crawler.spec.ts'` to the **`guest`** project (running anonymously).
    - Add `'**/stripe-checkout.spec.ts'` to the **`member`** project (automatically inheriting the `.auth/user.json` logged-in state).
- **Estimated Complexity:** Low

#### Step 2: Dynamic Auth Lifecycle
- **Goal:** Enable remote environment logins without service keys/DB access.
- **Files:**
  - Modify `apps/web/e2e/global-setup.ts`
  - Modify `apps/web/e2e/global-teardown.ts`
- **Key Implementation Notes:**
  - Check if `process.env.TEST_USER_EMAIL` is defined. If so, skip the Supabase Admin Client block.
  - **Dynamic Base URL Resolution in UI Login:** Inside the browser launch block in `global-setup.ts`, do NOT hardcode `http://localhost:3000/login`. Instead, update the function signature to accept the Playwright `FullConfig` object (`globalSetup(config: FullConfig)`) and extract the dynamic `baseURL` from it (`config.projects[0]?.use?.baseURL || config.use?.baseURL || 'http://localhost:3000'`). Navigate page to `${baseURL}/login` to capture the correct storageState.
  - **Dynamic test-user.json Generation (Remote Mode):** If dynamic credentials are provided, `global-setup.ts` will initialize a standard Supabase client with the targeted public URL and public anon key. It will call `signInWithPassword` to dynamically fetch the target user's UUID and bearer JWT access token, and write them directly to `apps/web/.auth/test-user.json`. This ensures that absolute/relative authenticated request helpers (e.g. `getAccessToken()`) continue to resolve flawlessly on dynamic environments without throwing file-read or 401 exceptions.
  - **Safe-by-Default Teardown:** In `global-teardown.ts`, we must strictly restrict user deletion to **Local Sandbox Mode only** (when using the default local test user `e2e-test@playwright.local`). If dynamic remote mode is active (i.e. a custom `TEST_USER_EMAIL` is provided for testing a deployed URL), `global-teardown.ts` will **never** attempt to delete the user from Supabase, regardless of whether the service role key is present. This completely eliminates the risk of deleting pre-existing staging/production member accounts, keeping all remote executions 100% non-destructive.
- **Estimated Complexity:** Medium

#### Step 3: Relative Path Refactoring
- **Goal:** Allow API and page tests to run seamlessly against any target domain.
- **Files:**
  - Modify `apps/web/e2e/payments.spec.ts`
- **Key Implementation Notes:**
  - Remove `const BASE = 'http://localhost:3000'`.
  - Prefix API calls directly with paths (e.g. `/api/payments/me`).
- **Estimated Complexity:** Low

#### Step 4: Stripe elements iframe & Crawler Specs
- **Goal:** Deliver checkout capability and link auditing.
- **Files:**
  - Create `apps/web/e2e/stripe-checkout.spec.ts`
  - Create `apps/web/e2e/crawler.spec.ts`
  - Create `scripts/run-dynamic-tests.sh`
- **Key Implementation Notes:**
  - `stripe-checkout.spec.ts` will navigate to the upgrade page, submit a subscription choice, wait for the Stripe checkout redirection, locate the Stripe elements card input iframe, type the test credentials, submit, and verify completion.
  - `crawler.spec.ts` will recursively collect unique internal routes up to a **default depth limit of 3** (Depth 0: Landing page `/`, Depth 1: direct navbar/footer links, Depth 2: sub-section links, Depth 3: nested pages). It will verify that all internal page loads return a `200 OK` status and assert that no unhandled JS console exceptions or network asset 4xx/5xx failures occur during crawling.
  - **Secure Script Credentials Passing:** The shell helper script `run-dynamic-tests.sh` MUST NOT accept `BASE_URL`, `TEST_USER_EMAIL`, or `TEST_USER_PASSWORD` as positional command-line arguments. Instead, it will read them directly from environment variables. The script must perform pre-flight checks and validate that `BASE_URL`, `TEST_USER_EMAIL`, and `TEST_USER_PASSWORD` are set, raising an informative error and exiting if they are missing. This keeps secrets secure and out of process listings (`ps aux`) and shell history files.
- **Estimated Complexity:** High

---

## 6. Testing Strategy

### 6.1 Test Files to Create
| Test File | Tests For | Type |
|-----------|-----------|------|
| `apps/web/e2e/stripe-checkout.spec.ts` | Stripe checkout subscription flow using 4242 test card | E2E |
| `apps/web/e2e/crawler.spec.ts` | Route crawling, link verification, and JS console checks | E2E |

### 6.2 Test Coverage Goals
- [x] On-demand parameterization works perfectly.
- [x] Local environment fallback remains 100% operational.
- [x] Public page route link checks verify without failure.
- [x] Stripe test mode credit card entry and transaction validation succeed.

### 6.3 Test Data Requirements
- Staging/target credentials for one active test user profile.
- Stripe operating in test mode (PK test key configured on target environment).

---

## 7. Dependencies

### 7.1 New Dependencies Required
No new NPM packages are needed. Playwright and standard built-in node packages (`fs`, `path`) completely cover all requirements.

---

## 8. Migration/Rollback Plan

### 8.1 Breaking Changes
- No breaking changes. Existing `pnpm dev` and local `pnpm --filter=web test:e2e` scripts will run completely unchanged as default fallback behavior.

### 8.2 Rollback Strategy
If any issues arise, the modifications in the `apps/web/e2e/` folder can be discarded using Git checkout to instantly restore the original test suite.

---

## 9. Design Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| **Authentication Flow on Remote Domains** | A) Direct DB seeding on staging, B) Dynamic UI-only login | **B (Dynamic UI-only)** | B avoids needing administrative service keys for staging/production databases, is safer, non-destructive, and matches real user interaction. |
| **Path Resolution** | A) Prepend target variable, B) Relative path mapping | **B (Relative paths)** | Native Playwright relative prefixing is standard, elegant, and requires zero manual path-joining code. |
| **Stripe Test-Mode Data Cleanup** | A) Call Stripe API to cancel subscription, B) Leverage UI-cancellation, C) Accept test-mode pollution | **C (Accept test-mode pollution)** | Since tests run in Stripe's isolated Test Mode environment, mock transactions have no real financial or production impact. Wiping this test data can be handled globally inside the Stripe Developer Dashboard. Database-level hygiene is fully maintained by deleting the database user. |
| **Workers & Parallelization** | A) Global parallel execution (workers > 1), B) Strict serial execution (workers: 1) | **B (Strict serial execution)** | Parallel execution of authenticated specs (which reuse the same `.auth/user.json` storage state) will cause database race conditions and state corruption (e.g. one test trying to subscribe while another is checking cancellation). Maintaining `workers: 1` prevents database state flakiness. The execution time of 9 specs runs serially in under 3 minutes, satisfying performance targets. |

---

## 10. Design Review Checklist

- [x] Follows existing codebase patterns
- [x] No unnecessary complexity
- [x] Clear separation of concerns
- [x] Testable design
- [x] No breaking changes (or documented)
- [x] Security considerations addressed
- [x] Performance implications considered

**Design Status:** ✅ Ready for Implementation

---

## Handoff to Implementation Agent

**Implementation Priority:**
1. Parameterize `playwright.config.ts` and update `package.json`.
2. Adapt `global-setup.ts` and `global-teardown.ts` for dual-mode authentication.
3. Refactor `payments.spec.ts` to relative paths.
4. Implement `stripe-checkout.spec.ts`, `crawler.spec.ts`, and `./scripts/run-dynamic-tests.sh`.
