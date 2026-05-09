# OSA Platform API - Postman Collection

Complete Postman collection for end-to-end testing of the OSA Community Platform API.

## 📦 What's Included

- **Collection**: `OSA-Platform-API.postman_collection.json` - 28 endpoints across 3 modules
- **Environment**: `OSA-Platform-Local.postman_environment.json` - Local development variables
- **This Guide**: Complete setup and testing instructions

## 🚀 Quick Start

### 1. Import into Postman

**Import Collection:**
1. Open Postman
2. Click **Import** button (top left)
3. Select `OSA-Platform-API.postman_collection.json`
4. Collection appears in left sidebar

**Import Environment:**
1. Click **Import** again
2. Select `OSA-Platform-Local.postman_environment.json`
3. Select "OSA Platform - Local Development" from environment dropdown (top right)

### 2. Start Your Local Server

```bash
# Make sure Supabase is running
supabase start

# Start the API server
cd apps/api
pnpm dev

# Server should be running on http://localhost:3001
```

### 3. Get Your Auth Token

#### Option A: Using Supabase Auth UI (Recommended)

1. Start your frontend (if available):
   ```bash
   cd apps/web
   pnpm dev
   ```

2. Sign up/login via Google or Microsoft OAuth

3. Open browser DevTools → Console

4. Run this to get your token:
   ```javascript
   (await supabase.auth.getSession()).data.session.access_token
   ```

5. Copy the token

#### Option B: Using Test User Creation Script

