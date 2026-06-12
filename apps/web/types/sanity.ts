export interface SanityEvent {
  _id: string
  title: string
  slug: string
  start_date: string
  end_date?: string
  location: string
  description: string
  flyer?: SanityImage
  registration_link?: string
  chapter?: string
  is_convention: boolean
  // Registration fields (optional — absent on legacy events without registration UI)
  accessLevel?: 'membersOnly' | 'openToAll'
  registrationFee?: number | null
  registrationCapacity?: number | null
  guestCountEnabled?: boolean
  onlineLink?: string | null
}

export interface SanityNewsPost {
  _id: string
  title: string
  slug: string
  published_at: string
  author_name: string
  cover_image?: SanityImage
  body?: PortableTextBlock[]
  tags?: string[]
  featured: boolean
}

export interface SanityAnnouncement {
  _id: string
  title: string
  body: string
  published_at: string
  expires_at?: string
  audience: 'all' | 'members' | 'chapter'
  cta_link?: string
  cta_label?: string
}

export interface SanityStaticPage {
  _id: string
  title: string
  slug: string
  body: PortableTextBlock[]
  section?: string
  last_updated?: string
}

export interface SanityProgramLink {
  _id: string
  title: string
  slug: string
  sort_order: number
}

export interface SanityLeadershipProgram {
  _id: string
  program_name: string
  recipient_name: string
  year: number
  chapter: string
  photo?: SanityImage
  notes?: string
}

export interface SanityMediaGallery {
  _id: string
  title: string
  event_date: string
  chapter?: string
  description?: string
  photoCount: number
  coverPhoto?: SanityImage
}

export interface SanityObituary {
  _id: string
  name: string
  slug: string
  date_of_passing: string
  year: number
  state?: string
  chapter?: string
  biography?: string
  photo?: SanityImage
  member_id?: string
}

export interface SanityObituarySlug {
  slug: string
}

// Shared
export interface SanityImage {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  hotspot?: { x: number; y: number; height: number; width: number }
}

export interface SanityPastConvention {
  _id: string
  year: number
  convention_number: string
  city: string
  state: string
  dates_text?: string
  venue_name?: string
  theme?: string
  host_chapter?: string
  overview?: PortableTextBlock[]
  core_team?: Array<{ name: string; role: string }>
  convention_guests?: Array<{ name: string; role: string }>
  donors?: Array<{
    tier_name: string
    entries: Array<{ name: string; organization?: string }>
  }>
  award_winners?: Array<{ award_name: string; recipient_name: string }>
  youtube_link?: string
  photo_album_link?: string
}

export interface SanityConventionYear {
  year: number
}

export type PortableTextBlock = {
  _type: 'block'
  _key: string
  style?: string
  children?: Array<{
    _type: 'span'
    _key: string
    text: string
    marks?: string[]
  }>
  markDefs?: Array<{
    _type: string
    _key: string
    [key: string]: unknown
  }>
}
