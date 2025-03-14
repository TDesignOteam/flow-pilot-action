import type { Tokens } from 'marked'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMarkdown, renderChangelog, renderPackages } from '../src/utils'

describe('utils', () => {
  it('parseMarkdown', () => {
    const list = parseMarkdown('### 📝 更新日志')
    const data = list[0] as Tokens.Heading
    expect(list.length).toBe(1)
    expect(data.type).toBe('heading')
    expect(data.depth).toBe(3)
    expect(data.text).toBe('📝 更新日志')
  })

  it('renderPackages', () => {
    const packages = renderPackages('fixtures/repo1')
    expect(packages.length).toBe(2)
    expect(packages[0].relativeDir).toBe('packages/pkg-a')
    expect(packages[1].relativeDir).toBe('packages/pkg-c')
  })

  describe('renderChangelog', () => {
    it('repo1 pkg-b是私有包，不收集日志', () => {
      const packages = renderPackages('fixtures/repo1')
      expect(packages.length).toBe(2)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-c')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = renderChangelog(body, packages.map(pkg => pkg.packageJson.name))
      expect(log).toMatchSnapshot()
    })
    it('repo2 无私有包', () => {
      const packages = renderPackages('fixtures/repo2')
      expect(packages.length).toBe(3)
      expect(packages[0].relativeDir).toBe('packages/pkg-a')
      expect(packages[1].relativeDir).toBe('packages/pkg-b')
      expect(packages[2].relativeDir).toBe('packages/pkg-c')
      const body = readFileSync('fixtures/pull_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
      const log = renderChangelog(body, packages.map(pkg => pkg.packageJson.name))
      expect(log).toMatchSnapshot()
    })
    it('本条 PR 不需要纳入 Changelog', () => {
      const packages = renderPackages('fixtures/repo1')

      const body = readFileSync('fixtures/pull_request_body/pr_body2.md', 'utf8').replaceAll('\n', '\r\n')
      const log = renderChangelog(body, packages.map(pkg => pkg.packageJson.name))
      expect(log).toBe(null)
    })
  })
})
