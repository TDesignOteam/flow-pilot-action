import type { ReleasePackage } from '../types'
import { exec } from '@actions/exec'

export function publishRelease(release: ReleasePackage) {
  if (release.type === 'flutter') {
    return exec('flutter', ['pub', 'publish', '--force'], { cwd: release.dir })
  }

  return exec('pnpm', ['publish', '--no-git-checks', '--filter', release.name, '--tag', release.tag])
}
