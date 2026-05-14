import { defineConfig } from 'sanity'
import { structuredContent } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './sanity/schemas'

export default defineConfig({
  name: 'osa-platform',
  title: 'OSA Community Platform',

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,

  basePath: '/studio',

  plugins: [
    structuredContent(),
    visionTool(), // GROQ playground — dev use only (included in all envs is fine)
  ],

  schema: {
    types: schemaTypes, // All 6 content types from sanity/schemas/index.ts
  },
})
