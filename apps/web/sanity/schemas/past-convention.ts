import { defineType, defineField } from 'sanity'

export const pastConvention = defineType({
  name: 'past_convention',
  title: 'Past Convention',
  type: 'document',
  fields: [
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(1900).max(2100),
    }),
    defineField({
      name: 'convention_number',
      title: 'Convention Number',
      type: 'string',
      description: 'e.g. "56th"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'state',
      title: 'State',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'dates_text',
      title: 'Convention Dates',
      type: 'string',
      description: 'Free-form, e.g. "July 4–6, 2025"',
    }),
    defineField({
      name: 'venue_name',
      title: 'Venue Name',
      type: 'string',
    }),
    defineField({
      name: 'theme',
      title: 'Convention Theme / Motto',
      type: 'string',
    }),
    defineField({
      name: 'host_chapter',
      title: 'Host Chapter or Region',
      type: 'string',
    }),
    defineField({
      name: 'overview',
      title: 'Overview',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'core_team',
      title: 'Convention Core Team',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'role', title: 'Role', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'role', subtitle: 'name' } },
        },
      ],
    }),
    defineField({
      name: 'convention_guests',
      title: 'Convention Guests',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'role', title: 'Role', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'role', subtitle: 'name' } },
        },
      ],
    }),
    defineField({
      name: 'donors',
      title: 'Convention Donors',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'tier_name', title: 'Tier Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({
              name: 'entries',
              title: 'Donors',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({ name: 'name', title: 'Donor Name', type: 'string', validation: (Rule) => Rule.required() }),
                    defineField({ name: 'organization', title: 'Organization', type: 'string' }),
                  ],
                  preview: { select: { title: 'name', subtitle: 'organization' } },
                },
              ],
            }),
          ],
          preview: { select: { title: 'tier_name' } },
        },
      ],
    }),
    defineField({
      name: 'award_winners',
      title: 'Convention Award Winners',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'award_name', title: 'Award Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'recipient_name', title: 'Recipient Name', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'award_name', subtitle: 'recipient_name' } },
        },
      ],
    }),
    defineField({
      name: 'youtube_link',
      title: 'YouTube Video Link',
      type: 'url',
    }),
    defineField({
      name: 'photo_album_link',
      title: 'Photo Album Link',
      type: 'url',
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
    select: { title: 'convention_number', subtitle: 'year' },
    prepare(selection: Record<string, unknown>) {
      return { title: `${selection.title} Annual Convention`, subtitle: String(selection.subtitle) }
    },
  },
})
