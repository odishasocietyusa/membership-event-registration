import { defineType, defineField } from 'sanity'

export const mediaGallery = defineType({
  name: 'media_gallery',
  title: 'Media Gallery',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'event_date',
      title: 'Event Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
    }),
    defineField({
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'caption',
              title: 'Caption',
              type: 'string',
            }),
          ],
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
  ],
  orderings: [
    {
      title: 'Event Date, Newest First',
      name: 'eventDateDesc',
      by: [{ field: 'event_date', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'event_date', media: 'photos.0' },
  },
})
