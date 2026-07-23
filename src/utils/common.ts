import type { Tokens, TokensList } from 'marked'
import type { PackagesChangelog, PackageType, PullRequestData, PullRequestFiles, ReleasePackage } from '../types'
import type { Package } from './get-packages'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import camelcase from 'camelcase'
import { marked } from 'marked'
import { globSync } from 'tinyglobby'
import { parse } from 'yaml'
import { CHANGELOG_REG, NEW_VERSION_REG, OLD_VERSION_REG, SKIP_CHANGELOG_REG } from '../consts'
import { getPackages } from './get-packages'

export { getPackages }

const USE_PASCAL_CASE_REG = /^Use(?=[A-Z])/
const RN_TO_LF_REG = /\r\n/g
const COMMON_PR_REG = /\[common#\d+\]/
const CONTRIBUTOR_WITH_SPACE_REG = /@.*\s$/

export function pascalCase(str: string) {
  if (str.toLowerCase() === 'qrcode') {
    return 'QRCode'
  }
  const pascalCaseStr = camelcase(str, { pascalCase: true })
  if (pascalCaseStr.startsWith('Use')) {
    return pascalCaseStr.replace(USE_PASCAL_CASE_REG, 'use')
  }
  return pascalCaseStr
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

  if (prData.labels.some(label => label.name === 'skip-changelog')) {
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

/**
 * 提取 PR 日志
 */
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
    if (collectLogs && token.type === 'list' && (pkgName === 'all' || pkgNames.includes(pkgName))) {
      const items = token.items as Tokens.ListItem[]
      items.forEach((item) => {
        if (item.type === 'list_item' && item.tokens.length) {
          const token = item.tokens[0] as Tokens.Text
          const targetPkgNames = pkgName === 'all' ? pkgNames : [pkgName]
          targetPkgNames.forEach(name => pkgLogs[name].push(token.text))
        }
      })
    }
  })
  return pkgLogs
}

/**
 * 提取 release 日志
 */
export function extractReleaseLog(markdown: string) {
  const md = parseMarkdown(markdown.replace(RN_TO_LF_REG, '\n'))
  let collectLogs = false
  let pkgName = ''
  const changelog: string[] = []
  md.forEach((token) => {
    if (token.type === 'heading' && token.depth === 1) {
      if (token.text.startsWith('🎉 Release')) {
        pkgName = token.text.replace('🎉 Release', '').trim()
        collectLogs = true
      }
      else if (token.text.startsWith('🎉 发布')) {
        pkgName = token.text.replace('🎉 发布', '').trim()
        collectLogs = true
      }
      else {
        collectLogs = false
      }
    }
    if (collectLogs) {
      if (token.type === 'heading' && token.depth > 1) {
        changelog.push(`${token.raw.trimEnd()}\n\n`)
      }
      if (token.type === 'list') {
        changelog.push(`${token.raw.trimEnd()}\n\n`)
      }
    }
  })
  return { pkgName, changelog: changelog.join('') }
}

/**
 * 提取合并后的 release 日志（多条日志通过 --- 分隔）
 */
export function extractReleaseLogs(markdown: string) {
  // 先统一换行符再分割
  const normalized = markdown.replace(RN_TO_LF_REG, '\n')
  const sections = normalized.split('\n\n---\n\n')
  return sections.map(section => extractReleaseLog(section)).filter(item => item.pkgName)
}

export function stashPackageChangelog(prData: PullRequestData, packages: Package[], prChangelog: PackagesChangelog) {
  packages.forEach((pkg) => {
    const changelogData = prChangelog[pkg.name]
    if (!changelogData)
      return

    const changelogDir = `${pkg.dir}/.changelog`
    if (!existsSync(changelogDir)) {
      mkdirSync(changelogDir, { recursive: true })
    }

    const logs = changelogData
      .map((log) => {
        const contributor = prData.user.login === 'tdesign-bot' || CONTRIBUTOR_WITH_SPACE_REG.test(log) ? '' : ` @${prData.user.login}`
        const prLink = COMMON_PR_REG.test(log) ? '' : ` ([#${prData.number}](${prData.html_url}))`
        return `- ${log}${contributor}${prLink}`
      })
      .filter(Boolean)
      .join('\n')

    const logFilePath = `${changelogDir}/pr-${prData.number}.md`
    const skipChangelog = !isExtractPRLog(prData)
    if (!logs || skipChangelog) {
      if (existsSync(logFilePath)) {
        unlinkSync(logFilePath)
      }
      return
    }
    const logHead = [
      '---',
      `pr_number: ${prData.number}`,
      `contributor: ${prData.user.login}`,
      '---',
      '\n',
    ].join('\n')
    const logContent = `${logHead}${logs}\n`

    core.info(`Attempting to write to ${logFilePath}`)
    try {
      writeFileSync(logFilePath, logContent, 'utf8')
      core.info(`Successfully wrote changelog to ${logFilePath}`)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.info(`Failed to write changelog to ${logFilePath}: ${message}`)
    }
  })
}

