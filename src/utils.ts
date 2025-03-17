import type { Package } from '@manypkg/get-packages'
import type { Tokens, TokensList } from 'marked'
import type { PackagesChangelog, PullRequestData } from './types'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { getPackagesSync } from '@manypkg/get-packages'
import { marked } from 'marked'
import { SKIP_CHANGELOG_REG } from './consts'

export function parseMarkdown(markdown: string): TokensList {
  return marked.lexer(markdown)
}

function getChangelogHeading() {
  return parseMarkdown('### 📝 更新日志')[0] as Tokens.Heading
}

export function isExtractPRLog(prData: PullRequestData) {
  if (prData.user.type === 'Bot') {
    return false
  }

  if (prData.labels.find(label => label.name === 'skip-changelog')) {
    return false
  }

  if (prData.head.ref.startsWith('release/')) {
    return false
  }

  if (prData.body && SKIP_CHANGELOG_REG.test(prData.body)) {
    return false
  }

  return true
}

export function isReleasePR(prData: PullRequestData) {
  return prData.head.ref.startsWith('release/')
}

export function extractChangelog(markdown: string, pkgNames: string[]) {
  const md = parseMarkdown(markdown)
  const changelogHeading = getChangelogHeading()
  const pkgDepth = changelogHeading.depth + 1
  let pkgName = ''
  const pkgLogs: Record<string, string[]> = {}
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

export function getPackages(path: string) {
  const { packages } = getPackagesSync(path)
  return packages.filter(pkg => pkg.packageJson?.private !== true)
}

export function stashPrChangelog(prData: PullRequestData, packages: Package[], prChangelog: PackagesChangelog) {
  const mdHead = `---\npr_number:${prData.number}\ncontributor:${prData.user.login}\n---\n\n`

  packages.forEach((pkg) => {
    if (prChangelog[pkg.packageJson.name]) {
      const changelogPath = `${pkg.relativeDir}/.changelog`
      if (!existsSync(changelogPath)) {
        mkdirSync(changelogPath, { recursive: true })
      }
      const logs = prChangelog[pkg.packageJson.name].map(log => `- ${log}`).join('\n')
      const content = `${mdHead}# Changelog\n\n${logs}\n`
      writeFileSync(`${changelogPath}/pr-${prData.number}.md`, content, { flag: 'w' })
    }
  })
}
