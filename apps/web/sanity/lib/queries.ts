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
// About (Static Page — slug-based lookup)
// ---------------------------------------------------------------------------

export const ABOUT_PAGE_QUERY = groq`
  *[_type == "static_page" && slug.current == "about"][0] {
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
