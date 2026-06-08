# Demo Functionality Guide

> A structured checklist of platform capabilities for an Admin to walk a stakeholder through during a live demo. Grouped by audience/area so you can pick the sections relevant to your audience.

## Public Site (no login required)
- Browse upcoming and past **events** with detail pages
- Read **news**, **announcements**, and **obituary** notices
- View **gallery** photos and **publications** (Urmi, Utkarsa)
- Explore **chapters** (executives, BOG documents) and the **leadership program**
- Browse community **activities** (e.g., conventions, drama festival, odissi music, women's forum, networking, library, awards)
- Read organizational pages: **About**, **Constitution**, **Bylaws**, **Member Rights**, **Vision & Mission**, **Committees**, **Forms**, **Policy Documents**, **Contact**
- Browse the **services directory** and contact a service provider
- Make a one-time **donation**

## Member Account & Registration
- **Register** for a new membership account (multi-step wizard, including spouse linkage)
- **Log in / log out**, reset and recover passwords
- **Spouse login**: a spouse can log in with their own email and access the primary member's profile
- View and edit **personal profile** (contact info, address, chapter)
- View **membership status**: tier, join date, expiry date (or "never expires" for lifetime tiers)
- **Self-service membership upgrade**: see eligible tiers and prorated upgrade cost based on cumulative payments made so far
- **Search the member directory**

## Membership & Payments
- **Purchase a membership** (Annual Single, Annual Family, Annual Student, Five-Year Family, Life, Patron, Benefactor, etc.) via Stripe Checkout
- **Upgrade** to a higher tier and pay only the calculated difference
- View payment confirmation / success page
- Receive **automated expiry reminder emails** at four checkpoints (6 months, 3 months, 1 month, 1 week before expiry)

## Event Registration
- Browse event details and **register for an event**
- Pay event registration fees online via Stripe

## Service Provider Directory
- **Register a service listing** as a provider
- Browse and contact listed service providers

## Admin Console (Admin login required)
- **Member management**: view, search, and edit member records and family members
- **Membership management**: view membership status across the org, manually adjust records
- **Event management**: create and manage events and registrations
- **Payments & refunds**: view payment history, issue refunds
- **Service directory moderation**: approve/manage service provider listings
- **Reports**: generate operational reports (membership, payments, etc.)
- **Chapter management**: manage chapters and chapter executives
- **Content management**: publish and edit news, announcements, events, and pages via Sanity Studio (`/studio`)
- **Cron & notifications**: review scheduled jobs (e.g., expiry reminder dispatch)

## Behind the Scenes (good talking points, not click-throughs)
- Role-based access control (Admin / Member / Spouse) enforced via Supabase Auth + Row-Level Security
- Stripe-driven payment flows for memberships, upgrades, donations, and event fees with webhook-based confirmation
- Automated transactional email via Resend (confirmations, password reset, expiry reminders)
- Headless CMS (Sanity) powering news, announcements, and program pages without code deploys

---
*For deeper operational detail behind any of these features, see the [Admin Operations Manual](./admin-operations-manual.md) and [Content Author Guide](./content-author-guide.md).*
