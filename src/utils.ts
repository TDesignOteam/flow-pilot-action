import type { Tokens, TokensList } from 'marked'
import { getPackagesSync } from '@manypkg/get-packages'
import { marked } from 'marked'
import { SKIP_CHANGELOG_REG } from './consts'

export function parseMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown)
}

function getChangelogHeading() {
  return parseMarkdown('### 📝 更新日志')[0] as Tokens.Heading
}

export function renderChangelog(markdown: string, pkgNames: string[]) {
  if (SKIP_CHANGELOG_REG.test(markdown)) {
    return null
  }
  const md = parseMarkdown(markdown)
  const changelogHeading = getChangelogHeading()
  const pkgDepth = changelogHeading.depth + 1
  let pkgName = ''
  const pkgLogs = {}
  pkgNames.forEach((name) => {
    pkgLogs[name] = []
  })
  let collectLogs = false

  md.forEach((token) => {
    if (token.type === changelogHeading.type && token.depth === changelogHeading.depth) {
      collectLogs = token.text === changelogHeading.text
    }

    if (collectLogs && token.type === 'heading' && token.depth === pkgDepth) {
      pkgName = token.text
    }
    if (collectLogs && token.type === 'list' && pkgNames.includes(pkgName)) {
      const items = token.items as Tokens.ListItem[]
      items.forEach((item) => {
        if (item.type === 'list_item' && item.tokens.length) {
          const token = item.tokens[0] as Tokens.Text
          pkgLogs[pkgName].push(token.text)
        }
      })
    }
  })
  return pkgLogs
}

export function renderPackages(path: string) {
  const { packages } = getPackagesSync(path)
  return packages.filter(pkg => pkg.packageJson?.private !== true)
}
