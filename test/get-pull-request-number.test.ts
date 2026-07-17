import { describe, expect, it, vi } from 'vitest'
import { getPullRequestNumber } from '../src/utils/common'

const mocks = vi.hoisted(() => ({
  context: {
    eventName: 'pull_request_review',
    payload: { pull_request: { number: 31 } },
  },
}))

vi.mock('@actions/github', () => ({ context: mocks.context }))

describe('getPullRequestNumber', () => {
  it('reads the pull request number from a review event', () => {
    expect(getPullRequestNumber()).toBe(31)
  })
})
