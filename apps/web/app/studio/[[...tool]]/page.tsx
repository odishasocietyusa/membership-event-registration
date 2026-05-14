'use client'

// Must be force-dynamic: Studio is not statically renderable
export const dynamic = 'force-dynamic'

import { NextStudio } from 'next-sanity/studio'
import config from '@/sanity.config'

export default function StudioPage() {
  return <NextStudio config={config} />
}
