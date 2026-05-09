# Phase 2: Architecture & Design

> **Spec:** SPEC-2024-02-12-playwright-api-tests
> **Architect Agent:** Claude Code
> **Date:** 2024-02-12
> **Status:** Ready for Review

---

## 1. Design Overview

### 1.1 Solution Summary
Create a comprehensive Playwright API test suite with 4 test files covering 28 endpoints across Users, Memberships, and Payments modules. The solution includes:
- **Reusable test fixtures** for API helpers and test data factories
- **Dynamic user creation** via Supabase Admin API
- **Role-based test organization** using Playwright projects
- **Stripe webhook mocking** with real signature verification
- **Test cleanup** after each test for isolation

### 1.2 Design Principles Applied
- **DRY (Don't Repeat Yourself)** - Reusable helpers and data factories
- **Test Isolation** - Each test cleans up its own data
- **Single Responsibility** - Each helper function has one clear purpose
- **Page Object Model** - API helpers encapsulate request logic
- **AAA Pattern** - Arrange, Act, Assert in every test
- **Fail Fast** - Descriptive error messages for quick debugging

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified
| Pattern | Location | Will Reuse? |
|---------|----------|-------------|
| Playwright config with multiple projects | `playwright.config.ts` | Yes - Extend |
| Auth setup structure | `tests/auth.setup.ts` | Yes - Complete |
| Role-based guards | `src/modules/auth/guards/` | Reference for tests |
| DTO validation patterns | `src/modules/*/dto/` | Use for test data |
| Supabase JWT validation | `src/modules/auth/guards/jwt-auth.guard.ts` | Understand for auth tests |

### 2.2 Related Existing Code
| File | Relevance | Action |
|------|-----------|--------|
| `playwright.config.ts` | Test configuration | Verify, no changes needed |
| `tests/auth.setup.ts` | Auth setup skeleton | Complete implementation |
| `src/modules/users/users.controller.ts` | Users API endpoints | Reference for test cases |
| `src/modules/memberships/memberships.controller.ts` | Memberships API | Reference for test cases |
| `src/modules/payments/payments.controller.ts` | Payments API | Reference for test cases |
| `PLAYWRIGHT_API_TESTS_SUMMARY.md` | Original test plan | Reference for test structure |

### 2.3 Conventions to Follow
- **Naming:** Use descriptive test names: `should <expected behavior> when <condition>`
- **File Structure:** Group tests by module, fixtures in separate directory
- **Error Handling:** Use Playwright's `expect()` assertions with clear messages
- **Testing:** Use `test.describe()` for grouping, `test.beforeEach()` for setup
- **Async/Await:** All API calls are async, use proper await handling

---

## 3. Architecture Design

### 3.1 Component Diagram
```
┌───────────────────────────────────────────────────────────────┐
│                      Playwright Test Runner                    │
└───────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┬─────────────┐
            │                 │                 │             │
    ┌───────▼───────┐ ┌──────▼──────┐ ┌───────▼──────┐ ┌────▼────┐
    │  Guest Tests  │ │ Member Tests│ │ Contrib Tests│ │  Admin  │
    │  (Public API) │ │ (JWT Token) │ │  (JWT Token) │ │  Tests  │
    └───────┬───────┘ └──────┬──────┘ └───────┬──────┘ └────┬────┘
            └─────────────────┼─────────────────┴───────────┘
                              │
                    ┌─────────▼─────────┐
                    │   API Helpers     │
                    │ - makeRequest()   │
                    │ - expectSuccess() │
                    │ - expectError()   │
                    └─────────┬─────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
    ┌───────▼────────┐ ┌─────▼──────┐ ┌───────▼──────────┐
    │  Test Data     │ │   Auth     │ │     Cleanup      │
    │   Factories    │ │   Setup    │ │     Helpers      │
    │ - createUser() │ │ - getToken │ │ - deleteUser()   │
    │ - createMem()  │ │ - createSu │ │ - deletePayment()│
    └────────────────┘ └────────────┘ └──────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   NestJS API      │
                    │  (localhost:3001) │
                    └───────────────────┘
```

### 3.2 Data Flow
```
Test Starts
    ↓
auth.setup.ts creates users → Stores JWT tokens
    ↓
Test reads JWT from storage state
    ↓
makeRequest(endpoint, { token }) → Adds Authorization header
    ↓
API validates JWT → Returns response
    ↓
expectSuccess/expectError → Asserts response
    ↓
Cleanup removes test data
    ↓
Test Completes
```

### 3.3 Key Interfaces/Contracts
```typescript
// API Helper interface
interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  data?: any;
  token?: string;
  headers?: Record<string, string>;
}

// Test user interface
interface TestUser {
  id: string;
  email: string;
  role: 'GUEST' | 'MEMBER' | 'CONTRIBUTOR' | 'ADMIN';
  token: string;
  supabaseId: string;
}

// Test data factory interface
interface UserFactory {
  email?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}

// Stripe webhook payload
interface StripeWebhookPayload {
  type: string;
  data: {
    object: any;
  };
}
```

---

## 4. File Structure

### 4.1 New Files to Create

| File Path | Purpose | Template/Base |
|-----------|---------|---------------|
| `tests/fixtures/api-helpers.ts` | Reusable API request and assertion functions | N/A |
| `tests/fixtures/test-data.ts` | Test data factories (user, membership, payment) | N/A |
| `tests/fixtures/supabase-helpers.ts` | Supabase Admin API helpers for user creation | N/A |
| `tests/fixtures/stripe-helpers.ts` | Stripe webhook signature generation | N/A |
| `tests/api/users.api.spec.ts` | Users module tests (~30 tests) | Playwright test file |
| `tests/api/memberships.api.spec.ts` | Memberships module tests (~28 tests) | Playwright test file |
| `tests/api/payments.api.spec.ts` | Payments module tests (~20 tests) | Playwright test file |

### 4.2 Files to Modify

| File Path | Changes | Impact |
|-----------|---------|--------|
| `tests/auth.setup.ts` | Complete implementation (create users, get tokens) | Low - completes placeholder |
| `TESTING_GUIDE.md` | Update with actual test commands and structure | Low - documentation only |

### 4.3 Files NOT to Touch
| File Path | Reason |
|-----------|--------|
| `playwright.config.ts` | Already properly configured |
| `src/**/*` | No production code changes |
| `prisma/schema.prisma` | No schema changes |

---

## 5. Implementation Plan

### 5.1 Implementation Sequence

```
Step 1: Create Test Fixtures
   └── Creates: api-helpers.ts, test-data.ts, supabase-helpers.ts, stripe-helpers.ts

Step 2: Complete Auth Setup (depends on Step 1)
   └── Modifies: auth.setup.ts

Step 3: Implement Users Tests (depends on Step 2)
   └── Creates: users.api.spec.ts

Step 4: Implement Memberships Tests (depends on Step 2)
   └── Creates: memberships.api.spec.ts

Step 5: Implement Payments Tests (depends on Step 2, Step 4)
   └── Creates: payments.api.spec.ts

Step 6: Update Documentation (depends on all)
   └── Modifies: TESTING_GUIDE.md
```

### 5.2 Detailed Steps

#### Step 1: Create Test Fixtures
- **Goal:** Build reusable test infrastructure
- **Files:**
  - Create `tests/fixtures/api-helpers.ts`
    - `makeRequest(options)` - Make authenticated API requests
    - `expectSuccess(response)` - Assert 2xx response
    - `expectUnauthorized(response)` - Assert 401
    - `expectForbidden(response)` - Assert 403
    - `expectNotFound(response)` - Assert 404
    - `expectBadRequest(response)` - Assert 400
    - `isValidUuid(str)` - Validate UUID format
    - `isValidIsoDate(str)` - Validate ISO date format
  - Create `tests/fixtures/test-data.ts`
    - `createUserData(overrides?)` - Generate user test data
    - `createProfileData(overrides?)` - Generate profile data
    - `createMembershipData(overrides?)` - Generate membership data
    - `createPaymentData(overrides?)` - Generate payment data
  - Create `tests/fixtures/supabase-helpers.ts`
    - `createSupabaseUser(email, password)` - Create user via Admin API
    - `getSupabaseToken(email, password)` - Get JWT token
    - `deleteSupabaseUser(id)` - Delete user via Admin API
    - `updateUserRole(id, role)` - Update database user role
  - Create `tests/fixtures/stripe-helpers.ts`
    - `generateStripeSignature(payload, secret)` - Generate webhook signature
    - `createMockCheckoutSession(data)` - Create mock session object
- **Key Implementation Notes:**
  - Use Playwright's `request` fixture for API calls
  - All helpers should be async
  - Add TypeScript types for all parameters
  - Include JSDoc comments for documentation
- **Estimated Complexity:** Medium

#### Step 2: Complete Auth Setup
- **Goal:** Implement user creation and token management
- **Files:**
  - Modify `tests/auth.setup.ts`
    - Implement `authenticate as member` setup
    - Implement `authenticate as contributor` setup
    - Implement `authenticate as admin` setup
    - Use Supabase helpers to create users and get tokens
    - Store tokens in `playwright/.auth/*.json` files
- **Key Implementation Notes:**
  - Use environment variables for Supabase URL and service key
  - Create unique emails per test run to avoid conflicts
  - Set proper roles in database after user creation
  - Handle cleanup of old test users
- **Estimated Complexity:** High

#### Step 3: Implement Users Tests
- **Goal:** Test all 11 Users module endpoints
- **Files:**
  - Create `tests/api/users.api.spec.ts`
- **Test Cases:**
  1. **GET /users/me** (Any role)
     - Should return current user profile
     - Should return 401 without token
  2. **POST /users/me/profile** (Any role)
     - Should create profile with valid data
     - Should validate required fields
  3. **PUT /users/me/profile** (Any role)
     - Should update own profile
     - Should not update other user's profile
  4. **GET /users** (Admin only)
     - Should list all users with pagination
     - Should filter by role
     - Should return 403 for non-admin
  5. **GET /users/:id** (Admin only)
     - Should return user by ID
     - Should return 404 for invalid ID
  6. **PUT /users/:id/role** (Admin only)
     - Should update user role
     - Should prevent self-demotion
     - Should return 403 for non-admin
  7. **GET /users/me/export** (Self)
     - Should export own data (GDPR)
  8. **GET /users/:id/export** (Admin only)
     - Should export user data by ID
  9. **DELETE /users/me** (Self)
     - Should soft delete own account
  10. **DELETE /users/:id** (Admin only)
      - Should soft delete user
- **Estimated Complexity:** Medium

#### Step 4: Implement Memberships Tests
- **Goal:** Test all 12 Memberships module endpoints
- **Files:**
  - Create `tests/api/memberships.api.spec.ts`
- **Test Cases:**
  1. **GET /memberships/types** (Public)
     - Should list active membership types
     - Should exclude honorary memberships
  2. **GET /memberships/me** (Any role)
     - Should return current membership
     - Should return null if no membership
  3. **GET /memberships/me/history** (Any role)
     - Should return membership history
  4. **POST /memberships** (Any role)
     - Should create membership with checkout
     - **Should apply credit from expired membership**
     - **Should calculate 365-day credit window**
     - **Should not apply cancelled membership credit**
     - Should return checkout session URL
  5. **POST /memberships/:id/approve** (Admin only)
     - Should approve pending membership
  6. **POST /memberships/:id/reject** (Admin only)
     - Should reject membership with reason
  7. **POST /memberships/honorary/assign** (Admin only)
     - **Should assign honorary membership (free)**
     - **Should promote user to MEMBER role**
     - Should return 403 for non-admin
  8. **PUT /memberships/:id/status** (Admin only)
     - **Should override membership status**
     - Should log admin action
  9. **GET /memberships** (Admin only)
     - Should list all memberships with pagination
  10. **GET /memberships/:id** (Admin only)
      - Should return membership by ID
  11. **DELETE /memberships/me** (Self)
      - Should cancel own membership
  12. **DELETE /memberships/:id** (Admin only)
      - Should cancel membership by ID
- **Estimated Complexity:** High

#### Step 5: Implement Payments Tests
- **Goal:** Test all 5 Payments module endpoints
- **Files:**
  - Create `tests/api/payments.api.spec.ts`
- **Test Cases:**
  1. **POST /payments/checkout-session** (Any role)
     - Should create Stripe checkout session
     - **Should include credit discount in amount**
  2. **GET /payments/me** (Any role)
     - Should return user's payment history
  3. **POST /payments/webhook** (Public)
     - **Should process checkout.session.completed**
     - **Should verify Stripe signature**
     - Should return 400 for invalid signature
     - Should activate membership after payment
  4. **PUT /payments/:id** (Admin only)
     - **Should override payment amount**
     - Should log admin action
     - Should return 403 for non-admin
  5. **GET /payments/:id** (Admin only) - If exists
     - Should return payment details
- **Estimated Complexity:** High

#### Step 6: Update Documentation
- **Goal:** Document test commands and structure
- **Files:**
  - Modify `TESTING_GUIDE.md`
    - Add actual test file listings
    - Update test commands
    - Document test data requirements
    - Add troubleshooting section
- **Estimated Complexity:** Low

---

## 6. Testing Strategy

### 6.1 Test Files to Create
| Test File | Tests For | Type | Estimated Tests |
|-----------|-----------|------|-----------------|
| `users.api.spec.ts` | Users module | API/Integration | ~30 |
| `memberships.api.spec.ts` | Memberships module | API/Integration | ~28 |
| `payments.api.spec.ts` | Payments module | API/Integration | ~20 |

### 6.2 Test Coverage Goals
- [x] All public endpoints have at least one test
- [x] Happy path covered for each endpoint
- [x] Error cases covered (401, 403, 404, 400)
- [x] Edge cases covered (credit system, honorary memberships)
- [x] Role-based authorization tested for each endpoint

### 6.3 Test Data Requirements
- **Test Users:** 4 users (Guest, Member, Contributor, Admin) created dynamically
- **Membership Types:** Use seeded data from `prisma/seed.ts`
- **Test Memberships:** Create during tests, clean up after
- **Test Payments:** Mock Stripe data, no real API calls
- **Unique Identifiers:** Use timestamps or UUIDs to avoid conflicts

---

## 7. Dependencies

### 7.1 New Dependencies Required
| Package | Version | Reason |
|---------|---------|--------|
| None | - | All required packages already installed |

**Confirmation:** Playwright, TypeScript, and all NestJS dependencies already present in package.json

### 7.2 Environment Variables Required
```env
# Supabase Admin (for user creation)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-status>

# API Base URL
API_URL=http://localhost:3001

# Stripe Test Mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 8. Migration/Rollback Plan

### 8.1 Breaking Changes
- [x] No breaking changes - tests are additive

### 8.2 Rollback Strategy
If tests fail or cause issues:
1. Delete created test files
2. Revert auth.setup.ts to placeholder
3. Remove test users from Supabase (if needed)

No production code changes, so no risk to deployed application.

---

## 9. Design Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Test user creation | Manual setup, Dynamic API creation | Dynamic API | More flexible, self-contained tests |
| Test database | Separate DB, Main dev DB | Main dev DB | Simpler setup, cleanup handles isolation |
| Stripe webhooks | Full mock, Real signature | Real signature | More realistic testing |
| Test organization | Single file, Module files | Module files | Better organization, parallel execution |
| Cleanup strategy | Per-test, Before run | Per-test | Safer, works in any environment |
| Test data factories | Builders, Simple functions | Simple functions | Less overhead, faster to implement |
| Auth token storage | Env vars, Storage state | Storage state | Playwright standard, secure |

---

## 10. Design Review Checklist

- [x] Follows existing codebase patterns
- [x] No unnecessary complexity
- [x] Clear separation of concerns (fixtures, tests, setup)
- [x] Testable design (all helpers are unit-testable)
- [x] No breaking changes
- [x] Security considerations addressed (JWT validation, webhook signatures)
- [x] Performance implications considered (parallel execution, cleanup)

**Design Status:** ✅ Ready for Implementation

---

## Handoff to Implementation Agent

**Implementation Priority:**
1. **First:** Create all test fixtures (api-helpers, test-data, supabase-helpers, stripe-helpers)
2. **Second:** Complete auth.setup.ts (critical for all tests)
3. **Third:** Implement users.api.spec.ts (simplest module to start)
4. **Fourth:** Implement memberships.api.spec.ts (most complex business logic)
5. **Fifth:** Implement payments.api.spec.ts (depends on memberships for credit testing)
6. **Last:** Update TESTING_GUIDE.md documentation

**Critical Constraints:**
- Do NOT modify production code (src/**/*) or playwright.config.ts
- All test users must be cleaned up after test run
- Use proper TypeScript types for all functions
- Follow AAA pattern (Arrange, Act, Assert) in all tests

**Reference Files:**
- Study `src/modules/memberships/memberships.service.ts` for credit calculation logic
- Study `src/modules/auth/guards/jwt-auth.guard.ts` for JIT sync behavior
- Reference `PLAYWRIGHT_API_TESTS_SUMMARY.md` for test case ideas

**Environment Setup Required Before Implementation:**
- Supabase must be running (`supabase start`)
- API must be running (`pnpm dev --filter=api`)
- Database must be seeded (`pnpm prisma:seed`)
