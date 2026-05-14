import { defineType, defineField } from 'sanity'

export const announcement = defineType({
  name: 'announcement',
  title: 'Announcement',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'published_at',
      title: 'Published At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expires_at',
      title: 'Expires At',
      type: 'datetime',
    }),
    defineField({
      name: 'audience',
      title: 'Audience',
      type: 'string',
      options: {
        list: [
          { title: 'All (Public)', value: 'all' },
          { title: 'Members Only', value: 'members' },
          { title: 'Chapter', value: 'chapter' },
        ],
        layout: 'radio',
      },
      initialValue: 'all',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
      description: 'Required when audience is set to "Chapter"',
      validation: (Rule) =>
        Rule.custom((chapter, context) => {
          const doc = context.document as { audience?: string }
          if (doc?.audience === 'chapter' && !chapter) {
            return 'Chapter is required when audience is "Chapter"'
          }
          return true
        }),
      hidden: ({ document }) => (document as { audience?: string })?.audience !== 'chapter',
    }),
    defineField({
      name: 'cta_link',
      title: 'Call-to-Action Link',
      type: 'url',
    }),
    defineField({
      name: 'cta_label',
      title: 'Call-to-Action Label',
      type: 'string',
      description: 'Required when Call-to-Action Link is set',
      validation: (Rule) =>
        Rule.custom((label, context) => {
          const doc = context.document as { cta_link?: string }
          if (doc?.cta_link && !label) {
            return 'CTA Label is required when CTA Link is set'
          }
          return true
        }),
    }),
  ],
  orderings: [
    {
      title: 'Published Date, Newest First',
      name: 'publishedAtDesc',
      by: [{ field: 'published_at', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'audience' },
  },
})
