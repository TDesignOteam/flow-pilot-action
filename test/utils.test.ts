import type { Tokens } from 'marked'
import type { PullRequestData } from '../src/types'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pull_request_data } from '../fixtures/pull_request_data'
import { extractChangelog, getPackages, isExtractPRLog, parseMarkdown, stashPrChangelog } from '../src/utils'

describe('utils', () => {
  it('parseMarkdown', () => {
    const list = parseMarkdown('### 📝 更新日志')
    const data = list[0] as Tokens.Heading
    expect(list.length).toBe(1)
    expect(data.type).toBe('heading')
    expect(data.depth).toBe(3)
    expect(data.text).toBe('📝 更新日志')
  })

  it('getPackages', () => {
    const packages = getPackages('fixtures/repo1')
    expect(packages.length).toBe(2)
    expect(packages[0].packageJson.name).toBe('pkg-a')
    expect(packages[0].relativeDir).toBe('packages/pkg-a')
    expect(packages[1].packageJson.name).toBe('pkg-c')
    expect(packages[1].relativeDir).toBe('packages/pkg-c')
  })
  describe('isExtractPRLog', () => {
    it('labels 包含 skip-changelog', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.labels = [{
        id: 1,
        node_id: '123',
        name: 'skip-changelog',
        url: 'q3',
        color: '123',
        default: true,
        description: '123',
      }]
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('发布版本PR，release/ 开头', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.head.ref = 'release/1.0.0'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('pr body 申明不纳入 Changelog', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.body = '### 📝 更新日志 \n\n - [x] 本条 PR 不需要纳入 Changelog'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('pr user type 是 Bot', () => {
      const prData: PullRequestData = JSON.parse(JSON.stringify(pull_request_data))
      prData.user.type = 'Bot'
      expect(isExtractPRLog(prData)).toBe(false)
    })
    it('正常PR 数据', () => {
      expect(isExtractPRLog(pull_request_data)).toBe(true)
    })
  })

  describe('extractChangelog', () => {
    it('repo1 pkg-b是私有包，不收集日志', () => {
      const packages = getPackages('fixtures/repo1')
      expect(packages.length).toBe(2)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-c')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.packageJson.name))
      expect(log).toMatchSnapshot()
    })

    it('repo2 无私有包', () => {
      const packages = getPackages('fixtures/repo2')
      expect(packages.length).toBe(3)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-b')
      expect(packages[2].relativeDir).toBe('packages/pkg-c')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = extractChangelog(body, packages.map(pkg => pkg.packageJson.name))
      expect(log).toMatchSnapshot()
    })

    // it('本条 PR 不需要纳入 Changelog', () => {
    //   const packages = getPackages('fixtures/repo1')

    //   const body = readFileSync('fixtures/pull_request_body/pr_body2.md', 'utf8').replaceAll('\n', '\r\n')
    //   const log = extractChangelog(body, packages.map(pkg => pkg.packageJson.name))
    //   expect(log).toBe(null)
    // })
  })

  it('stashPullRequestChangelog', () => {
    const packages = getPackages('fixtures/repo2')
    const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
    const log = extractChangelog(body, packages.map(pkg => pkg.packageJson.name))
    stashPrChangelog(pull_request_data, packages, log)
    packages.forEach((pkg) => {
      const text = readFileSync(`${pkg.dir}/.changelog/pr-${pull_request_data.number}.md`, 'utf8')
      expect(text).toMatchSnapshot()
    })
  })
})