If you have a script to create test users (see [Creating Test Users](#creating-test-users) section), you can use that to get a token.

### 4. Set Auth Token in Postman

1. Select "OSA Platform - Local Development" environment
2. Click the eye icon 👁️ next to environment dropdown
3. Find `auth_token` variable
4. Paste your token in the **Current Value** field
5. Click **Save**

### 5. Test the Collection

**Recommended First Request:**
1. Expand **Users** folder
2. Click **Get Current User**
3. Click **Send**
4. You should see your user data (200 OK)

✅ If this works, you're ready to test all endpoints!

---

## 📋 Collection Structure

### Users Module (10 endpoints)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| Get Current User | GET | Retrieve authenticated user info | ✅ |
| Create Profile | POST | Create user profile (required for membership) | ✅ |
| Update Profile | PUT | Update profile information | ✅ |
| Get Profile | GET | Retrieve user profile | ✅ |
| Export My Data | GET | GDPR data export | ✅ |
| Soft Delete Account | DELETE | Soft delete user account | ✅ |
| [Admin] List All Users | GET | List all users | 🔐 Admin |
| [Admin] Get User by ID | GET | Get specific user | 🔐 Admin |
| [Admin] Change User Role | PUT | Update user role | 🔐 Admin |
| [Admin] Delete User | DELETE | Permanently delete user | 🔐 Admin |

### Memberships Module (12 endpoints)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| List Membership Types | GET | Get all membership types | ❌ Public |
| Get Membership Type by ID | GET | Get specific type details | ❌ Public |
| Apply for Membership | POST | Submit membership application | ✅ |
| Get My Membership | GET | Get current membership | ✅ |
| Get My Membership History | GET | Get all past memberships | ✅ |
| Cancel My Membership | DELETE | Cancel active membership | ✅ |
| [Admin] List All Memberships | GET | List all memberships | 🔐 Admin |
| [Admin] Get Membership by ID | GET | Get specific membership | 🔐 Admin |
| [Admin] Approve Membership | POST | Approve pending membership | 🔐 Admin |
| [Admin] Update Membership Status | PUT | Change membership status | 🔐 Admin |
| [Admin] Grant Honorary Membership | POST | Give free honorary membership | 🔐 Admin |
| [Admin] Check Available Credit | GET | Check user's credit balance | 🔐 Admin |

### Payments Module (6 endpoints)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| Create Checkout Session | POST | Create Stripe payment session | ✅ |
| Get My Payment History | GET | View payment history | ✅ |
| Stripe Webhook | POST | Handle Stripe events | ❌ Webhook |
| [Admin] List All Payments | GET | List all payments | 🔐 Admin |
| [Admin] Get Payment by ID | GET | Get specific payment | 🔐 Admin |
| [Admin] Override Payment Amount | PUT | Modify payment amount | 🔐 Admin |

---

## 🎯 Testing Workflows

### Workflow 1: New User Registration (Complete Flow)

This workflow simulates a new user joining and becoming a member:

1. **Get Current User** (Users)
   - Verifies authentication works
   - Auto-saves `user_id` and `user_role` to environment

2. **List Membership Types** (Memberships)
   - Browse available membership options
   - Auto-saves first `membership_type_id` to environment

3. **Create Profile** (Users)
   - **⚠️ Required before applying for membership**
   - Fill in name, address, phone
   - Auto-saves `profile_id` to environment

4. **Apply for Membership** (Memberships)
   - Uses saved `membership_type_id` from step 2
   - Creates PENDING membership
   - Auto-saves `membership_id` to environment

5. **Create Checkout Session** (Payments)
   - Uses saved `membership_id` from step 4
   - Returns Stripe checkout URL
   - Auto-saves `payment_id` and `stripe_session_id`

6. **Get My Membership** (Memberships)
   - Check membership status (should be PENDING until payment)

7. **Get My Payment History** (Payments)
   - View created payment record

### Workflow 2: Admin Operations (Requires Admin Role)

**Prerequisites:**
- Your user must have ADMIN role
- Have a `target_user_id` set in environment (another user's ID)

1. **[Admin] List All Users** (Users)
   - See all registered users
   - Copy a user ID for testing

2. **[Admin] Get User by ID** (Users)
   - Set `target_user_id` in environment
   - View specific user details

3. **[Admin] List All Memberships** (Memberships)
   - See all membership applications
   - Find PENDING memberships to approve

4. **[Admin] Approve Membership** (Memberships)
   - Approve a pending membership
   - User is promoted to MEMBER role
   - Membership status changes to ACTIVE

5. **[Admin] Grant Honorary Membership** (Memberships)
   - Give free lifetime membership
   - User is immediately promoted to MEMBER

6. **[Admin] List All Payments** (Payments)
   - View all payment transactions

### Workflow 3: Profile & Membership Management

1. **Get Profile** (Users)
   - View current profile

2. **Update Profile** (Users)
   - Modify name, phone, bio, etc.

3. **Get My Membership** (Memberships)
   - Check active membership status

4. **Get My Membership History** (Memberships)
   - View all past memberships

5. **Cancel My Membership** (Memberships)
   - Cancel active membership

6. **Export My Data** (Users)
   - GDPR data export (all user data)

---

## 🔧 Environment Variables

The environment automatically captures values from API responses. You can also set them manually:

| Variable | Description | Auto-Set | Example Value |
|----------|-------------|----------|---------------|
| `base_url` | API base URL | ❌ | `http://localhost:3001/api` |
| `auth_token` | Bearer token for authentication | ❌ | `eyJhbGciOiJIUzI1Ni...` |
| `user_id` | Current user's UUID | ✅ | `a1b2c3d4-...` |
| `user_role` | Current user's role | ✅ | `GUEST`, `MEMBER`, `ADMIN` |
| `profile_id` | User's profile UUID | ✅ | `e5f6g7h8-...` |
| `membership_type_id` | Selected membership type | ✅ | `i9j0k1l2-...` |
| `membership_id` | Created membership UUID | ✅ | `m3n4o5p6-...` |
| `membership_status` | Membership status | ✅ | `PENDING`, `ACTIVE` |
| `payment_id` | Payment record UUID | ✅ | `q7r8s9t0-...` |
| `stripe_session_id` | Stripe checkout session | ✅ | `cs_test_...` |
| `target_user_id` | User ID for admin operations | ❌ | `u1v2w3x4-...` |

**To view/edit variables:**
1. Click the eye icon 👁️ next to environment dropdown
2. Edit **Current Value** column
3. Click **Save**

---

## 🧪 Testing Tips

### Authentication

- **Most endpoints** require Bearer token authentication (automatically added from `auth_token` variable)
- **Public endpoints** (no auth):
  - List Membership Types
  - Get Membership Type by ID
  - Stripe Webhook (verified via signature)

### Request Body Examples

**Create Profile:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+15551234567",
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102",
    "country": "USA"
  },
  "dateOfBirth": "1990-01-01",
  "gender": "MALE",
  "bio": "Member of OSA community"
}
```

**Apply for Membership:**
```json
{
  "membershipTypeId": "{{membership_type_id}}"
}
```

**Grant Honorary Membership (Admin):**
```json
{
  "userId": "{{target_user_id}}",
  "note": "Honorary membership for community contributions"
}
```

### Using Test Scripts

Each request has built-in test scripts that:
- Extract IDs from responses
- Save them to environment variables
- Log useful information to console
- Validate response status

**View console output:**
1. Send a request
2. Open **Console** (bottom of Postman window)
3. See extracted variables and logs

---

## 🔍 Troubleshooting

### "Unauthorized" (401 Error)

**Cause:** Missing or expired auth token

**Fix:**
1. Check `auth_token` is set in environment
2. Token format should be: `eyJhbGciOiJIUzI1Ni...`
3. Get a fresh token from Supabase (tokens expire after 1 hour by default)

### "Forbidden" (403 Error)

**Cause:** User doesn't have required role

**Fix:**
- Admin endpoints require ADMIN role
- To test admin endpoints, promote your user in database:
  ```sql
  UPDATE "User" SET role = 'ADMIN' WHERE email = 'your@email.com';
  ```

### "Please complete your profile before applying for membership" (400 Error)

**Cause:** Profile not created before membership application

**Fix:**
1. Run **Create Profile** endpoint first
2. Then run **Apply for Membership**

### "Cannot find module" or "ECONNREFUSED" Error

**Cause:** API server not running

**Fix:**
```bash
cd apps/api
pnpm dev
```

### Variables Not Auto-Setting

**Cause:** Test scripts not running

**Fix:**
1. Check **Tests** tab in request
2. Send request again
3. Check **Console** for errors

---

## 🎓 Advanced Usage

### Running Collection with Newman (CLI)

```bash
# Install Newman (Postman CLI)
npm install -g newman

# Run entire collection
newman run OSA-Platform-API.postman_collection.json \
  -e OSA-Platform-Local.postman_environment.json

# Run specific folder
newman run OSA-Platform-API.postman_collection.json \
  -e OSA-Platform-Local.postman_environment.json \
  --folder "Users"

# Generate HTML report
newman run OSA-Platform-API.postman_collection.json \
  -e OSA-Platform-Local.postman_environment.json \
  -r html
```

### CI/CD Integration

You can integrate this collection into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Run API Tests
  run: |
    npm install -g newman
    newman run postman/OSA-Platform-API.postman_collection.json \
      -e postman/OSA-Platform-Local.postman_environment.json \
      --bail
```

### Creating Additional Environments

Duplicate the environment file for different deployments:

- `OSA-Platform-Local.postman_environment.json` (localhost)
- `OSA-Platform-Staging.postman_environment.json` (staging server)
- `OSA-Platform-Production.postman_environment.json` (production)

Just change the `base_url` value in each.

---

## 📝 Creating Test Users

### Option 1: Via Supabase Auth UI

If you have the frontend running, use the signup flow.

### Option 2: Direct Database Seeding

Create a test user script (`scripts/create-test-user.ts`):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function createTestUser(email: string, password: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;

  // Sign in to get access token
  const { data: session } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  console.log('Access Token:', session.session?.access_token);
  return session.session?.access_token;
}

createTestUser('test@example.com', 'Test123!@#')
  .then((token) => console.log('✅ User created. Token:', token))
  .catch(console.error);
```

Run with:
```bash
npx tsx scripts/create-test-user.ts
```

---

## 📚 API Documentation

For detailed API specifications, see:
- [Testing Guide](../apps/api/TESTING_GUIDE.md)
- [QA Report](../specs/artifacts/SPEC-2024-02-12-playwright-api-tests/04-qa-report.md)
- [CLAUDE.md](../CLAUDE.md) - Project architecture

---

## 🤝 Support

If you encounter issues:

1. Check this README's Troubleshooting section
2. Verify API server is running: `curl http://localhost:3001/api/memberships/types`
3. Check API logs for errors
4. Review Postman console for request/response details

---

## 📄 License

Part of the OSA Community Platform project. See root LICENSE file.
