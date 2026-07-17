import type { PullRequestData } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { issue_comment } from '../src/github-event/issue-comment'

interface IssueCommentPayload {
  action: string
  changes?: { body: { from: string } }
  comment: { body: string }
  issue: { number: number, pull_request?: Record<string, never> }
}

const mocks = vi.hoisted(() => ({
  addRemote: vi.fn(),
  checkoutBranch: vi.fn(),
  checkoutPr: vi.fn(),
  cloneRepo: vi.fn(),
  context: {
    actor: 'maintainer',
    eventName: 'issue_comment',
    payload: {
      action: 'created',
      comment: { body: '/changelog' },
      issue: { number: 42, pull_request: {} },
    } as IssueCommentPayload,
    repo: { owner: 'owner', repo: 'repo' },
  },
  exec: vi.fn(),
  extractChangelog: vi.fn(),
  getPrCommentWhitelist: vi.fn(),
  getPullRequestData: vi.fn(),
  isNeedCommit: vi.fn(),
  stashPackageChangelog: vi.fn(),
}))

vi.mock('@actions/core', () => ({ info: vi.fn() }))
vi.mock('@actions/exec', () => ({ exec: mocks.exec }))
vi.mock('@actions/github', () => ({ context: mocks.context }))
vi.mock('../src/utils/common', () => ({
  checkIsForkPr: () => false,
  extractChangelog: mocks.extractChangelog,
  extractReleaseLog: vi.fn(),
  getConfiguredPackages: () => [],
  getInputPkgs: () => ['pkg-a'],
  getPrCommentWhitelist: mocks.getPrCommentWhitelist,
  getPullRequestNumber: () => 42,
  getPullRequestReleaseDirs: vi.fn(),
  stashPackageChangelog: mocks.stashPackageChangelog,
}))
vi.mock('../src/utils/git', () => ({
  default: () => ({
    addRemote: mocks.addRemote,
    checkoutBranch: mocks.checkoutBranch,
    checkoutPr: mocks.checkoutPr,
    cloneRepo: mocks.cloneRepo,
    isNeedCommit: mocks.isNeedCommit,
  }),
}))
vi.mock('../src/utils/github', () => ({
  default: () => ({ getPullRequestData: mocks.getPullRequestData }),
}))

const prData = {
  body: '### 📝 更新日志\n\n#### pkg-a\n- feat(Button): add loading state',
  head: {
    ref: 'feat/loading',
    repo: { clone_url: 'https://github.com/owner/repo.git' },
    user: { login: 'owner' },
  },
  number: 42,
} as unknown as PullRequestData

describe('issue_comment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.actor = 'maintainer'
    mocks.context.eventName = 'issue_comment'
    mocks.context.payload = {
      action: 'created',
      comment: { body: '/changelog' },
      issue: { number: 42, pull_request: {} },
    }
    mocks.getPrCommentWhitelist.mockResolvedValue(['maintainer'])
    mocks.getPullRequestData.mockResolvedValue(prData)
    mocks.extractChangelog.mockReturnValue({ 'pkg-a': ['feat(Button): add loading state'] })
    mocks.isNeedCommit.mockResolvedValue(false)
  })

  it('submits the PR body changelog when /changelog is created', async () => {
    mocks.context.payload.comment.body = '  /changelog\n'

    await expect(issue_comment('token')).resolves.toBe(true)

    expect(mocks.getPullRequestData).toHaveBeenCalledWith(42)
    expect(mocks.extractChangelog).toHaveBeenNthCalledWith(1, prData.body, ['pkg-a'])
    expect(mocks.extractChangelog).toHaveBeenNthCalledWith(
      2,
      '### 📝 更新日志\n\n#### pkg-a\n- feat(Button): add loading state\n\n\n',
      ['pkg-a'],
    )
    expect(mocks.stashPackageChangelog).toHaveBeenCalledWith(
      prData,
      [],
      { 'pkg-a': ['feat(Button): add loading state'] },
    )
    expect(mocks.cloneRepo).toHaveBeenCalledOnce()
  })

  it('ignores unrelated created comments before loading the whitelist', async () => {
    mocks.context.payload.comment.body = '/approve'

    await expect(issue_comment('token')).resolves.toBe(false)

    expect(mocks.getPrCommentWhitelist).not.toHaveBeenCalled()
    expect(mocks.getPullRequestData).not.toHaveBeenCalled()
  })

  it('ignores comments on issues', async () => {
    mocks.context.payload.issue = { number: 42 }

    await expect(issue_comment('token')).resolves.toBe(false)

    expect(mocks.getPrCommentWhitelist).not.toHaveBeenCalled()
  })

  it('requires a whitelisted actor for /changelog', async () => {
    mocks.context.actor = 'contributor'

    await expect(issue_comment('token')).resolves.toBe(false)

    expect(mocks.getPullRequestData).not.toHaveBeenCalled()
    expect(mocks.cloneRepo).not.toHaveBeenCalled()
  })

  it('does not submit changelogs for release pull requests', async () => {
    mocks.getPullRequestData.mockResolvedValue({
      ...prData,
      head: { ...prData.head, ref: 'release/1.0.0' },
    })

    await expect(issue_comment('token')).resolves.toBe(false)

    expect(mocks.extractChangelog).not.toHaveBeenCalled()
    expect(mocks.cloneRepo).not.toHaveBeenCalled()
  })

  it('keeps processing edited changelog confirmations', async () => {
    mocks.context.payload = {
      action: 'edited',
      changes: { body: { from: 'old body' } },
      comment: { body: '### 📝 更新日志\n\n#### pkg-a\n- feat(Button): add loading state' },
      issue: { number: 42, pull_request: {} },
    }

    await issue_comment('token')

    expect(mocks.cloneRepo).toHaveBeenCalledOnce()
    expect(mocks.stashPackageChangelog).toHaveBeenCalledOnce()
  })
})
