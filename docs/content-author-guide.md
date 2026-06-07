# Content Author Guide (Sanity CMS)

This guide is for **volunteer editors and content authors** who publish website content through Sanity Studio. It assumes no coding knowledge — it tells you exactly what to fill in and where it will show up.

> Need editor access? Ask an admin to invite you — see "Accessing Sanity Studio" in `docs/admin-operations-manual.md` §7.

Sanity Studio lives at `https://<your-domain>/studio`.

---

## 1. The most important thing to understand: two kinds of menus

The website's navigation bar has **eight menus**: About Us, Members, Events, Programs, Chapters, Publications, Admin, and Donate (plus the Home page). They are *not* all the same under the hood — and which kind a page belongs to determines what you can and can't do as a content author.

### A. Programs menu — fully content-driven ✅ you control this entirely

The **Programs** dropdown is generated live from Sanity. Whatever **Static Page** documents you tag with `section: "programs"` automatically appear there — in the order you set, linking to a page that's automatically created for you. You can add, remove, reorder, or rename Programs entries entirely from Sanity Studio. **No developer involvement required.**

### B. Every other menu — fixed by code, you fill in the content ⚠️

About Us, Members, Events, Chapters, Publications, Admin, Donate, and the Home page sections are built into the website's code. The menu items, their labels, and the exact page each one links to are **fixed** — you cannot add a new item to these menus, rename an existing one, or move it elsewhere from Sanity Studio. What you *can* do is **fill in the content** of each of those fixed pages, by creating a Static Page document with the **exact slug** that page is wired to look up (listed in §3 below).

> If you want a brand-new page added to one of these menus (not Programs), that requires a small code/spec change — ask a developer or the admin to file it.

---

## 2. How to add a new Programs entry (content-driven — you do this end to end)

