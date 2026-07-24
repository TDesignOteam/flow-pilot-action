import { describe, expect, it, vi } from 'vitest'

import useGithub from '../../src/utils/github'

const octokit = vi.hoisted(() => ({
  rest: {
    repos: {
      compareCommitsWithBasehead: vi.fn(),
      listPullRequestsAssociatedWithCommit: vi.fn(),
    },
  },
}))

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
}))

vi.mock('@actions/core', () => ({ info: mocks.info }))
vi.mock('@actions/github', () => ({
  getOctokit: vi.fn(() => octokit),
  context: { repo: { owner: 'owner', repo: 'repo' } },
}))

describe('getMergedPrNumbersBetweenRefs', () => {
  it('collects and dedupes PR numbers from merge commits', async () => {
    octokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        commits: [
          { sha: 'a', parents: [{ sha: 'p1' }] },
          { sha: 'b', parents: [{ sha: 'p2' }, { sha: 'p3' }] },
          { sha: 'c', parents: [{ sha: 'p4' }, { sha: 'p5' }] },
        ],
      },
    })
    octokit.rest.repos.listPullRequestsAssociatedWithCommit
      .mockResolvedValueOnce({ data: [{ number: 10 }] })
      .mockResolvedValueOnce({ data: [{ number: 10 }, { number: 11 }] })

    const { getMergedPrNumbersBetweenRefs } = useGithub('token')
    const prs = await getMergedPrNumbersBetweenRefs('1.0.0', 'main')

    expect(prs.sort((a, b) => a - b)).toEqual([10, 11])
  })

  it('tolerates listPullRequestsAssociatedWithCommit failure per commit', async () => {
    octokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: {
        commits: [
          { sha: 'b', parents: [{ sha: 'p2' }, { sha: 'p3' }] },
          { sha: 'c', parents: [{ sha: 'p4' }, { sha: 'p5' }] },
        ],
      },
    })
    octokit.rest.repos.listPullRequestsAssociatedWithCommit
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: [{ number: 11 }] })

    const { getMergedPrNumbersBetweenRefs } = useGithub('token')
    const prs = await getMergedPrNumbersBetweenRefs('1.0.0', 'main')

    expect(prs).toEqual([11])
  })
})
