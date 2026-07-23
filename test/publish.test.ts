import type { ReleasePackage } from '../src/types'
import type { Package } from '../src/utils/get-packages'
import { exec } from '@actions/exec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publishRelease, sortReleasePackages } from '../src/utils/publish'

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

function createRelease(name: string): ReleasePackage {
  return { ...release, dir: `packages/${name}`, name }
}

function createPackage(name: string, dependencies: string[] = []): Package {
  return {
    name,
    version: '1.0.0',
    type: 'node',
    private: false,
    dependencies,
    dir: `packages/${name}`,
    relativeDir: `packages/${name}`,
  }
}

describe('sortReleasePackages', () => {
  it('publishes workspace dependencies before their dependents', () => {
    const releases = [createRelease('tdesign-icons-view'), createRelease('tdesign-icons-vue-next')]
    const packages = [
      createPackage('tdesign-icons-view', ['tdesign-icons-vue-next']),
      createPackage('tdesign-icons-vue-next'),
    ]

    expect(sortReleasePackages(releases, packages).map(item => item.name)).toEqual([
      'tdesign-icons-vue-next',
      'tdesign-icons-view',
    ])
  })

  it('sorts transitive dependencies', () => {
    const releases = [createRelease('a'), createRelease('b'), createRelease('c')]
    const packages = [createPackage('a', ['b']), createPackage('b', ['c']), createPackage('c')]

    expect(sortReleasePackages(releases, packages).map(item => item.name)).toEqual(['c', 'b', 'a'])
  })

  it('keeps unrelated packages stable and ignores dependencies outside the release', () => {
    const releases = [createRelease('consumer'), createRelease('unrelated'), createRelease('dependency')]
    const packages = [
      createPackage('consumer', ['dependency', 'external']),
      createPackage('unrelated'),
      createPackage('dependency'),
    ]

    expect(sortReleasePackages(releases, packages).map(item => item.name)).toEqual([
      'unrelated',
      'dependency',
      'consumer',
    ])
  })

  it('rejects circular dependencies before publishing', () => {
    const releases = [createRelease('a'), createRelease('b')]
    const packages = [createPackage('a', ['b']), createPackage('b', ['a'])]

    expect(() => sortReleasePackages(releases, packages)).toThrow('Circular package dependencies detected: a, b')
    expect(exec).not.toHaveBeenCalled()
  })
})

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
