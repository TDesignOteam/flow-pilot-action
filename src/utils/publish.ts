import type { ReleasePackage } from '../types'
import { exec } from '@actions/exec'

export function publishRelease(release: ReleasePackage) {
  if (release.type === 'flutter')
    return Promise.resolve(0)

  return exec('pnpm', ['publish', '--no-git-checks', '--filter', release.name, '--tag', release.tag])
}
