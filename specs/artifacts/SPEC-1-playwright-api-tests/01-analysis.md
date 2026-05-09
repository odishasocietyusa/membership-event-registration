# Phase 1: Requirement Analysis

> **Spec:** SPEC-2024-02-12-playwright-api-tests
> **Analyst Agent:** Claude Code
> **Date:** 2024-02-12
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
Create a comprehensive Playwright-based API test suite for the OSA Community Platform NestJS backend. The suite must cover all existing endpoints across 4 modules (Auth, Users, Memberships, Payments), validate role-based access control, test the membership credit system, and handle Stripe webhook mocking.

### 1.2 Key Objectives
1. **Comprehensive Coverage** - Test all 30+ API endpoints across 4 modules
2. **RBAC Validation** - Verify hierarchical role-based access (GUEST < MEMBER < CONTRIBUTOR < ADMIN)
3. **Business Logic Testing** - Deep testing of membership credit system and honorary memberships
4. **Stripe Integration** - Mock webhook handling with signature verification
5. **Test Infrastructure** - Create reusable fixtures and helpers for DRY test code

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| REQ-01 | Test 2 Auth endpoints (me, logout) | Functional | Low | JWT tokens |
| REQ-02 | Test 11 Users endpoints (profile, roles, GDPR) | Functional | Medium | JWT tokens, admin role |
| REQ-03 | Test 12 Memberships endpoints (CRUD, credit, honorary) | Functional | High | Multiple roles, payment mocks |
| REQ-04 | Test 5 Payments endpoints (checkout, webhooks) | Functional | High | Stripe webhook mocking |
| REQ-05 | Create reusable API helpers (auth, assertions) | Infrastructure | Medium | None |
| REQ-06 | Create test data factories | Infrastructure | Low | None |
| REQ-07 | Test role-based authorization for all endpoints | Security | High | All roles configured |
| REQ-08 | Test error cases (401, 403, 404, 400) | Functional | Medium | None |
| REQ-09 | Test pagination and filtering (users list) | Functional | Low | Test data |
| REQ-10 | Parallel test execution (<60s total) | Performance | Medium | Playwright config |

### 2.2 Implicit Requirements
[Requirements not explicitly stated but necessary for implementation]

- [ ] **Test database isolation** - Tests should not interfere with each other
- [ ] **Supabase test users** - Need actual test users in Supabase Auth (GUEST, MEMBER, CONTRIBUTOR, ADMIN)
- [ ] **JWT token management** - Tokens must be obtained and stored for each role
- [ ] **Stripe webhook secret** - Need test webhook signing secret for signature verification
- [ ] **Database seeding** - Membership types must be seeded before tests run
- [ ] **Test cleanup** - Tests should clean up created data or use transactions
- [ ] **JIT sync testing** - Test the Just-In-Time user creation on first API access
- [ ] **Soft delete verification** - Ensure deleted users can't authenticate

### 2.3 Edge Cases Identified
1. **Expired membership credit** - Credit beyond 365-day window should not apply
2. **Credit reuse prevention** - Same credit can't be used twice
3. **Cancelled vs expired memberships** - Only EXPIRED qualifies for credit, not CANCELLED
4. **Self-role-demotion** - Admins shouldn't be able to demote themselves
5. **Invalid Stripe signature** - Webhook with wrong signature should return 400
6. **Soft-deleted user authentication** - Should fail even with valid JWT
7. **Pagination edge cases** - Empty results, last page, invalid skip/take values
8. **Honorary membership visibility** - Should NOT appear in public /memberships/types list
9. **Concurrent membership applications** - User shouldn't have multiple PENDING memberships
10. **Admin override audit trail** - Status changes should be logged with timestamps

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- ✅ All 30+ existing API endpoints across 4 modules
- ✅ Role-based authorization testing (GUEST, MEMBER, CONTRIBUTOR, ADMIN)
- ✅ Membership credit system (365-day window, reuse prevention)
- ✅ Honorary membership assignment and visibility rules
- ✅ Stripe webhook signature verification (mocked)
- ✅ GDPR data export functionality
- ✅ Soft delete behavior
- ✅ JIT (Just-In-Time) user synchronization
- ✅ Admin override capabilities (status, payment amount)
- ✅ Error cases and validation (401, 403, 404, 400)
- ✅ Pagination and filtering (users list)

### 3.2 Out of Scope (Confirmed)
- ❌ UI/E2E browser tests (backend API only)
- ❌ Performance/load testing
- ❌ Tests for unimplemented modules (Events, CMS)
- ❌ Real Stripe API integration (use test mode/mocks)
- ❌ Tests for Auth Controller (no dedicated auth.controller.ts found)
- ❌ Integration tests spanning multiple services
- ❌ Database migration testing

### 3.3 Ambiguous (Needs Clarification)
- [ ] **Test database strategy** - Use main DB with cleanup, or separate test DB?
- [ ] **Test user creation** - Create in Supabase via API, or manually set up once?
- [ ] **Stripe webhook secret** - Use actual test secret, or mock the entire verification?
- [ ] **Test data persistence** - Should tests clean up after themselves, or assume fresh DB?

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test users not in Supabase | High | High | Document setup process, create helper script |
| JWT tokens expire during test run | Medium | Medium | Use long-lived test tokens or refresh mechanism |
| Stripe webhook mocking complexity | Medium | High | Study existing webhook handler, mock signature gen |
| Test data conflicts (non-isolated tests) | Medium | High | Use unique test data per test, or transactions |
| Credit system logic misunderstanding | Low | High | Study MembershipsService.calculateCheckoutAmount() |
| Supabase not running during tests | High | High | Document prerequisite, add health check |
| Parallel test race conditions | Low | Medium | Ensure test isolation, use unique identifiers |
| Admin token used for wrong tests | Low | Medium | Clear test organization by role |

