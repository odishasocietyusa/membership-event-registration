# Phase 1: Requirement Analysis

> **Spec ID:** SPEC-22-on-demand-playwright-testing
> **Analyst Agent:** Antigravity (AI QA Automation Engineer)
> **Date:** 2026-05-30
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
We are building an on-demand Playwright UI crawling and E2E testing system. This system will enable QA developers and CI/CD pipelines to run standard verification suites against dynamic target URLs (e.g., dynamic preview environments, staging, or production deployments) instead of being bound to a local `http://localhost:3000` instance.

The system will:
1. Accept a dynamic target base URL via an environment variable.
2. Authenticate using dynamic test user credentials via environment variables, avoiding destructive local database-seeding behaviors when running against remote staging/production systems.
3. Automatically adapt existing relative routes (such as checkout API check endpoints) to the targeted environment.
4. Execute core registration, dashboard, membership, and test-mode Stripe payment flows using hardcoded card inputs.
5. Generate clear execution and failure trace logs.

### 1.2 Key Objectives
1. **Dynamic Target Resolution:** Inject base URL environment variables dynamically, bypassing local server spin-ups if testing a remote target.
2. **Non-Destructive Remote Auth:** Bypass Supabase DB-level user seeding and teardown when credentials are provided directly, allowing safe testing against live deployments.
3. **Relative URL Refactoring:** Refactor hardcoded local base URLs in API and page specs to resolve against the configured Playwright `baseURL` dynamically.
4. **Stripe Test Checkout Flow:** Orchestrate a dedicated E2E payment spec that fills in Stripe Elements fields using the `4242` test card in test-mode transactions.
5. **Execution Reporting:** Ensure clear, readable summaries of test cases, screenshots of DOM failures, and HTML reports.

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| REQ-01 | **Dynamic URL Injection** | Functional | Low | Parameterize `baseURL` in `playwright.config.ts` via `process.env.BASE_URL`. |
| REQ-02 | **Local WebServer Bypass** | Functional | Low | Conditionally disable Playwright's local Next.js `webServer` boot-up when targeting a remote environment. |
| REQ-03 | **Dynamic Auth Strategy** | Functional | Medium | Update `global-setup.ts` to skip Supabase DB creation/seeding if custom credentials `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` are defined. |
| REQ-04 | **Locator Refactoring** | Functional | Medium | Convert hardcoded `http://localhost:3000` URLs in existing specs to relative paths. |
| REQ-05 | **Stripe Test Checkout E2E** | Functional | High | Write a robust Playwright selector engine to locate iframe Stripe Elements, fill input fields, and assert successful submission. |
| REQ-06 | **Crawler Link Verification** | Functional | Medium | Implement a dynamic exploration crawl spec that checks for broken routes (4xx/5xx) and browser console exceptions. |

### 2.2 Implicit Requirements
- **Storage State Reusability:** The `.auth/user.json` storage state generated dynamically must be compatible across all standard logged-in specs (`dashboard.spec.ts`, `memberships.spec.ts`, etc.) without altering their internals.
- **Environment Parity Check:** The remote server must be verified as responsive (using a quick ping/GET request) before embarking on the long-running UI test runner to save execution resources.
- **Graceful Error Recovery:** Stripe Checkout fields, which are served in external third-party `js.stripe.com` iframes, must use robust auto-waiting and retry strategies to avoid flaky test timeouts.

### 2.3 Edge Cases Identified
1. **Target environment database isolation:** If testing dynamic preview environments, their databases might be out of sync or missing basic configurations (e.g. Stripe webhook handlers, seeded memberships).
   * *Mitigation:* The E2E tests must gracefully assert existing states, or verify that basic seed states (such as specific pricing tires) exist on the API endpoint before trying to check out.
