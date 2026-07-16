import type { ReleasePackage } from '../src/types'
import { exec } from '@actions/exec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publishRelease } from '../src/utils/publish'

vi.mock('@actions/exec', () => ({ exec: vi.fn() }))

const release: ReleasePackage = {
  dir: 'packages/example',
  name: 'example',
  version: '1.0.0',
  type: 'node',
  private: false,
  tag: 'latest',
  changelog: '',
}

describe('publishRelease', () => {
  beforeEach(() => {
    vi.mocked(exec).mockReset()
  })

  it('publishes Node packages with pnpm', async () => {
    await publishRelease(release)

    expect(exec).toHaveBeenCalledWith('pnpm', ['publish', '--no-git-checks', '--filter', 'example', '--tag', 'latest'])
  })

  it('does not publish Flutter packages directly', async () => {
    await publishRelease({ ...release, type: 'flutter' })

    expect(exec).not.toHaveBeenCalled()
  })
})
