import { readFile } from 'fs/promises'
import path from 'path'
import { MDXRemote } from 'next-mdx-remote/rsc'

export default async function BylawsPage() {
  const filePath = path.join(process.cwd(), 'content', 'bylaws.mdx')
  const source = await readFile(filePath, 'utf8')

  return (
    <main>
      <MDXRemote source={source} />
    </main>
  )
}
