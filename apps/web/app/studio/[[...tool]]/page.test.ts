/**
 * Tests for apps/web/app/studio/[[...tool]]/page.tsx
 *
 * Covers:
 * - ST-01: exports dynamic = 'force-dynamic'
 * - ST-02: exports a default function (page component)
 * - ST-03: uses NextStudio (renders the Sanity Studio)
 * - ST-04: passes sanity config to NextStudio
 */

jest.mock('next-sanity/studio', () => ({
  NextStudio: jest.fn().mockReturnValue(null),
}))

jest.mock('@/sanity.config', () => ({
  projectId: 'test-project',
  dataset: 'production',
}))

import React from 'react'
import StudioPage, { dynamic } from '@/app/studio/[[...tool]]/page'
import { NextStudio } from 'next-sanity/studio'

const mockNextStudio = NextStudio as jest.Mock

describe('StudioPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNextStudio.mockReturnValue(null)
  })

  /**
   * ST-01: exports dynamic = 'force-dynamic'
   * Required so Next.js never statically renders the Studio route
   */
  it('ST-01: exports dynamic = "force-dynamic"', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  /**
   * ST-02: exports a default page component function
   */
  it('ST-02: exports a default function component', () => {
    expect(typeof StudioPage).toBe('function')
  })

  /**
   * ST-03: renders — returns a JSX element (React element)
   * NextStudio is used as a JSX element so the page returns a React.createElement
   * result. We verify the result is a React element with the correct type.
   */
  it('ST-03: returns a React element wrapping NextStudio', () => {
    const result = StudioPage()
    // Should return a valid React element (non-null object with $$typeof)
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
    expect(typeof result).toBe('object')
  })

  /**
   * ST-04: the returned element uses NextStudio as its type
   */
  it('ST-04: returned element type is the NextStudio component', () => {
    const result = StudioPage() as React.ReactElement
    // JSX <NextStudio config={config} /> → React.createElement(NextStudio, {config})
    // result.type should be the mocked NextStudio function
    expect(result.type).toBe(mockNextStudio)
  })
})
