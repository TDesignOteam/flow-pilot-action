import type { Tokens } from 'marked'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../src/utils'

describe('utils', () => {
  it('parseMarkdown', () => {
    const list = parseMarkdown('### 📝 更新日志')
    const data = list[0] as Tokens.Heading
    expect(list.length).toBe(1)
    expect(data.type).toBe('heading')
    expect(data.depth).toBe(3)
    expect(data.text).toBe('📝 更新日志')
  })
})
