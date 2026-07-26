import type { ReleasePackage } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pull_request } from '../src/github-event/pull-request'

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  checkoutBranch: vi.fn(),
  checkoutCommit: vi.fn(),
  cloneRepo: vi.fn(),
  createRelease: vi.fn(),
  getInput: vi.fn((name: string) => name === 'mode' ? 'single' : ''),
  getPullRequestFiles: vi.fn(),
  getPullRequestReleaseDirs: vi.fn(),
  getTagChangelog: vi.fn(),
  publishRelease: vi.fn(),
  context: {
    eventName: 'pull_request',
    payload: {} as any,
  },
}))

vi.mock('@actions/core', () => ({
  getInput: mocks.getInput,
  info: vi.fn(),
  setOutput: vi.fn(),
}))
vi.mock('@actions/github', () => ({ context: mocks.context }))
vi.mock('../src/utils', () => ({
  buildReleaseComments: (head: string, sections: string[]) => sections.map(section => `${head}${section}`),
  extractChangelog: vi.fn(),
  getConfiguredPackages: () => [{ name: 'pkg-a' }],
  getInputPkgs: () => [],
  getPullRequestNumber: () => 42,
  getPullRequestReleaseDirs: mocks.getPullRequestReleaseDirs,
  getStashChangelog: vi.fn(),
  getTagChangelog: mocks.getTagChangelog,
  isSingleMode: () => true,
  publishRelease: mocks.publishRelease,
  renderChangelogMarkdown: vi.fn(),
  sortReleasePackages: (releases: ReleasePackage[]) => releases,
}))
vi.mock('../src/utils/git', () => ({
  default: () => ({
    checkoutBranch: mocks.checkoutBranch,
    checkoutCommit: mocks.checkoutCommit,
    cloneRepo: mocks.cloneRepo,
  }),
}))
vi.mock('../src/utils/github', () => ({
  default: () => ({
    addComment: mocks.addComment,
    createRelease: mocks.createRelease,
    getPullRequestFiles: mocks.getPullRequestFiles,
  }),
}))
vi.mock('../src/utils/translate', () => ({ translateText: vi.fn() }))

const baseRelease: ReleasePackage = {
  dir: '.',
  name: 'pkg-a',
  version: '1.1.0',
  oldVersion: '1.0.0',
  type: 'node',
  private: false,
  tag: 'latest',
  changelog: '',
}

function pullRequestPayload(action: 'opened' | 'closed') {
  return {
    action,
    number: 42,
    pull_request: {
      base: { ref: 'main', repo: { full_name: 'owner/repo' } },
      head: { ref: 'release/1.1.0', repo: { full_name: 'owner/repo' } },
      merge_commit_sha: action === 'closed' ? 'merge-sha' : undefined,
      merged: action === 'closed',
    },
  }
}

describe('pull_request single mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.eventName = 'pull_request'
    mocks.context.payload = pullRequestPayload('opened')
    mocks.getPullRequestFiles.mockResolvedValue([])
    mocks.getPullRequestReleaseDirs.mockReturnValue([baseRelease])
    mocks.getTagChangelog.mockResolvedValue('### 🚀 Features\n')
  })

  it('uses the previous version as the default changelog tag', async () => {
    await pull_request('token')

    expect(mocks.getTagChangelog).toHaveBeenCalledWith('token', ['pkg-a'], '1.0.0', 'main')
  })

  it('creates a prerelease with a plain version tag', async () => {
    mocks.context.payload = pullRequestPayload('closed')
    mocks.getPullRequestReleaseDirs.mockReturnValue([{
      ...baseRelease,
      version: '1.1.0-beta.1',
      tag: 'beta',
    }])

    await pull_request('token')

    expect(mocks.createRelease).toHaveBeenCalledWith(
      '1.1.0-beta.1',
      '1.1.0-beta.1',
      '',
      'merge-sha',
      true,
    )
  })
})
