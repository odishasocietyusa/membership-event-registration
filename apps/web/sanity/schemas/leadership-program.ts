import { defineType, defineField } from 'sanity'

export const leadershipProgram = defineType({
  name: 'leadership_program',
  title: 'Leadership Program',
  type: 'document',
  fields: [
    defineField({
      name: 'program_name',
      title: 'Program Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipient_name',
      title: 'Recipient Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) =>
        Rule.required().integer().min(1900).max(new Date().getFullYear() + 1),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
    }),
  ],
  orderings: [
    {
      title: 'Year, Newest First',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'recipient_name', subtitle: 'year', media: 'photo' },
  },
})