---

## 5. Questions for User

> ⚠️ **BLOCKING:** These questions must be answered before proceeding to Design phase

1. [x] **Test Database Strategy:** ✅ **ANSWERED**
   - **Decision:** Use main development database with cleanup after each test
   - **Rationale:** Simpler setup, no separate database needed

2. [x] **Test User Setup:** ✅ **ANSWERED**
   - **Decision:** Dynamic creation via Supabase Admin API
   - **Rationale:** More flexible, tests are self-contained

3. [x] **Stripe Webhook Secret:** ✅ **ANSWERED**
   - **Decision:** Use real Stripe test webhook secret
   - **Rationale:** More realistic testing of signature verification

4. [x] **Test Data Cleanup:** ✅ **ANSWERED**
   - **Decision:** Clean up created data after each test
   - **Rationale:** Safer for local dev, no state pollution

---

## 6. Recommendations

### 6.1 Suggested Additions
- **Health Check Test:** Add a simple health check test to verify API and Supabase are running
- **Test Data Builders:** Create builder pattern for test data (e.g., `new UserBuilder().withRole('ADMIN').build()`)
- **Shared Test Context:** Create a test context object that all tests can access (tokens, base URL, etc.)
- **Test Tagging:** Tag tests by module and role for selective execution (e.g., `@auth`, `@admin-only`)

### 6.2 Suggested Simplifications
- **Skip Auth Module Tests:** Since there's no dedicated auth controller (JIT sync is tested via other endpoints)
- **Limit Pagination Tests:** Only test basic pagination (skip, take) - complex filtering can come later
- **Mock Stripe Webhooks Entirely:** Don't worry about signature verification initially - focus on handler logic

### 6.3 Technical Concerns
1. **JWT Token Expiration:** Long test runs might cause tokens to expire mid-execution
2. **Supabase Dependency:** Tests are tightly coupled to Supabase being available
3. **Test Execution Time:** 30+ endpoints with multiple test cases each could exceed 60s target
4. **Credit System Complexity:** The credit calculation logic is complex and needs careful testing
5. **Role Hierarchy Testing:** Need to verify each role can/cannot access each endpoint (combinatorial explosion)

---

## 7. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] All blocking questions answered
- [x] Scope is clearly defined
- [x] Risks are acceptable (with mitigations)

**Recommendation:** ✅ **Approved - Proceed to Design** - All blocking questions answered.

---

## 8. Discovered Facts from Codebase Analysis

### 8.1 Actual API Endpoints Found

**Users Module (11 endpoints):**
- `GET /users` (ADMIN)
- `GET /users/me` (Any)
- `GET /users/:id` (ADMIN)
- `POST /users/me/profile` (Any)
- `PUT /users/me/profile` (Any)
- `PUT /users/:id/role` (ADMIN)
- `GET /users/me/export` (Self)
- `GET /users/:id/export` (ADMIN)
- `DELETE /users/me` (Self)
- `DELETE /users/:id` (ADMIN)

**Memberships Module (12 endpoints):**
- `GET /memberships/types` (Public)
- `GET /memberships` (ADMIN)
- `GET /memberships/me` (Any)
- `GET /memberships/me/history` (Any)
- `GET /memberships/:id` (ADMIN)
- `POST /memberships` (Any)
- `POST /memberships/:id/approve` (ADMIN)
- `POST /memberships/:id/reject` (ADMIN) - **NEW, not in spec**
- `POST /memberships/honorary/assign` (ADMIN)
- `PUT /memberships/:id/status` (ADMIN)
- `DELETE /memberships/me` (Self)
- `DELETE /memberships/:id` (ADMIN)

**Payments Module (5 endpoints):**
- `POST /payments/checkout-session` (Any)
- `GET /payments/me` (Any)
- `POST /payments/webhook` (Public, signature verified)
- `PUT /payments/:id` (ADMIN)

**Total: 28 endpoints (not 30+ as estimated)**

### 8.2 Authentication Patterns Confirmed
- **JwtAuthGuard:** Validates Supabase JWT tokens
- **JIT Sync:** Auto-creates users with GUEST role on first API access
- **RolesGuard:** Hierarchical role checking (ADMIN > CONTRIBUTOR > MEMBER > GUEST)
- **Soft Delete Check:** Deleted users cannot authenticate even with valid JWT
- **@CurrentUser() Decorator:** Injects database user object into controllers

### 8.3 Test Infrastructure Status
- ✅ Playwright config exists and is properly configured
- ✅ Auth setup file exists but is incomplete (placeholder)
- ❌ No test spec files exist yet
- ❌ No test fixtures or helpers exist yet
- ✅ Test commands already defined in package.json

---

## Handoff to Design Agent

**Key Context for Designer:**

1. **Most Important:** The backend has 28 actual endpoints (not 30+). One extra endpoint found: `POST /memberships/:id/reject`

2. **Authentication is Complex:** Tests need to handle:
   - JWT token extraction and validation via Supabase
   - JIT user synchronization (users created on first API access)
   - Hierarchical role checking (not strict equality)
   - Soft delete blocking

3. **Constraints to Be Aware Of:**
   - Playwright config already exists - must extend, not replace
   - auth.setup.ts structure exists - complete it, don't rewrite
   - Tests must not modify production code
   - Must use Playwright assertions (not Jest)

4. **Critical Testing Areas:**
   - Membership credit system (365-day window, no reuse)
   - Honorary membership visibility (hidden from public list)
   - Admin overrides with audit trail
   - Stripe webhook signature verification

**Blocking Items for Design:**
- User must answer 4 clarifying questions about test database, user setup, Stripe secret, and cleanup strategy
