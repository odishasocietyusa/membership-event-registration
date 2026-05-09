# Feature Specification: Playwright API Tests

> **Spec ID:** SPEC-2024-02-12-playwright-api-tests
> **Status:** Draft
> **Author:** User
> **Created:** 2024-02-12

---

## 1. Overview

### 1.1 Summary
Implement comprehensive Playwright API tests for the OSA Community Platform NestJS backend. The tests should cover all existing API endpoints across the 4 main modules: Auth, Users, Memberships, and Payments. Tests should validate functionality, authorization, and error handling.

### 1.2 Goals
- [ ] Create a complete API test suite using Playwright
- [ ] Cover all existing API endpoints with meaningful tests
- [ ] Test role-based access control (GUEST, MEMBER, CONTRIBUTOR, ADMIN)
- [ ] Test the membership credit system thoroughly
- [ ] Test Stripe webhook handling
- [ ] Achieve high coverage of business logic

### 1.3 Non-Goals (Out of Scope)
- UI/E2E browser tests (backend API only)
- Performance/load testing
- Tests for modules not yet implemented (Events, CMS)
- Integration with real Stripe API (use mocks/test mode)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Test Auth module endpoints (login, logout, me, JIT sync) | Must Have | JWT validation critical |
| FR-02 | Test Users module endpoints (profile CRUD, role management, GDPR) | Must Have | Include soft delete |
| FR-03 | Test Memberships module endpoints (CRUD, credit system, honorary) | Must Have | Credit system is complex |
| FR-04 | Test Payments module endpoints (checkout, webhooks, admin override) | Must Have | Stripe integration |
| FR-05 | Test authorization for each endpoint by role | Must Have | RBAC enforcement |
| FR-06 | Test error cases and validation | Should Have | Invalid inputs |
| FR-07 | Create reusable test fixtures and helpers | Should Have | DRY test code |
| FR-08 | Test pagination and filtering where applicable | Nice to Have | Users list |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Test execution time | < 60 seconds total | Parallel execution |
| NFR-02 | Test isolation | No shared state between tests | Each test independent |
| NFR-03 | CI/CD ready | Works in GitHub Actions | Headless mode |
| NFR-04 | Clear reporting | HTML + JSON reports | For debugging |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] All 4 modules have dedicated test files
- [ ] Each public endpoint has at least one test
- [ ] All tests pass locally
- [ ] Test fixtures are reusable
- [ ] Documentation updated (TESTING_GUIDE.md)

### 3.2 Test Scenarios

| Module | Scenario | Given | When | Then |
|--------|----------|-------|------|------|
| Auth | Get current user | Valid JWT token | GET /auth/me | Returns user profile |
| Auth | Invalid token | Expired/invalid JWT | Any protected route | 401 Unauthorized |
| Users | Update profile | Authenticated user | PUT /users/profile | Profile updated |
| Users | Admin changes role | Admin user | PUT /users/:id/role | Role updated, audit logged |
| Memberships | Create membership | Member user | POST /memberships | Checkout URL returned |
| Memberships | Credit applied | User with expired membership | POST /memberships | Credit deducted from amount |
| Memberships | Honorary assignment | Admin user | POST /memberships/honorary/assign | User gets free membership |
| Payments | Stripe webhook | Valid signature | POST /webhooks/stripe | Payment processed |
| Payments | Invalid webhook | Invalid signature | POST /webhooks/stripe | 400 Bad Request |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:**
  - Playwright Test Runner (`@playwright/test`)
  - TypeScript
  - Existing playwright.config.ts as base
