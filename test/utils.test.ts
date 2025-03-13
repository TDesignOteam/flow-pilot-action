import type { Tokens } from 'marked'
import { describe, expect, it } from 'vitest'
import { parseMarkdown, renderPackages } from '../src/utils'

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
})
