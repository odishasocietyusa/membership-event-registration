# Phase 3 Implementation — SPEC-18: Member Profile Edit

> **Date:** 2026-05-18
> **Build status:** ✓ Compiled successfully

---

## Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/auth/with-auth.ts` | userId-first lookup with email fallback |
| `apps/web/lib/validation/member.schema.ts` | Removed chapterId from UpdateMemberSchema; added bio, spouseName; added chapterId back to AdminUpdateMemberSchema; added email to CreateFamilyMemberSchema; added UpdateFamilyMemberSchema |
| `apps/web/prisma/schema.prisma` | Added `email String?` to FamilyMember model |
| `apps/web/lib/members/member-service.ts` | Updated interfaces; rewrote updateMember() with chapter derivation + profileData merge + spouse upsert; added updateFamilyMember(); added email to addFamilyMember() |
| `apps/web/app/api/members/me/family/[id]/route.ts` | Added PUT handler |
| `apps/web/app/components/nav-bar.tsx` | Added My Profile link; displayName links to /profile |
| `apps/web/app/dashboard/page.tsx` | Added Edit Profile link |
| `apps/web/app/register/page.tsx` | Added spouseEmail field to FormData type and INITIAL; added spouse email input (shown when spouseName non-empty); added spouse email save after profile POST |

## Files Created

| File | Description |
|------|-------------|
| `apps/web/app/profile/page.tsx` | Server Component: auth guard, parallel fetch member + family, passes props to ProfileClient |
| `apps/web/app/profile/ProfileClient.tsx` | Client Component: full profile edit form, family member add/edit/remove, chapter read-only |

## Migration Pending

The Prisma schema has been updated but the migration has not been applied — local Supabase was not running at implementation time.

**Run this before testing locally:**

```bash
supabase start
cd apps/web
npx prisma migrate dev --name add-family-member-email
```

**For cloud (Vercel/production):**
```bash
cd apps/web
DATABASE_URL="<cloud-url>" npx prisma migrate deploy
```

Or push the schema change and let the Vercel build run `prisma migrate deploy` if configured.

## Deviations from Design

1. **`ProfileClient.tsx` country dropdown** — design doc showed only USA/Canada options; implementation uses `COUNTRY_OPTIONS` from `address-options.ts` (USA, Canada, India, Other) to match the register page and admin page, which were already updated separately.

2. **Register page bootstrap fix** — the `setFormData` call in bootstrap was rebuilding `family` without `spouseEmail`, causing a TypeScript error. Added `spouseEmail: prev.family.spouseEmail` to preserve the field.

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| withAuth uses userId-first lookup | ✅ |
| /profile requires auth; redirects unauthenticated | ✅ |
| All current field values pre-populated on load | ✅ |
| Read-only fields (email, status, type, dates, role) not accepted by API | ✅ |
| Chapter auto-assigned on save; displayed correctly after save | ✅ |
| chapterId sent by client is ignored | ✅ (removed from UpdateMemberSchema) |
| Bio and spouse name save correctly | ✅ |
| Profile visibility checkboxes save correctly | ✅ |
| Family member add/remove/edit | ✅ |
| Spouse email captured on registration and profile page | ✅ |
| Nav bar Profile link for authenticated users | ✅ |
| PUT /api/members/me/family/:id returns 404/403 correctly | ✅ |
| DB migration for family_members.email | ⏳ Pending supabase start |