- **Must Avoid:**
  - Jest (use Playwright's built-in assertions)
  - Real Stripe API calls (mock webhooks)
  - Modifying production code for tests

### 4.2 Patterns to Follow
- Use existing `auth.setup.ts` for authentication setup
- Follow Playwright's Page Object Model for API helpers
- Use test fixtures for reusable setup/teardown
- Group tests by module (auth, users, memberships, payments)

### 4.3 Files/Modules Affected

**New files to create:**
- `apps/api/tests/fixtures/api-helpers.ts` - Reusable API request functions
- `apps/api/tests/fixtures/test-data.ts` - Test data factories
- `apps/api/tests/api/auth.api.spec.ts` - Auth module tests
- `apps/api/tests/api/users.api.spec.ts` - Users module tests
- `apps/api/tests/api/memberships.api.spec.ts` - Memberships module tests
- `apps/api/tests/api/payments.api.spec.ts` - Payments module tests

**Files to modify:**
- `apps/api/playwright.config.ts` - May need adjustments
- `apps/api/TESTING_GUIDE.md` - Update with actual test info

### 4.4 Files NOT to Modify
- `apps/api/src/**/*` - No production code changes
- `apps/api/prisma/schema.prisma` - No schema changes
- Any files in `apps/web/` - Frontend not in scope

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- Supabase must be running locally
- API server must be running (port 3001)
- Database must be seeded with test data
- Test users must exist in Supabase Auth

### 5.2 Downstream Impact
- None (tests are isolated)

---

## 6. API Endpoints to Test

### 6.1 Auth Module (`/auth`)
| Method | Endpoint | Auth Required | Roles | Tests Needed |
|--------|----------|---------------|-------|--------------|
| GET | /auth/me | Yes | Any | Valid token, invalid token, expired token |
| POST | /auth/logout | Yes | Any | Successful logout |

### 6.2 Users Module (`/users`)
| Method | Endpoint | Auth Required | Roles | Tests Needed |
|--------|----------|---------------|-------|--------------|
| GET | /users | Yes | ADMIN | List users, pagination, search |
| GET | /users/profile/:id | Yes | Any (own) / ADMIN (others) | Own profile, other's profile, not found |
| PUT | /users/profile | Yes | Any | Update own profile, validation |
| PUT | /users/:id/role | Yes | ADMIN | Change role, prevent self-demotion |
| DELETE | /users/:id | Yes | ADMIN / Self | Soft delete, GDPR |
| GET | /users/export | Yes | Self | GDPR data export |

### 6.3 Memberships Module (`/memberships`)
| Method | Endpoint | Auth Required | Roles | Tests Needed |
|--------|----------|---------------|-------|--------------|
| GET | /memberships/types | No | - | List active types, exclude honorary |
| GET | /memberships/my-membership | Yes | Any | Current membership, no membership |
| GET | /memberships/me/history | Yes | Any | Membership history |
| POST | /memberships | Yes | Any | Create with checkout, credit calculation |
| PUT | /memberships/:id/approve | Yes | ADMIN | Approve pending membership |
| PUT | /memberships/:id/status | Yes | ADMIN | Override status |
| POST | /memberships/honorary/assign | Yes | ADMIN | Assign honorary membership |
| DELETE | /memberships/me | Yes | MEMBER | Self-cancellation |

### 6.4 Payments Module (`/payments`)
| Method | Endpoint | Auth Required | Roles | Tests Needed |
|--------|----------|---------------|-------|--------------|
| GET | /payments | Yes | Any (own) / ADMIN (all) | Payment history |
| GET | /payments/:id | Yes | Any (own) / ADMIN (all) | Payment details |
| POST | /payments/checkout-session | Yes | Any | Create Stripe session |
| POST | /webhooks/stripe | No (signature) | - | Valid webhook, invalid signature |
| PUT | /payments/:id | Yes | ADMIN | Override payment amount |

---

## 7. Test Data Requirements

### 7.1 Test Users Needed
| Role | Email | Purpose |
|------|-------|---------|
| GUEST | guest@test.com | Unauthenticated/minimal access tests |
| MEMBER | member@test.com | Standard member tests |
| CONTRIBUTOR | contributor@test.com | Content creation tests (future) |
| ADMIN | admin@test.com | Admin functionality tests |

### 7.2 Test Data Factories
- `createTestUser()` - Generate user data
- `createTestMembership()` - Generate membership data
- `createTestPayment()` - Generate payment data
- `generateStripeWebhookPayload()` - Create mock Stripe events

---

## 8. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should we use a separate test database? | Open | |
| How to handle Stripe webhook secrets in tests? | Open | |
| Should tests create their own users or use seeded data? | Open | |

---

## 9. References

- [Playwright API Testing Docs](https://playwright.dev/docs/api-testing)
- [NestJS Testing Guide](https://docs.nestjs.com/fundamentals/testing)
- [apps/api/PLAYWRIGHT_API_TESTS_SUMMARY.md](../apps/api/PLAYWRIGHT_API_TESTS_SUMMARY.md) - Original test plan
- [apps/api/TESTING_GUIDE.md](../apps/api/TESTING_GUIDE.md) - Existing testing guide
- [prompts/03_API_SPECIFICATION.md](../prompts/03_API_SPECIFICATION.md) - Full API specification

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** ✅ Complete
- **Artifact:** `specs/artifacts/SPEC-2024-02-12-playwright-api-tests/01-analysis.md`

### Phase 2: Design
- **Status:** ✅ Complete
- **Artifact:** `specs/artifacts/SPEC-2024-02-12-playwright-api-tests/02-design.md`

### Phase 3: Implementation
- **Status:** ✅ Complete - Awaiting User Approval
- **Artifact:** `specs/artifacts/SPEC-2024-02-12-playwright-api-tests/03-implementation.md`
- **Summary:** Created 7 test files (1,874 lines) with ~78 tests covering 28 API endpoints

### Phase 4: QA & Testing
- **Status:** Ready to Start (Pending Phase 3 Approval)
- **Artifact:** `specs/artifacts/SPEC-2024-02-12-playwright-api-tests/04-qa-report.md`
