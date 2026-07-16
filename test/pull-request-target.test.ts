import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pull_request_target } from '../src/github-event/pull-request-target'

const mocks = vi.hoisted(() => ({
  checkoutCommit: vi.fn(),
  createRelease: vi.fn(),
  getPullRequestData: vi.fn(),
  getPullRequestFiles: vi.fn(),
  publishRelease: vi.fn(),
}))

vi.mock('@actions/core', () => ({ info: vi.fn() }))
vi.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request_target',
    payload: { action: 'closed', pull_request: { merged: true } },
  },
}))
vi.mock('../src/utils', () => ({
  checkReleaseBranch: () => true,
  getConfiguredPackages: () => [],
  getPullRequestNumber: () => 1,
  getPullRequestReleaseDirs: () => [{
    dir: 'packages/private-package',
    name: 'private-package',
    version: '1.0.0',
    type: 'flutter',
    private: true,
    tag: 'latest',
    changelog: 'release notes',
  }],
  publishRelease: mocks.publishRelease,
}))
vi.mock('../src/utils/git', () => ({
  default: () => ({ checkoutCommit: mocks.checkoutCommit }),
}))
vi.mock('../src/utils/github', () => ({
  default: () => ({
    createRelease: mocks.createRelease,
    getPullRequestData: mocks.getPullRequestData,
    getPullRequestFiles: mocks.getPullRequestFiles,
  }),
}))

describe('pull_request_target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPullRequestData.mockResolvedValue({
      head: { ref: 'release/1.0.0' },
      merge_commit_sha: 'merge-sha',
    })
    mocks.getPullRequestFiles.mockResolvedValue([])
  })

  it('creates a tag for a private package without publishing it to a registry', async () => {
    await pull_request_target('token')

    expect(mocks.checkoutCommit).toHaveBeenCalledWith('merge-sha')
    expect(mocks.publishRelease).not.toHaveBeenCalled()
    expect(mocks.createRelease).toHaveBeenCalledWith(
      'private-package@1.0.0',
      'private-package@1.0.0',
      'release notes',
      'merge-sha',
    )
  })
})