2. **Remote authentication with Captchas / 2FA:** Live production or staging environments may have security policies like rate limiting or CAPTCHAs enabled.
   * *Mitigation:* Explicitly verify in non-functional requirements that CAPTCHA-free paths are configured for the specified `TEST_USER_EMAIL` on target portals.

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- Refactoring `playwright.config.ts` to dynamically accept and run tests against any `BASE_URL`.
- Implementing dual-mode authentication in `global-setup.ts`:
  - **Local Mode (Default):** Create/confirm dynamic test user in DB, clean up in global teardown.
  - **Remote Mode (Dynamic):** Skip DB operations; log in via UI with user-provided `TEST_USER_EMAIL` & `TEST_USER_PASSWORD`, and skip deletion in teardown.
- Modernizing `payments.spec.ts` and others to use relative paths rather than `localhost:3000`.
- Writing a dedicated E2E test spec (`apps/web/e2e/payments-flow.spec.ts`) that completes a mock subscription purchase using the Stripe test card elements.
- Creating a crawler route checker (`apps/web/e2e/crawler.spec.ts`) to discover pages and verify link validity.

### 3.2 Out of Scope (Confirmed)
- Destructive Prisma DB push or database seeds targetable to remote environments.
- Creating or automating a real-money credit card checkout.
- Automated creation of multiple user roles (e.g., admin role flows) beyond the standard member flow.

### 3.3 Ambiguous (Needs Clarification)
- **Question:** Should we write a separate run script to easily wrap the dynamic execution? 
  * *Resolution:* Yes, we will introduce a helper script `./scripts/run-dynamic-tests.sh` that takes the URL, email, and password as parameters to make dynamic triggering trivial.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **DB state leakage on remote targets** | Medium | High | For remote deployments, skip `global-teardown.ts` DB deletions if the test user is pre-existing. Never run user seeding on production databases. |
| **Stripe element iframe instability** | Medium | Medium | Implement deep selector waiting (`page.frameLocator(...)`) and retry logic tailored for Stripe's standard elements layout. |
| **Playwright timeout (120s server wait)** | Low | Medium | Disable or configure the `webServer` block entirely when a remote `BASE_URL` is set, eliminating unnecessary dev server startup delays. |

---

## 5. Questions for User

> [!NOTE]
> All questions have been clarified through the user's explicit specifications:
> - Base URLs will be parameterizable via env variables.
> - Authentication will support direct injection of a pre-existing credentials set, bypassing destructive database migrations on the remote server.
> - Stripe transactions will run in test mode with the hardcoded credit card.

---

## 6. Recommendations

### 6.1 Suggested Additions
- **Environment Pre-flight Check:** Add a quick HTTP check in `global-setup.ts` to verify the targeted remote server is reachable and returned a `200 OK` status before starting Chromium.
- **Unified NPM Scripts:** Add `"test:e2e:dynamic"` in `apps/web/package.json` to streamline execution:
  ```json
  "test:e2e:dynamic": "BASE_URL=$BASE_URL PLAYWRIGHT_DYNAMIC_AUTH=true playwright test"
  ```

### 6.2 Suggested Simplifications
- **Relative Path Resolvers:** Rather than managing multiple base URL strings, fully migrate all test suites to utilize relative URLs (e.g. `await page.goto('/dashboard')` or `await request.post('/api/payments/checkout-session')`). Playwright automatically handles the prefixing cleanly based on the resolved `baseURL`.

---

## 7. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable

**Recommendation:** ✅ Proceed to Design Phase!

---

## Handoff to Design Agent

**Key Context for Designer (Phase 2):**
1. **Dynamic Config Switch:** Make `playwright.config.ts` check `process.env.BASE_URL` and disable `webServer` when it is provided.
2. **Conditional Auth Lifecycle:** In `global-setup.ts` and `global-teardown.ts`, evaluate `process.env.TEST_USER_EMAIL`. If present, skip all DB-level operations (creating, confirmation, deletion) and perform UI-based login directly.
3. **Surgical Diffs:** Keep changes focused. Update `playwright.config.ts`, `global-setup.ts`, `global-teardown.ts`, refactor `payments.spec.ts` relative links, and add the Stripe payment E2E spec.
