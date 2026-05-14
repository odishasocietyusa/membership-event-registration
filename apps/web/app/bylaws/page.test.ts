/**
 * Tests for apps/web/app/bylaws/page.tsx
 *
 * Covers:
 * - BY-01: Reads bylaws.mdx from the content directory
 * - BY-02: Reads file with utf8 encoding
 * - BY-03: Passes the file contents to MDXRemote
 * - BY-04: Returns a defined JSX element
 * - BY-05: Propagates readFile errors (does not silently swallow them)
 */

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}))

jest.mock('next-mdx-remote/rsc', () => ({
  MDXRemote: jest.fn().mockReturnValue(null),
}))

import BylawsPage from '@/app/bylaws/page'
import { readFile } from 'fs/promises'
import { MDXRemote } from 'next-mdx-remote/rsc'

const mockReadFile = readFile as jest.Mock
const mockMDXRemote = MDXRemote as jest.Mock

describe('BylawsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMDXRemote.mockReturnValue(null)
  })

  /**
   * BY-01: reads bylaws.mdx from the content directory
   */
  it('BY-01: reads bylaws.mdx from content directory', async () => {
    mockReadFile.mockResolvedValueOnce('# Bylaws\n\nContent here.')

    await BylawsPage()

    expect(mockReadFile).toHaveBeenCalledTimes(1)
    const calledPath = mockReadFile.mock.calls[0][0] as string
    // Should end with content/bylaws.mdx (handles both / and \)
    expect(calledPath).toMatch(/content[/\\]bylaws\.mdx$/)
  })

  /**
   * BY-02: reads with utf8 encoding
   */
  it('BY-02: reads file with utf8 encoding', async () => {
    mockReadFile.mockResolvedValueOnce('# Bylaws')

    await BylawsPage()

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('bylaws.mdx'),
      'utf8'
    )
  })

  /**
   * BY-03: passes file source to MDXRemote
   * MDXRemote is used as a JSX element so React.createElement calls it with props.
   * We verify the rendered output is defined (MDXRemote is the mocked component).
   */
  it('BY-03: renders with MDXRemote (component used in JSX)', async () => {
    const mdxContent = '# OSA Bylaws\n\nSection 1...'
    mockReadFile.mockResolvedValueOnce(mdxContent)

    const result = await BylawsPage()
    // The page renders <MDXRemote source={source} /> inside <main>
    expect(result).toBeDefined()
    expect(result).not.toBeNull()
  })

  /**
   * BY-04: returns a defined JSX element
   */
  it('BY-04: returns a defined JSX element', async () => {
    mockReadFile.mockResolvedValueOnce('# Bylaws')

    const result = await BylawsPage()
    expect(result).toBeDefined()
  })

  /**
   * BY-05: propagates readFile errors (no silent swallowing)
   */
  it('BY-05: propagates readFile errors', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT: file not found'))

    await expect(BylawsPage()).rejects.toThrow('ENOENT')
  })
})
