import type { PullRequestData } from '../../src/types'
import { describe, expect, it, vi } from 'vitest'

import { getTagChangelog } from '../../src/utils/common'

const mocks = vi.hoisted(() => ({
  getMergedPrNumbersBetweenRefs: vi.fn(),
  getPullRequestData: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  info: mocks.info,
  warning: mocks.warning,
}))

vi.mock('../../src/utils/github', () => ({
  default: () => ({
    getMergedPrNumbersBetweenRefs: mocks.getMergedPrNumbersBetweenRefs,
    getPullRequestData: mocks.getPullRequestData,
  }),
}))

function prData(overrides: Partial<PullRequestData> = {}): PullRequestData {
  return {
    number: 1,
    title: 'Default pull request title',
    html_url: 'https://github.com/owner/repo/pull/1',
    user: { login: 'alice', type: 'User' } as any,
    head: { ref: 'feat/a' } as any,
    labels: [],
    body: '',
    ...overrides,
  } as PullRequestData
}

describe('getTagChangelog', () => {
  it('collects flat changelog from merged PRs and renders grouped markdown', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([1, 2])
    mocks.getPullRequestData.mockImplementation(async (n: number) => {
      if (n === 1) {
        return prData({
          number: 1,
          html_url: 'https://github.com/owner/repo/pull/1',
          body: '### 📝 更新日志\n\n- fix(aa): aa',
        })
      }
      return prData({
        number: 2,
        html_url: 'https://github.com/owner/repo/pull/2',
        body: '### 📝 更新日志\n\n- feat(bb): bb',
      })
    })

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toContain('### 🐞 Bug Fixes')
    expect(md).toContain('- `Aa`: aa @alice ([#1](https://github.com/owner/repo/pull/1))')
    expect(md).toContain('### 🚀 Features')
    expect(md).toContain('- `Bb`: bb @alice ([#2](https://github.com/owner/repo/pull/2))')
  })

  it('skips Bot and skip-changelog PRs', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([1, 2, 3])
    mocks.getPullRequestData.mockImplementation(async (n: number) => {
      if (n === 1) {
        return prData({ number: 1, user: { login: 'bot', type: 'Bot' } as any, body: '### 📝 更新日志\n\n- fix(x): x' })
      }
      if (n === 2) {
        return prData({ number: 2, labels: [{ name: 'skip-changelog' }] as any, body: '### 📝 更新日志\n\n- fix(y): y' })
      }
      return prData({ number: 3, html_url: 'https://github.com/owner/repo/pull/3', body: '### 📝 更新日志\n\n- feat(z): z' })
    })

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).not.toContain('`X`')
    expect(md).not.toContain('`Y`')
    expect(md).toContain('- `Z`: z @alice ([#3](https://github.com/owner/repo/pull/3))')
  })

  it('also collects #### all / #### pkgName sections and tolerates getPullRequestData failure', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([4, 5])
    mocks.getPullRequestData.mockImplementation(async (n: number) => {
      if (n === 4)
        throw new Error('not found')
      return prData({
        number: 5,
        html_url: 'https://github.com/owner/repo/pull/5',
        body: '### 📝 更新日志\n\n#### all\n- docs(cc): cc\n#### pkg-a\n- perf(dd): dd',
      })
    })

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toContain('- `Cc`: cc @alice ([#5]')
    expect(md).toContain('- `Dd`: dd @alice ([#5]')
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('跳过 PR #4'))
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('1 个 PR 查询失败'))
  })

  it('uses a conventional PR title when the body has no changelog', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([6])
    mocks.getPullRequestData.mockResolvedValue(prData({
      number: 6,
      title: 'fix(Button): correct loading state',
      html_url: 'https://github.com/owner/repo/pull/6',
      body: '',
    }))

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toContain('### 🐞 Bug Fixes')
    expect(md).toContain('- `Button`: correct loading state @alice ([#6]')
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('使用 PR 标题'))
  })

  it('puts a non-conventional title in Others when the template is left unchecked', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([7])
    mocks.getPullRequestData.mockResolvedValue(prData({
      number: 7,
      title: 'Improve loading behavior',
      html_url: 'https://github.com/owner/repo/pull/7',
      body: '### 📝 更新日志\n\n- [ ] 本条 PR 不需要纳入 Changelog',
    }))

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toContain('### 🚧 Others')
    expect(md).toContain('- Improve loading behavior @alice ([#7]')
    expect(md).not.toContain('本条 PR 不需要纳入 Changelog')
  })

  it('prefers a valid body changelog over the PR title', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([8])
    mocks.getPullRequestData.mockResolvedValue(prData({
      number: 8,
      title: 'fix(Title): title fallback',
      body: '### 📝 更新日志\n\n- feat(Body): body changelog',
    }))

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toContain('- `Body`: body changelog')
    expect(md).not.toContain('title fallback')
  })

  it('does not use the title when the PR explicitly skips changelog', async () => {
    mocks.getMergedPrNumbersBetweenRefs.mockResolvedValue([9])
    mocks.getPullRequestData.mockResolvedValue(prData({
      number: 9,
      title: 'fix(Button): should not appear',
      body: '### 📝 更新日志\n\n- [x] 本条 PR 不需要纳入 Changelog',
    }))

    const md = await getTagChangelog('token', ['pkg-a'], '1.0.0', 'main')

    expect(md).toBe('')
  })
})
