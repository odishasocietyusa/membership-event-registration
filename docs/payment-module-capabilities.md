# Payment Module — Capabilities Reference

> Source of truth for what members can do themselves vs. what requires admin action.
> Intended as the foundation for the admin operations manual.
> Reflects SPEC-4 as of 2026-05-14.

---

## Quick Summary

| Capability | Member (self-service) | Admin (backend action) | System (automated) |
|---|:---:|:---:|:---:|
| Pay for a new membership | ✅ | — | — |
| Upgrade toward Life membership | ✅ | — | — |
| Auto-activate Life when cumulative ≥ fee | — | — | ✅ |
| Donate any amount | ✅ | — | — |
| View own payment history | ✅ | — | — |
| Request a receipt by email | ✅ | — | — |
| View all members' payments | — | ✅ | — |
| Issue a refund (partial or full) | — | ✅ | — |
| Change membership tier prices | — | ✅ (via Supabase Studio) | — |
| Send expiry reminder emails | — | — | ✅ (cron) |
| Notify admins of expiring memberships | — | — | ✅ (cron) |

---

## Member Self-Service Capabilities

These are actions a logged-in member can perform without contacting an admin. All are initiated through the website UI.

---

### 1. Pay for a New Membership

**Who can do this:** Any authenticated member whose membership is not yet active (status = pending, expired > 1 year, or no membership on record).

**How it works:**
1. Member selects a membership tier from the available options.
2. The system reads the current fee for that tier from the database.
3. Member is redirected to a Stripe-hosted checkout page to complete payment by card.
4. On successful payment, Stripe notifies the system and the membership is activated automatically — no admin approval needed.

**Tiers available for purchase:**

| Tier | Notes |
|------|-------|
| Annual Student (No Vote) | Annual; has expiry date |
| Annual Single | Annual; has expiry date |
| Annual Family | Annual; has expiry date |
| Five-Year Family | Multi-year; has expiry date |
| Life | One-time; no expiry date |
| Life Ward | One-time; no expiry date |
| Patron | Full price always; not an upgrade |
| Benefactor | Full price always; not an upgrade |

> **Note:** Honorary (No Vote) memberships are admin-granted only and cannot be purchased.

**What happens automatically after payment:**
- Membership status changes to **Active**
- Expiry date is set (annual tiers) or left blank (Life tiers)
- Member role is confirmed as `member`

**What the member sees:**
- Stripe checkout page during payment
- Confirmation after successful payment
- Failed/expired checkout is recorded but membership is not activated

---

### 2. Upgrade Toward Life Membership

**Who can do this:** Members on an upgrade-path tier (annual or five-year tiers) whose membership is either currently active or expired within the last 12 months.

**Upgrade path tiers (eligible):** Annual Student, Annual Single, Annual Family, Five-Year Family, Life, Life Ward

**Not on the upgrade path:** Patron, Benefactor — these tiers always require full payment and do not participate in the cumulative upgrade model.

**How the upgrade cost is calculated:**
```
Upgrade cost = Life membership fee − total amount paid in all prior upgrade-path payments
```

**Example:**
> A member paid Annual Single ($40) for four consecutive years = $160 cumulative total.
> Life membership fee = $200.
> Upgrade cost = $200 − $160 = **$40**.
> On the fifth year, when they choose to renew, the system shows them the $40 upgrade option.

**Special case — cumulative ≥ Life fee:**
> If the member has already paid enough over time to equal or exceed the Life fee, the system upgrades them to Life membership automatically at no charge. No Stripe checkout is shown.

**Eligibility rules:**
- **Active membership:** Eligible, pay the difference.
- **Expired ≤ 12 months ago:** Still eligible, pay the difference.
- **Expired > 12 months ago:** Upgrade window closed. Member must purchase a new full membership at the current tier price. Their cumulative payment history is preserved for any future upgrade calculations.

**What happens after a successful upgrade:**
- Membership type changes to **Life**
- Membership status changes to **Active**
- Expiry date is cleared (Life memberships do not expire)
- A payment record is created for the upgrade amount paid

