import { defineType, defineField } from 'sanity'

export const obituary = defineType({
  name: 'obituary',
  title: 'Obituary',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Full Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'date_of_passing',
      title: 'Date of Passing',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year of Passing',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(1900).max(2100),
    }),
    defineField({
      name: 'state',
      title: 'State',
      type: 'string',
      description: 'US state abbreviation (e.g. CA, WA)',
    }),
    defineField({
      name: 'chapter',
      title: 'OSA Chapter',
      type: 'string',
    }),
    defineField({
      name: 'biography',
      title: 'Biography',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'member_id',
      title: 'Linked Member ID',
      type: 'string',
      description: 'Optional: Supabase member UUID if deceased was an OSA member',
    }),
  ],
  orderings: [
    {
      title: 'Date of Passing, Newest First',
      name: 'dateDesc',
      by: [{ field: 'date_of_passing', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'name', subtitle: 'year', media: 'photo' },
  },
})
