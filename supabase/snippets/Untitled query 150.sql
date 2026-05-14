-- ══════════════════════════════════════════════════════════════════
-- SPEC-3: Row Level Security Policies
-- Run this once after prisma db push creates the tables.
-- ══════════════════════════════════════════════════════════════════

-- ── members ──────────────────────────────────────────────────────
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

CREATE POLICY members_select_own ON members
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY members_select_admin ON members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

CREATE POLICY members_update_own ON members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY members_update_admin ON members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

CREATE POLICY members_insert_jit ON members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── family_members ────────────────────────────────────────────────
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members FORCE ROW LEVEL SECURITY;

CREATE POLICY family_select_own ON family_members
  FOR SELECT TO authenticated
  USING (primary_member_id IN (
    SELECT id FROM members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY family_select_admin ON family_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

CREATE POLICY family_insert_own ON family_members
  FOR INSERT TO authenticated
  WITH CHECK (primary_member_id IN (
    SELECT id FROM members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY family_update_own ON family_members
  FOR UPDATE TO authenticated
  USING (primary_member_id IN (
    SELECT id FROM members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ))
  WITH CHECK (primary_member_id IN (
    SELECT id FROM members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY family_update_admin ON family_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

-- ── chapters ──────────────────────────────────────────────────────
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters FORCE ROW LEVEL SECURITY;

CREATE POLICY chapters_select_public ON chapters
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY chapters_insert_admin ON chapters
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

CREATE POLICY chapters_update_admin ON chapters
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));

-- ── payment_records ───────────────────────────────────────────────
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_select_own ON payment_records
  FOR SELECT TO authenticated
  USING (member_id IN (
    SELECT id FROM members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY payments_select_admin ON payment_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.user_id = auth.uid() AND m.role = 'admin' AND m.deleted_at IS NULL
  ));