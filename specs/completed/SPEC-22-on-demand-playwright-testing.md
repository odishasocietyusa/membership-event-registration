# Feature Specification: On-Demand Dynamic Playwright E2E Testing & Crawling

> **Spec ID:** SPEC-22-on-demand-playwright-testing
> **Status:** Complete
> **Author:** Antigravity (AI Coding Assistant)
> **Created:** 2026-05-30

---

## 1. Overview

### 1.1 Summary
To guarantee platform stability and visual/functional correctness across continuous deployments, this feature provisions an on-demand Playwright UI testing and crawling framework. It is designed to target dynamically supplied base URLs (e.g., Vercel previews, staging, or production portals) and verify critical functional paths—including public routing, member dashboards, form submissions, and test-mode Stripe checkouts.

### 1.2 Goals
- [x] Support dynamic target URLs (e.g., preview/staging URLs passed via environment variables).
- [x] Crawl the target site to map out pages, routes, navigation elements, and check for basic load errors (4xx/5xx).
- [x] Support automated, authenticated E2E flows using dynamically supplied test user credentials.
- [x] Perform transaction/checkout validation using Stripe test credit cards.
- [x] Re-run the tests dynamically on demand, identify broken selectors, and compile a final QA execution report.

### 1.3 Non-Goals (Out of Scope)
- Building a full visual regression suite (pixel-perfect comparison).
- Performance/load testing under high concurrent users (e.g., JMeter style).
- Running tests in production with real credit cards or live payment gateways.

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Dynamic Target URL provisioning | Must Have | Target URL must be parameterizable (e.g., via `PLAYWRIGHT_BASE_URL` or CLI argument) so it can change with each deployment. |
| FR-02 | Dynamic Authentication flow | Must Have | Log in dynamically using test credentials supplied via environment variables (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) and persist session using Playwright's `storageState`. |
| FR-03 | Crawl and Explore page links | Must Have | Map public routes up to a configurable depth limit, checking for JS console errors and broken pages (404/500). |
| FR-04 | E2E Member Flow execution | Must Have | Test core routes: Landing, Signup/Login, Membership Upgrade, Dashboard. |
| FR-05 | Stripe Checkout Test integration | Must Have | Complete checkout forms using Stripe's standard test card number (`4242...`) when the target site is operating in test mode. |
| FR-06 | Failure logging & DOM selector debugging | Must Have | Retain detailed HTML reports, screenshots on failure, and trace outputs to help debug changing DOM selectors. |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Test Speed | < 3 minutes | Parallelize non-dependent flows to optimize execution speed. |
| NFR-02 | Sandbox Safety | Zero Production Polluting | Dynamic E2E tests must clean up created data or use isolated test IDs so as to not pollute telemetry/analytics. |
| NFR-03 | Resiliency | Flake-free locators | Use user-facing semantic selectors (e.g., standard Playwright locators like `getByRole`) to withstand minor DOM layout updates. |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [x] The crawler script maps all available routes on the target URL.
- [x] The E2E tests execute successfully against any live environment given its URL and test credentials.
- [x] Login, dashboard navigation, and Stripe checkout (test mode) succeed and pass assertions.
- [x] Failing selectors generate readable error traces, allowing immediate pinpointing of DOM issues.
- [x] A final QA report compiles all results and logs them.

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Dynamic Base URL | A dynamic URL is provided | We run the E2E suite | Playwright navigates to the target URL, not `localhost:3000`. |
| Dynamic Authentication | Valid credentials are provided | E2E login runs | Session is captured in a `.auth/dynamic-user.json` file. |
| Stripe Checkout | The checkout flow is reached | The payment form is filled with test card `4242...` | The subscription/event registration completes successfully. |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Playwright, TypeScript, Node.js (`pnpm`).
- **Must Avoid:** Real Stripe live credit cards. Avoid manual hardcoding of base URLs or passwords.

### 4.2 Patterns to Follow
- Follow Playwright best practices: use `storageState` for auth reuse, page-object models if applicable, and semantic locators.
- Store temporary test artifacts under `apps/web/test-results` and `.auth`.

### 4.3 Files/Modules Affected
- `apps/web/playwright.config.ts` — configuration adjustment to support dynamic base URLs.
- `apps/web/e2e/` — new test files and dynamic crawler utilities.
- `package.json` — addition of run scripts for dynamic test orchestration.

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- The target deployed website must have Stripe test-mode keys configured (or active test-mode checkout).
- A valid test user must be registered or registrable in the target Supabase instance.

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should the crawler automatically *generate* test files, or should we have static, highly parameterized test suites that adapt to whatever base URL is given? | Resolved | Static parameterized test suites are implemented for robustness, with dynamic configurations passed via env. |
| How do we handle database seeding for dynamic target URLs (since we cannot run local Prisma pushes on a remote staging environment)? | Resolved | E2E tests leverage the pre-existing user credentials bypass mode to completely eliminate the need for DB seeding or service role keys. |

---

## 7. References

- [Playwright Dynamic Base URL docs](https://playwright.dev/docs/test-parameterized#parameterized-projects)
- [Playwright Storage State docs](https://playwright.dev/docs/auth#reuse-signed-in-state)

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-22-on-demand-playwright-testing/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-22-on-demand-playwright-testing/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-22-on-demand-playwright-testing/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-22-on-demand-playwright-testing/04-qa-report.md`