function getManifestType(filename: string): PackageType | undefined {
  const manifestName = basename(filename)
  if (manifestName === 'package.json')
    return 'node'
  if (manifestName === 'pubspec.yaml')
    return 'flutter'
}

function getPubspecVersion(patch: string, marker: '+' | '-') {
  for (const line of patch.split('\n')) {
    if (!line.startsWith(marker) || !/^version\s*:/.test(line.slice(1)))
      continue

    const data = parse(line.slice(1))
    if (data && typeof data === 'object' && 'version' in data && (typeof data.version === 'string' || typeof data.version === 'number'))
      return String(data.version)
  }
}

function getChangedVersions(patch: string, type: PackageType) {
  if (type === 'node') {
    return {
      oldVersion: patch.match(OLD_VERSION_REG)?.[1],
      newVersion: patch.match(NEW_VERSION_REG)?.[1],
    }
  }

  return {
    oldVersion: getPubspecVersion(patch, '-'),
    newVersion: getPubspecVersion(patch, '+'),
  }
}

function readPackageManifest(path: string, type: PackageType): Record<string, unknown> {
  const content = readFileSync(path, 'utf8')
  const data = type === 'node' ? JSON.parse(content) : parse(content)
  if (!data || typeof data !== 'object')
    throw new Error(`Package manifest "${path}" must contain an object`)
  return data
}

export function getPullRequestReleaseDirs(prFiles: PullRequestFiles, packages?: Package[]): ReleasePackage[] {
  const zhChangelogs: Record<string, string> = {}
  const enChangelogs: Record<string, string> = {}

  return prFiles.filter((file) => {
    if (file.filename.includes('CHANGELOG.md') && file.patch) {
      const logs: string[] = []
      let isSkip = false
      let hasNewReleaseLog = false
      file.patch.split('\n').forEach((item) => {
        if (isSkip)
          return
        if (item.startsWith('+')) {
          const log = item.slice(1)
          if (hasNewReleaseLog && log.includes('## 🌈')) {
            isSkip = true
            return
          }
          if (log.includes('## 🌈')) {
            hasNewReleaseLog = true
          }
          logs.push(log.trimEnd())
        }
      })
      zhChangelogs[dirname(file.filename)] = logs.join('\n')
    }

    if (file.filename.includes('CHANGELOG.en-US.md') && file.patch) {
      const logs: string[] = []
      let isSkip = false
      let hasNewReleaseLog = false
      file.patch.split('\n').forEach((item) => {
        if (isSkip)
          return
        if (item.startsWith('+')) {
          const log = item.slice(1)
          if (hasNewReleaseLog && log.includes('## 🌈')) {
            isSkip = true
            return
          }
          if (log.includes('## 🌈')) {
            hasNewReleaseLog = true
          }
          logs.push(log.trimEnd())
        }
      })
      enChangelogs[dirname(file.filename)] = logs.slice(1).join('\n')
    }

    if (file.status !== 'modified') {
      return false
    }
    const type = getManifestType(file.filename)
    if (!type) {
      return false
    }
    if (packages && !packages.some(pkg => pkg.type === type && pkg.dir === resolve(dirname(file.filename)))) {
      return false
    }
    if (!file.patch) {
      throw new Error(`Cannot determine version changes because the patch for "${file.filename}" is unavailable`)
    }
    if (!file.patch.includes('version')) {
      return false
    }
    const { newVersion, oldVersion } = getChangedVersions(file.patch, type)
    if (!newVersion || !oldVersion) {
      return false
    }
    if (newVersion === oldVersion) {
      return false
    }

    return true
  }).map((file) => {
    const type = getManifestType(file.filename) as PackageType
    const packageData = readPackageManifest(file.filename, type)
    const version = getChangedVersions(file.patch || '', type).newVersion as string
    if (typeof packageData.name !== 'string')
      throw new Error(`Package manifest "${file.filename}" is missing a valid "name" field`)
    if (typeof packageData.version !== 'string' && typeof packageData.version !== 'number')
      throw new Error(`Package manifest "${file.filename}" is missing a valid "version" field`)
    if (String(packageData.version) !== version)
      throw new Error(`Package manifest "${file.filename}" has version "${packageData.version}", expected "${version}" from the pull request diff`)

    let tag = 'latest'
    if (version.includes('beta')) {
      tag = 'beta'
    }
    if (version.includes('alpha')) {
      tag = 'alpha'
    }
    let changelog = zhChangelogs[dirname(file.filename)] || ''
    if (changelog && enChangelogs[dirname(file.filename)]) {
      changelog = [...changelog, '\n---\n', enChangelogs[dirname(file.filename)]].join('')
    }
    return {
      dir: dirname(file.filename),
      name: packageData.name,
      private: type === 'node' ? packageData.private === true : packageData.publish_to === 'none',
      version,
      type,
      tag,
      changelog,
    }
  })
}