1. Go to `https://<your-domain>/studio` and sign in
2. Click **Static Pages** → **New Static Page**
3. Fill in:
   - **Title** — e.g. "Odia Learning" (shown as both the menu link text and the page heading)
   - **Slug** — e.g. `odia-learning` (this becomes the page's URL: `/programs/odia-learning`). Click the slug field and type it manually if you want it different from what auto-generates from the title.
   - **Section** — type exactly `programs` (lowercase, no extra spaces — this is what makes it appear in the Programs menu; anything else and it won't show up there)
   - **Sort Order** — a number controlling display order, lowest first. **Use values like 10, 20, 30…** (not 1, 2, 3) so you can slot new items in between later without renumbering everything
   - **Body** — your page content, using the rich text editor
4. Click **Publish**
5. Within ~60 seconds, the entry appears in the **Programs** dropdown on the live site, and `/programs/<your-slug>` renders your content

**To remove or reorder** a Programs entry: unpublish (or delete) the document, or simply edit its **Sort Order** number — no code change needed either way.

The current Programs roster (suggested slugs, matching the legacy `/activities/*` paths so old links redirect cleanly):

| Title | Suggested slug |
|---|---|
| Odia Learning | `odia-learning` |
| Odissi Music | `odissi-music` |
| Odisha Development | `odisha-development` |
| OSA Public Library | `library` |
| OSA Higher Education | `higher-education` |
| Professional Networking | `networking` |
| Health & Wellness | `health-wellness` |
| Drama Festival | `drama-festival` |
| Sampark Dori | `sampark-dori` |
| Nilachakra (Kids) | `nilachakra` |
| Women's Forum | `womens-forum` |
| Classified | `classified` |
| OSA Committees | `osa-committees` |

---

## 3. How to publish content for a fixed (code-driven) page

These pages already exist and are already linked from the menu — they just show **"Coming soon"** until you create a matching Static Page document.

1. Go to `https://<your-domain>/studio` → **Static Pages** → **New Static Page**
2. Fill in **Title** and **Body** as usual
3. Set the **Slug** to the **exact value** from the table below for the page you're writing for — type it manually; do not let it auto-generate from the title, since the required slug rarely matches the page title
4. Click **Publish** — the page goes live within ~60 seconds

> ⚠️ The slug must match exactly: lowercase, hyphens (not underscores or spaces), no typos. If it doesn't match, your content simply won't be found and the page keeps showing "Coming soon" — there's no error to alert you, so double-check carefully.

### Slug reference — by menu

#### About Us
| Page | Slug |
|---|---|
| Mission & Vision | `about-vision-mission` |
| Constitution & Bylaws | _(managed as an MDX file by a developer, not Sanity)_ |
| Policy Documents | `about-policy-documents` |
| Forms | `about-forms` |
| Administration | `about-administration` |
| Past Leadership | _(managed via the Leadership content type, not Static Pages)_ |
| Statement of Member Rights & Privileges | `about-member-rights` |

#### Members
| Page | Slug | Who sees it |
|---|---|---|
| Membership Types | _(dynamic — pulled from membership pricing data, not Sanity)_ | Members only |
| Member Benefits | `members-benefits` | Everyone |
| Member Directory | _(member search tool, not a content page)_ | Members only |
| Upgrade Membership | _(links into the Dashboard's upgrade section)_ | Members only |
| Member Profile | _(the member's own profile page)_ | Members only |
| Obituary | `obituary` | Members only |

#### Events
| Page | Slug |
|---|---|
| Annual Convention | `activities-convention` |
| Awards | `activities-awards` |
| Events | _(dynamic — pulled from the Events content type, not Static Pages)_ |

#### Chapters
| Page | Slug | Who sees it |
|---|---|---|
| Chapter Details | `chapters` | Everyone |
| Chapter Executives | `chapters-executives` | Members only |
| BOG Documents | `chapters-bog-documents` | `@odishasociety.org` emails only |

#### Publications
| Page | Slug |
|---|---|
| Urmi — Souvenir | `publications-urmi` |
| Utkarsa — Newsletter | `publications-utkarsa` |
| News, Announcements, Gallery | _(dynamic content types — see "Content types" table above)_ |

#### Admin (visible only to admins)
| Page | Slug |
|---|---|
| Manage Events | `admin-events` |
| Manage Reports | `admin-reports` |
| Manage Members, Manage Payments | _(live data tools, not content pages)_ |

#### Donate
| Page | Slug |
|---|---|
| Donate | `donate` |

#### Home page sections
| Section | Slug |
|---|---|
| Current Executive | `home-executive-info` |
| Contact Us | `home-contact-info` |
| Upcoming Events, News | _(dynamic — pulled from Events / News content types)_ |
| Announcements | _(dynamic — pulled from Announcements content type)_ |

#### Pages that exist but are not currently linked from any menu
These pages are live and functional but were intentionally left without a menu link in the SPEC-15 redesign. You can still publish content for them (e.g. for direct links shared by email) — they just won't appear in navigation:

| Page | Slug |
|---|---|
| Member Policy | `members-policy` |
| BOG Meeting Minutes | `members-bog-minutes` |
| (legacy) Contact Us | `about-contact` — now redirects to the home page |
| (legacy) OSA Committees (About Us) | `about-committees` — now redirects to `/programs/osa-committees` |

---

## 4. Quick troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page shows "Coming soon" | No Static Page document exists with that exact slug | Create one with the exact slug from §3 |
| My new Programs entry doesn't show in the menu | `Section` isn't set to exactly `programs`, or the document isn't published | Check spelling/case of the Section field; click Publish (not just Save) |
| My content changed but the live site still shows the old version | ISR cache hasn't refreshed yet (60-second window) | Wait ~60 seconds and hard-refresh (Cmd+Shift+R); if still stale, re-open and re-publish the document |
| I want a new item added to (say) the Members menu | That menu is code-driven — Studio can't add items to it | Ask a developer/admin to make the small code change (it's a quick, well-understood change — see `apps/web/app/components/nav-bar.tsx`) |

---

## 5. Keeping this guide in sync

This guide reflects the navigation structure introduced by **SPEC-15** (redesigned 2026-06-06, shipped 2026-06-07 — see `specs/completed/SPEC-15-navigation-bar.md`). If the navigation is ever restructured again, **this file and the corresponding section of `docs/admin-operations-manual.md` must be updated together** — they are cross-referenced and describe the same system from two audiences' perspectives (admin vs. content author).