---

### 3. Make a Donation

**Who can do this:** Anyone — logged-in members and non-members (no account required).

**How it works:**
1. Donor enters the amount they wish to donate (any amount).
2. Optionally, donor checks an **Anonymous** checkbox to hide their identity.
3. Donor is redirected to Stripe checkout.
4. On successful payment, the donation is recorded.

**Anonymous donations:**
- When anonymous is selected, the donor's name and email are hidden from all standard views, including admin payment lists.
- Anonymous donations are still internally linked to a member account if the donor was logged in — this is preserved for audit purposes only and is never shown in public-facing outputs.
- Non-members donating anonymously have no identity stored at all.

**Non-member donations:**
- No login required.
- No member record is created or required.
- Donor provides their email at the Stripe checkout page (Stripe collects this).

---

### 4. View Own Payment History

**Who can do this:** Any authenticated member.

**What they see:**
- All their own payment records: membership fees, upgrades, donations, refunds received
- Each record shows: date, amount, payment type, status (completed / failed / refunded)
- Refunded records show the refund amount and date
- They cannot see other members' payments

---

### 5. Request a Receipt by Email

**Who can do this:** Any member or donor, for any completed payment in their own history.

**Two types of receipts:**

#### Membership Payment Receipt
Sent for: new membership fee, upgrade payment, Patron/Benefactor payment.

Contents:
- Member name and email
- Membership tier purchased
- Amount paid and date
- Transaction reference number
- Organization name and address
- **Explicit statement:** *"This payment is for membership dues and is not a charitable contribution. It is not tax-deductible."*

#### Donation Charity Receipt (IRS 501(c)(3))
Sent for: completed donation payments only.

Contents:
- Donor name (omitted if anonymous)
- Donation amount and date
- Organization legal name, mailing address, and EIN (Employer Identification Number)
- **Required IRS statement:** *"No goods or services were provided in exchange for this contribution."*
- Suitable for attaching to a US tax return as evidence of a charitable deduction

**How to request:**
- Member clicks "Request Receipt" next to any completed payment in their payment history.
- Receipt is emailed to their registered email address.
- The system records the timestamp of the request.
- Receipts can be re-requested if needed (the email is re-sent).

---

## Admin Capabilities

These actions require admin access and are performed via the Supabase Studio (for data changes) or via direct API calls (for operational actions like refunds). A future admin UI will surface these more directly.

---

### 1. View All Payments

**Where:** Admin API endpoint (`GET /api/payments`) or Supabase Studio → `payment_records` table.

**What admins can see:**
- Every payment record across all members and all types (membership, upgrade, donation, refund)
- For anonymous donations: the `is_anonymous` flag is visible to admins along with internal member linkage (if any), but the intent is that admins handle this data with discretion
- Filter by: member, payment type, status, date range
- The `is_admin_initiated` flag on each record shows whether the transaction was triggered by the member or by an admin

---

### 2. Issue a Refund

**Where:** Admin API endpoint (`POST /api/payments/:id/refund`).

**Rules:**
- Only admins can initiate refunds — members cannot refund themselves.
- A `refund_reason` is mandatory on every refund (required for nonprofit audit trail).
- Refunds can be **partial** (any amount up to the original payment) or **full**.
- Refunds cannot exceed the original payment amount.
- The refund is processed through Stripe and the card is credited automatically.

**What gets recorded:**
- Original payment record `status` is updated to `refunded`
- `refund_amount_cents` — the actual amount refunded
- `refund_reason` — the reason provided by the admin
- `approved_by` — the admin member ID who issued the refund
- `is_admin_initiated = true` on the refund record

**Important:** Refunding a membership payment does **not** automatically deactivate the membership. If the membership should also be revoked, the admin must separately update the member's `member_status` via the member management tools (SPEC-3).

---

### 3. Change Membership Tier Prices

**Where:** Supabase Studio → `membership_fees` table.

