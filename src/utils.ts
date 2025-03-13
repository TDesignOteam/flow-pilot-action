import type { Tokens, TokensList } from 'marked'
import { getPackagesSync } from '@manypkg/get-packages'
import { marked } from 'marked'

export function parseMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown)
}

function getChangelogHeading() {
  return parseMarkdown('### 📝 更新日志')[0] as Tokens.Heading
}

export function renderChangelog(markdown: string, pkgs: object) {
  const md = parseMarkdown(markdown)
  const logNode = getChangelogHeading()

  md.forEach((token) => {
    if (token.type === 'heading' && token.depth === logNode.depth && token.text === logNode.text) {
      token.text = `${pkgs[0]}: ${token.text}`
    }
  })
}

export function renderPackages(path: string) {
  const { packages } = getPackagesSync(path)
  return packages.filter(pkg => pkg.packageJson?.private !== true)
}
