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

// Shared
export interface SanityImage {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  hotspot?: { x: number; y: number; height: number; width: number }
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