**How it works:**
- Each membership tier has one row in the `membership_fees` table with an `amount_cents` column.
- Admins can edit this value directly in Supabase Studio.
- The new price takes effect **immediately** for all new checkout sessions created after the change.
- Existing in-progress Stripe checkout sessions retain their original price.
- There is no price history / audit log for fee changes — if tracking change history is needed, note the change in your admin records manually.

**Current seeded prices (to be confirmed at implementation):**

| Tier | Suggested Price |
|------|----------------|
| Annual Student (No Vote) | ~$20 |
| Annual Single | ~$40 |
| Annual Family | ~$60 |
| Five-Year Family | ~$250 |
| Life | ~$500 |
| Life Ward | ~$500 |
| Patron | ~$1,000 |
| Benefactor | ~$2,500 |
| Honorary (No Vote) | $0 (admin-granted) |

> Exact prices to be confirmed with the OSA board before seeding.

---

### 4. Grant Honorary Membership

**Where:** Admin action via member management (SPEC-3 — member module).

This is not a payment flow. Honorary memberships are granted at $0 directly by an admin updating the member record. No Stripe session is created. A $0 payment record with `is_admin_initiated = true` is created for audit purposes.

---

## System-Automated Actions

These happen without any human trigger. They are scheduled background jobs.

---

### 1. Membership Expiry Reminders (Cron)

**Schedule:** Runs daily (Vercel cron job).

**What it does:**
- Finds all members with an `expiry_date` exactly 30 days from today → sends a reminder email to each member.
- Finds all members with an `expiry_date` exactly 7 days from today → sends an urgent reminder email to each member.
- Email is sent via Resend from the OSA sender address.

**Email content:**
- Member's name
- Current membership tier
- Expiry date
- Link/instruction to log in and renew or upgrade

**Life members are excluded** — they have no expiry date.

---

### 2. Admin Expiry Notifications (Cron)

**Schedule:** Runs daily alongside the member reminders.

**What it does:**
- Compiles a list of all memberships expiring within the next 30 days.
- Sends a single digest email to all admin-role users.

**Email content:**
- List of members expiring within 30 days: name, tier, expiry date
- Count of members at 30-day and 7-day thresholds
- No action required — informational only (admins can follow up manually if desired)

---

### 3. Post-Payment Membership Activation (Webhook)

**Trigger:** Stripe sends a `checkout.session.completed` event after a successful payment.

**What it does automatically:**
1. Verifies the Stripe signature to confirm the event is genuine.
2. Checks whether this exact event has already been processed (idempotency — prevents duplicates).
3. Creates a payment record in the ledger.
4. For membership payments: updates member's `member_status = active` and sets `expiry_date`.
5. For upgrade payments: updates `membership_type = life` and clears `expiry_date`.
6. For donation payments: records the donation; no membership changes.

**No admin approval is required** for any of these activations — the system handles them fully automatically once Stripe confirms payment.

---

## Access Control Summary

| Action | Guest (no login) | Member | Admin |
|--------|:---:|:---:|:---:|
| Donate | ✅ | ✅ | ✅ |
| Pay for new membership | — | ✅ | — |
| Upgrade membership | — | ✅ | — |
| View own payment history | — | ✅ | ✅ |
| Request receipt | — | ✅ | ✅ |
| View all payments | — | — | ✅ |
| Issue refund | — | — | ✅ |
| Change tier prices | — | — | ✅ (Supabase Studio) |

---

## Things That Are Intentionally Out of Scope (This Version)

- **Event registration payments** — handled in a future spec
- **Recurring/subscription billing** — renewals are always member-initiated
- **Donation campaigns or fundraising goals** — no campaign tracking
- **Admin UI for fee management** — Supabase Studio is sufficient for now
- **Bulk refunds** — refunds are issued one at a time
- **Downloadable receipt PDFs** — receipts are email-only; member prints from email
- **Auto-downgrade on expiry** — membership status changes to `expired` but no automatic tier downgrade occurs
