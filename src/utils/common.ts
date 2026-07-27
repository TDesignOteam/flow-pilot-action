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
import { getPackages, getSinglePackage } from './get-packages'
import useGithub from './github'

export { getPackages, getSinglePackage }

export function getMode(): 'single' | 'monorepo' {
  return core.getInput('mode', { trimWhitespace: true }) === 'single' ? 'single' : 'monorepo'
}

export function isSingleMode(): boolean {
  return getMode() === 'single'
}

function getEnglishChangelogPath(path: string): string {
  return path.endsWith('.md') ? path.replace(/\.md$/, '.en-US.md') : `${path}.en-US.md`
}

export function getChangelogFilePath(release: ReleasePackage, lang: 'zh' | 'en'): string {
  const customPath = core.getInput('changelog-path', { trimWhitespace: true })
  if (customPath) {
    if (lang === 'en') {
      return getEnglishChangelogPath(customPath)
    }
    return customPath
  }
  const fileName = lang === 'en' ? 'CHANGELOG.en-US.md' : 'CHANGELOG.md'
  return `${release.dir}/${fileName}`
}

const USE_PASCAL_CASE_REG = /^Use(?=[A-Z])/
const RN_TO_LF_REG = /\r\n/g
const COMMON_PR_REG = /\[common#\d+\]/
const CONTRIBUTOR_WITH_SPACE_REG = /@.*\s$/
const GITHUB_COMMENT_MAX_LENGTH = 65536
type ReleaseHeading = '🎉 Release' | '🎉 发布'

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
  return extractReleaseLogs(markdown)[0] || { pkgName: '', changelog: '' }
}

/**
 * 提取单条或合并后的 release 日志
 */
export function extractReleaseLogs(markdown: string, expectedHeading?: ReleaseHeading) {
  const releaseLogs: Array<{ pkgName: string, changelog: string }> = []
  let currentLog: { pkgName: string, changelog: string } | undefined

  parseMarkdown(markdown.replace(RN_TO_LF_REG, '\n')).forEach((token) => {
    if (token.type === 'heading') {
      const heading: ReleaseHeading | undefined = token.text.startsWith('🎉 Release')
        ? '🎉 Release'
        : token.text.startsWith('🎉 发布')
          ? '🎉 发布'
          : undefined
      if (heading && token.depth !== 1) {
        throw new Error(`Release package heading must be level 1: ${token.raw.trim()}`)
      }
      if (heading && expectedHeading && heading !== expectedHeading) {
        throw new Error('Release log contains mixed languages')
      }
      if (token.depth !== 1) {
        if (currentLog) {
          currentLog.changelog += `${token.raw.trimEnd()}\n\n`
        }
        return
      }

      const pkgName = heading ? token.text.replace(heading, '').trim() : ''
      if (heading && !pkgName) {
        throw new Error('Release package heading is missing a package name')
      }
      currentLog = pkgName ? { pkgName, changelog: '' } : undefined
      if (currentLog) {
        releaseLogs.push(currentLog)
      }
      return
    }

    if (currentLog && token.type === 'list') {
      currentLog.changelog += `${token.raw.trimEnd()}\n\n`
    }
  })

  return releaseLogs
}

