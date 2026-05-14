import { defineType, defineField } from 'sanity'

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'start_date',
      title: 'Start Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'end_date',
      title: 'End Date',
      type: 'datetime',
      validation: (Rule) =>
        Rule.custom((endDate, context) => {
          const startDate = (context.document as { start_date?: string })?.start_date
          if (endDate && startDate && endDate < startDate) {
            return 'End date must be on or after start date'
          }
          return true
        }),
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'flyer',
      title: 'Flyer Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'registration_link',
      title: 'Registration Link',
      type: 'url',
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
    }),
    defineField({
      name: 'is_convention',
      title: 'Is Convention',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Start Date, Newest First',
      name: 'startDateDesc',
      by: [{ field: 'start_date', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'start_date', media: 'flyer' },
  },
})
