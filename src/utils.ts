import type { Tokens, TokensList } from 'marked'
import { getPackagesSync } from '@manypkg/get-packages'
import { marked } from 'marked'

export function parseMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown)
}

function getChangelogHeading() {
  return parseMarkdown('### 📝 更新日志')[0] as Tokens.Heading
}

export function renderChangelog(markdown: string, pkgNames: string[]) {
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
      token.items.forEach((item) => {
        if (item.type === 'list_item') {
          pkgLogs[pkgName].push(item.text.replaceAll('\r\n', '').replaceAll('\n', ''))
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