export function buildReleaseComments(logHead: string, sections: string[], maxLength = GITHUB_COMMENT_MAX_LENGTH) {
  const separator = '\n\n---\n\n'
  const comments: string[] = []
  let body = logHead

  sections.forEach((section) => {
    const addition = body === logHead ? section : `${separator}${section}`
    if (body.length + addition.length <= maxLength) {
      body += addition
      return
    }
    if (body === logHead) {
      throw new Error('A release changelog section exceeds the GitHub comment length limit')
    }
    comments.push(body)
    body = `${logHead}${section}`
    if (body.length > maxLength) {
      throw new Error('A release changelog section exceeds the GitHub comment length limit')
    }
  })

  if (body !== logHead) {
    comments.push(body)
  }
  return comments
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
  const customChangelogPath = isSingleMode() ? core.getInput('changelog-path', { trimWhitespace: true }).replace(/^\.\//, '') : ''
  const customEnChangelogPath = customChangelogPath
    ? getEnglishChangelogPath(customChangelogPath)
    : ''
  const singleChangelogKey = '__single__'

  return prFiles.filter((file) => {
    const changelogKey = customChangelogPath ? singleChangelogKey : dirname(file.filename)
    const isZhChangelog = customChangelogPath ? file.filename === customChangelogPath : file.filename.includes('CHANGELOG.md')
    const isEnChangelog = customEnChangelogPath ? file.filename === customEnChangelogPath : file.filename.includes('CHANGELOG.en-US.md')

    if (isZhChangelog && file.patch) {
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
      zhChangelogs[changelogKey] = logs.join('\n')
    }

    if (isEnChangelog && file.patch) {
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
      enChangelogs[changelogKey] = logs.slice(1).join('\n')
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
    const { newVersion: version, oldVersion } = getChangedVersions(file.patch || '', type)
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
    const changelogKey = customChangelogPath ? singleChangelogKey : dirname(file.filename)
    let changelog = zhChangelogs[changelogKey] || ''
    if (changelog && enChangelogs[changelogKey]) {
      changelog = [...changelog, '\n---\n', enChangelogs[changelogKey]].join('')
    }
    return {
      dir: dirname(file.filename),
      name: packageData.name,
      private: type === 'node' ? packageData.private === true : packageData.publish_to === 'none',
      version,
      oldVersion: oldVersion as string,
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

/**
 * 从 PR body 提取「基于 tag 区间」的发布日志(单仓扁平格式):
 * 直接贴在 `### 📝 更新日志` 标题下的列表(无 `#### package` 分段),
 * 以及 `#### all` / `#### <pkgName>` 分段。返回纯日志条目(不含 `- ` 前缀)。
 */
function extractTagChangelogLogs(markdown: string, pkgNames: string[]): string[] {
  const md = parseMarkdown(markdown)
  const changelogHeading = getChangelogHeading()
  const pkgDepth = changelogHeading.depth + 1
  let collectLogs = false
  let pkgName = ''
  const logs: string[] = []

  md.forEach((token) => {
    if (token.type === changelogHeading.type && token.depth === changelogHeading.depth) {
      collectLogs = token.text === changelogHeading.text
      pkgName = ''
      return
    }
    if (!collectLogs) {
      return
    }
    if (token.type === 'heading') {
      if (token.depth === pkgDepth) {
        pkgName = token.text
      }
      else {
        // 离开更新日志区块
        collectLogs = false
      }
      return
    }
    if (token.type === 'list') {
      const items = token.items as Tokens.ListItem[]
      if (pkgName === 'all' || pkgNames.includes(pkgName) || pkgName === '') {
        const targetCount = pkgName === 'all' ? pkgNames.length : 1
        items.forEach((item) => {
          if (item.type === 'list_item' && item.tokens.length) {
            const text = (item.tokens[0] as Tokens.Text).text
            for (let i = 0; i < targetCount; i++) {
              logs.push(text)
            }
          }
        })
      }
    }
  })
  return logs
}

/**
 * 基于两个 tag(或 ref)之间已合并 PR 的 body 生成发布日志(单仓)。
 * fromRef 为空时扫描 toRef 的全部历史。
 */
export async function getTagChangelog(token: string, pkgNames: string[], fromRef: string | undefined, toRef: string): Promise<string> {
  const { getMergedPrNumbersBetweenRefs, getPullRequestData } = useGithub(token)
  const prNumbers = await getMergedPrNumbersBetweenRefs(fromRef, toRef)
  const logs: string[] = []
  let failedPullRequests = 0

  for (const prNumber of prNumbers) {
    try {
      const prData = await getPullRequestData(prNumber)
      if (!isExtractPRLog(prData)) {
        continue
      }
      const prLogs = extractTagChangelogLogs(prData.body || '', pkgNames)
      prLogs.forEach((log) => {
        const contributor = prData.user.login === 'tdesign-bot' || CONTRIBUTOR_WITH_SPACE_REG.test(log) ? '' : ` @${prData.user.login}`
        const prLink = COMMON_PR_REG.test(log) ? '' : ` ([#${prNumber}](${prData.html_url}))`
        logs.push(`- ${log}${contributor}${prLink}`)
      })
    }
    catch (error) {
      failedPullRequests++
      core.warning(`getTagChangelog: 跳过 PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  core.info(`getTagChangelog: 扫描 ${prNumbers.length} 个 PR,生成 ${logs.length} 条日志`)
  if (failedPullRequests)
    core.warning(`getTagChangelog: ${failedPullRequests} 个 PR 查询失败,发布日志可能不完整`)

  return renderChangelogMarkdown(logs)
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
  if (isSingleMode()) {
    const manifestPath = core.getInput('package-json-path', { trimWhitespace: true }) || resolve(path, 'package.json')
    return [getSinglePackage(path, manifestPath)]
  }
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
