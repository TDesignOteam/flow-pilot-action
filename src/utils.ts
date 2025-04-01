import type { Package } from '@manypkg/get-packages'
import type { Tokens, TokensList } from 'marked'
import type { PackagesChangelog, PullRequestData, PullRequestFiles } from './types'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { context } from '@actions/github/lib/utils'
import { getPackagesSync } from '@manypkg/get-packages'
import camelcase from 'camelcase'
import { globSync } from 'glob'
import { marked } from 'marked'
import { CHANGELOG_REG, NEW_VERSION_REG, OLD_VERSION_REG, SKIP_CHANGELOG_REG } from './consts'

export function pascalCase(str: string) {
  return camelcase(str, { pascalCase: true })
}

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

export function stashPullRequestChangelog(prData: PullRequestData, packages: Package[], prChangelog: PackagesChangelog) {
  packages.forEach((pkg) => {
    if (prChangelog[pkg.packageJson.name]) {
      const changelogPath = `${pkg.dir}/.changelog`
      if (!existsSync(changelogPath)) {
        mkdirSync(changelogPath, { recursive: true })
      }
      const logs = prChangelog[pkg.packageJson.name].map((log) => {
        return `- ${log} @${prData.user.login} ([#${prData.number}](${prData.html_url}))`
      }).join('\n')
      const content = `${logs}\n`
      writeFileSync(`${changelogPath}/pr-${prData.number}.md`, content, { flag: 'w' })
    }
  })
}

export function getPullRequestReleaseDirs(prFiles: PullRequestFiles) {
  return prFiles.filter((file) => {
    if (file.status !== 'modified') {
      return false
    }
    if (!file.filename.includes('package.json')) {
      return false
    }
    if (!file.patch?.includes('version')) {
      return false
    }
    const newVersion = file.patch.match(NEW_VERSION_REG)
    const oldVersion = file.patch.match(OLD_VERSION_REG)
    if (!newVersion || !oldVersion) {
      return false
    }
    if (newVersion[1] === oldVersion[1]) {
      return false
    }

    return true
  }).map(file => dirname(file.filename))
}

export function getStashChangelog(path: string) {
  const files = globSync(`${path}/.changelog/*.md`)
  const changelogs: string[] = []
  files.forEach((file) => {
    readFileSync(file, 'utf8').split('\n').forEach((line) => {
      if (line) {
        changelogs.push(line)
      }
    },
    )
  })
  return changelogs
}

export function renderChangelogMarkdown(changelogs: string[]) {
  const featList: Record<string, string[]> = {}
  const fixList: Record<string, string[]> = {}
  const docsList: Record<string, string[]> = {}
  const perfList: Record<string, string[]> = {}
  const breakingList: Record<string, string[]> = {}
  const otherList: Record<string, string[]> = {}

  changelogs.forEach((log) => {
    const type = log.match(CHANGELOG_REG)?.[1] || ''
    const scope = log.match(CHANGELOG_REG)?.[2] || ''
    const message = log.match(CHANGELOG_REG)?.[3] || ''
    switch (type) {
      case 'feat':
        Reflect.has(featList, scope) ? featList[scope].push(message) : featList[scope] = [message]
        break
      case 'fix':
        Reflect.has(fixList, scope) ? fixList[scope].push(message) : fixList[scope] = [message]
        break
      case 'docs':
      case 'doc':
        Reflect.has(docsList, scope) ? docsList[scope].push(message) : docsList[scope] = [message]
        break
      case 'perf':
        Reflect.has(perfList, scope) ? perfList[scope].push(message) : perfList[scope] = [message]
        break
      case 'breaking':
      case 'break':
        Reflect.has(breakingList, scope) ? breakingList[scope].push(message) : breakingList[scope] = [message]
        break
      default:
        Reflect.has(otherList, scope) ? otherList[scope].push(message) : otherList[scope] = [message]
    }
  })

  return [
    renderChangelog('### 🚨 Breaking Changes', breakingList),
    renderChangelog('### 🚀 Features', featList),
    renderChangelog('### 🐞 Bug Fixes', fixList),
    renderChangelog('### 📈 Performance', perfList),
    renderChangelog('### 📝 Documentation', docsList),
    renderChangelog('### 🚧 Others', otherList),
  ].filter(n => n).join('\n')
}
function renderChangelog(heading: string, changelogs: Record<string, string[]>) {
  let content = ''
  const keys = Object.keys(changelogs).sort()
  if (!keys.length) {
    return ''
  }
  content += `${heading}\n`
  keys.forEach((key) => {
    if (key && changelogs[key].length > 1) {
      content += `- ${pascalCase(key)}: \n`
      changelogs[key].forEach((log) => {
        content += `  - ${log}\n`
      })
    }
    else {
      changelogs[key].forEach((log) => {
        content += '-'
        content += key ? ` ${pascalCase(key)}:` : ''
        content += ` ${log}\n`
      })
    }
  })
  return content
}

export function getPullRequestNumber() {
  if (context.eventName === 'pull_request') {
    return Number(context.payload.number)
  }
  if (context.eventName === 'issue_comment' && context.payload.issue?.pull_request) {
    return Number(context.payload.issue.number)
  }
  return 0
}

export function getPullRequestBody() {
  let body = ''
  if (context.eventName === 'pull_request') {
    body = context.payload.pull_request?.body || ''
  }
  if (context.eventName === 'issue_comment' && context.payload.issue?.pull_request) {
    body = context.payload.comment?.body || ''
  }
  return body
}
