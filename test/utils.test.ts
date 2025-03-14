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

  it('renderChangelog', () => {
    const packages = renderPackages('fixtures/repo2')
    expect(packages.length).toBe(3)
    expect(packages[0].relativeDir).toBe('packages/pkg-a')
    expect(packages[1].relativeDir).toBe('packages/pkg-b')
    expect(packages[2].relativeDir).toBe('packages/pkg-c')
    const body = readFileSync('fixtures/pulll_request_body/pr_body1.md', 'utf8').replaceAll('\n', '\r\n')
    const log = renderChangelog(body, packages.map(pkg => pkg.packageJson.name))
    expect(log).toMatchSnapshot()
  })
})
