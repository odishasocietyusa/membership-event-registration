import { groq } from 'next-sanity'

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const ALL_EVENTS_QUERY = groq`
  *[_type == "event"] | order(start_date desc) {
    _id,
    title,
    "slug": slug.current,
    start_date,
    end_date,
    location,
    description,
    flyer,
    registration_link,
    chapter,
    is_convention
  }
`

export const EVENT_BY_SLUG_QUERY = groq`
  *[_type == "event" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    start_date,
    end_date,
    location,
    description,
    flyer,
    registration_link,
    chapter,
    is_convention
  }
`

export const ALL_EVENT_SLUGS_QUERY = groq`
  *[_type == "event"] { "slug": slug.current }
`

// Soonest-first upcoming events for homepage widget
export const UPCOMING_EVENTS_QUERY = groq`
  *[_type == "event" && start_date >= now()] | order(start_date asc) [0...$limit] {
    _id,
    title,
    "slug": slug.current,
    start_date,
    location,
    is_convention
  }
`

// ---------------------------------------------------------------------------
// News Posts
// ---------------------------------------------------------------------------

export const ALL_NEWS_POSTS_QUERY = groq`
  *[_type == "news_post"] | order(published_at desc) {
    _id,
    title,
    "slug": slug.current,
    published_at,
    author_name,
    cover_image,
    tags,
    featured
  }
`

export const NEWS_POST_BY_SLUG_QUERY = groq`
  *[_type == "news_post" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    published_at,
    author_name,
    cover_image,
    body,
    tags,
    featured
  }
`

export const ALL_NEWS_SLUGS_QUERY = groq`
  *[_type == "news_post"] { "slug": slug.current }
`

// Latest N news posts for homepage widget
export const NEWS_LATEST_QUERY = groq`
  *[_type == "news_post"] | order(published_at desc) [0...$limit] {
    _id,
    title,
    "slug": slug.current,
    published_at,
    author_name
  }
`

// ---------------------------------------------------------------------------
// Announcements — all published, non-expired announcements are public
// The audience field is preserved in Sanity schema for author tagging,
// but is NOT used for filtering on the website.
// ---------------------------------------------------------------------------

export const ALL_ANNOUNCEMENTS_QUERY = groq`
  *[
    _type == "announcement" &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

// Latest N announcements for homepage widget
export const ANNOUNCEMENTS_LATEST_QUERY = groq`
  *[
    _type == "announcement" &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) [0...$limit] {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

// ---------------------------------------------------------------------------
// Static Pages — generic slug-based lookup
// ---------------------------------------------------------------------------

// Used by /about and all other static_page-backed routes
export const STATIC_PAGE_BY_SLUG_QUERY = groq`
  *[_type == "static_page" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    body,
    section,
    last_updated
  }
`

// Programs nav menu — minimal fields for listing, ordered for display
export const PROGRAMS_BY_SECTION_QUERY = groq`
  *[_type == "static_page" && section == "programs"] | order(sort_order asc) {
    _id,
    title,
    "slug": slug.current,
    sort_order
  }
`

// Legacy alias kept for backward compat with /about/page.tsx
export const ABOUT_PAGE_QUERY = groq`
  *[_type == "static_page" && slug.current == "about-us"][0] {
    _id,
    title,
    "slug": slug.current,
    body,
    section,
    last_updated
  }
`

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export const ALL_GALLERIES_QUERY = groq`
  *[_type == "media_gallery"] | order(event_date desc) {
    _id,
    title,
    event_date,
    chapter,
    description,
    "photoCount": count(photos),
    "coverPhoto": photos[0]
  }
`

// ---------------------------------------------------------------------------
// Obituaries
// ---------------------------------------------------------------------------

export const ALL_OBITUARIES_QUERY = groq`
  *[_type == "obituary"
    && ($name == "" || name match $name + "*")
    && ($state == "" || state == $state)
    && ($year == 0  || year == $year)
  ] | order(date_of_passing desc) [$from...$to] {
    _id,
    name,
    "slug": slug.current,
    date_of_passing,
    year,
    state,
    chapter,
    photo
  }
`

export const OBITUARIES_COUNT_QUERY = groq`
  count(*[_type == "obituary"
    && ($name == "" || name match $name + "*")
    && ($state == "" || state == $state)
    && ($year == 0  || year == $year)
  ])
`

export const OBITUARY_BY_SLUG_QUERY = groq`
  *[_type == "obituary" && slug.current == $slug][0] {
    _id,
    name,
    "slug": slug.current,
    date_of_passing,
    year,
    state,
    chapter,
    biography,
    photo,
    member_id
  }
`

export const ALL_OBITUARY_SLUGS_QUERY = groq`
  *[_type == "obituary"] { "slug": slug.current }
`

// ---------------------------------------------------------------------------
// Leadership Program
// ---------------------------------------------------------------------------

export const ALL_LEADERSHIP_QUERY = groq`
  *[_type == "leadership_program"] | order(year desc, recipient_name asc) {
    _id,
    program_name,
    recipient_name,
    year,
    chapter,
    photo,
    notes
  }
`