export function getStashChangelog(path: string, type: PackageType) {
  const files = globSync(`${path}/.changelog/*.md`)
  const manifestPath = `${path}/${type === 'node' ? 'package.json' : 'pubspec.yaml'}`
  const manifest = readPackageManifest(manifestPath, type)
  if (typeof manifest.name !== 'string')
    throw new Error(`Package manifest "${manifestPath}" is missing a valid "name" field`)
  if (typeof manifest.version !== 'string' && typeof manifest.version !== 'number')
    throw new Error(`Package manifest "${manifestPath}" is missing a valid "version" field`)
  const changelogs: string[] = []
  files.forEach((file) => {
    readFileSync(file, 'utf8').split('\n').forEach((line) => {
      if (line && line.startsWith('- ')) {
        changelogs.push(line)
      }
    },
    )
  })
  return { pkg: manifest.name, version: String(manifest.version), changelogs }
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
    const scope = pascalCase(log.match(CHANGELOG_REG)?.[2] || '')
    const message = log.match(CHANGELOG_REG)?.[3] || ''
    if (!message) {
      return
    }

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
      case 'refactor':
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
  content += `${heading}\n\n`
  keys.forEach((key) => {
    if (key && changelogs[key].length > 1) {
      content += `- \`${key}\`: \n`
      changelogs[key].forEach((log) => {
        content += `  - ${log}\n`
      })
    }
    else {
      changelogs[key].forEach((log) => {
        content += '-'
        content += key ? ` \`${key}\`:` : ''
        content += ` ${log}\n`
      })
    }
  })
  return content
}

export function getPullRequestNumber() {
  if (github.context.eventName === 'pull_request') {
    return Number(github.context.payload.number)
  }
  if (github.context.eventName === 'pull_request_review') {
    return Number(github.context.payload.pull_request?.number)
  }
  if (github.context.eventName === 'issue_comment' && github.context.payload.issue?.pull_request) {
    return Number(github.context.payload.issue.number)
  }
  return 0
}

export function getPullRequestBody() {
  let body = ''
  if (github.context.eventName === 'pull_request') {
    body = github.context.payload.pull_request?.body || ''
  }
  if (github.context.eventName === 'issue_comment' && github.context.payload.issue?.pull_request) {
    body = github.context.payload.comment?.body || ''
  }
  return body
}

export function saveReleaseLog(path: string, log: string) {
  if (!existsSync(path)) {
    writeFileSync(path, log, 'utf8')
  }
}

export async function getPrCommentWhitelist() {
  const response = await fetch('https://raw.githubusercontent.com/Tencent/tdesign/refs/heads/main/.github/.pr-comment-ci-whitelist')
  const whitelist = await response.text()
  return whitelist.split('\n')
}

export function getInputPkgs() {
  return core.getMultilineInput('packages', { trimWhitespace: true })
    .flatMap(line => line.split(','))
    .map(pkg => pkg.trim())
    .filter(Boolean)
}

export function getConfiguredPackages(path: string) {
  const packageNames = getInputPkgs()
  const packages = getPackages(path)
  return packageNames.length ? packages.filter(pkg => packageNames.includes(pkg.name)) : packages
}

export function checkReleaseBranch(prData: PullRequestData) {
  return prData.head.ref.startsWith('release/')
}
export function checkIsForkPr(prData: PullRequestData) {
  return prData.head.user.login !== github.context.repo.owner
}
