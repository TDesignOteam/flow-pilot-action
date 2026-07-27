import { beforeEach, describe, expect, it, vi } from 'vitest'

import useGit from '../../src/utils/git'

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  getExecOutput: vi.fn(),
}))

vi.mock('@actions/exec', () => ({
  exec: mocks.exec,
  getExecOutput: mocks.getExecOutput,
}))
vi.mock('@actions/github', () => ({
  context: { repo: { owner: 'owner', repo: 'repo' } },
}))

describe('useGit getLatestTag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getExecOutput.mockResolvedValue({ exitCode: 0, stdout: '1.1.0\n' })
  })

  it('finds the nearest tag reachable from the target ref', async () => {
    const { getLatestTag } = useGit('token')

    await expect(getLatestTag('main')).resolves.toBe('1.1.0')
    expect(mocks.getExecOutput).toHaveBeenCalledWith(
      'git',
      ['describe', '--tags', '--abbrev=0', 'main'],
      { ignoreReturnCode: true },
    )
  })

  it('excludes alpha and beta tags for stable releases', async () => {
    const { getLatestTag } = useGit('token')

    await getLatestTag('release-candidate', true)

    expect(mocks.getExecOutput).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['--exclude', '*alpha*', '--exclude', '*beta*', 'release-candidate']),
      { ignoreReturnCode: true },
    )
  })

  it('returns undefined when the target history has no tag', async () => {
    mocks.getExecOutput.mockResolvedValue({ exitCode: 128, stdout: '' })
    const { getLatestTag } = useGit('token')

    await expect(getLatestTag('main')).resolves.toBeUndefined()
  })

  it('falls back to the remote branch ref', async () => {
    mocks.getExecOutput
      .mockResolvedValueOnce({ exitCode: 128, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '1.0.0\n' })
    const { getLatestTag } = useGit('token')

    await expect(getLatestTag('maintenance')).resolves.toBe('1.0.0')
    expect(mocks.getExecOutput).toHaveBeenNthCalledWith(
      2,
      'git',
      ['describe', '--tags', '--abbrev=0', 'origin/maintenance'],
      { ignoreReturnCode: true },
    )
  })
})
