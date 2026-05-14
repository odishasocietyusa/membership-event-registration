import { sanityFetch } from '@/sanity/lib/client'
import { ALL_GALLERIES_QUERY } from '@/sanity/lib/queries'
import { urlFor } from '@/sanity/lib/image'
import type { SanityMediaGallery } from '@/types/sanity'

export const revalidate = 60

export default async function GalleryPage() {
  const galleries =
    (await sanityFetch<SanityMediaGallery[]>(ALL_GALLERIES_QUERY)) ?? []

  return (
    <main>
      <h1>Gallery</h1>
      {galleries.length === 0 ? (
        <p>No galleries found.</p>
      ) : (
        <ul>
          {galleries.map((gallery) => (
            <li key={gallery._id}>
              <h2>{gallery.title}</h2>
              <time>{gallery.event_date}</time>
              {gallery.coverPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlFor(gallery.coverPhoto).width(400).url()}
                  alt={gallery.title}
                />
              )}
              <p>{gallery.photoCount} photos</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
