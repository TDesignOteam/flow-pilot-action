import type { ReleasePackage } from '../types'
import type { Package } from './get-packages'
import { exec } from '@actions/exec'

export function sortReleasePackages(releases: ReleasePackage[], packages: Package[]) {
  const releaseIndexes = new Map<string, number>()
  releases.forEach((release, index) => {
    if (releaseIndexes.has(release.name))
      throw new Error(`Duplicate release package name: ${release.name}`)
    releaseIndexes.set(release.name, index)
  })

  const packageDependencies = new Map(packages.map(pkg => [pkg.name, pkg.dependencies]))
  const indegrees = new Map(releases.map(release => [release.name, 0]))
  const dependents = new Map<string, ReleasePackage[]>()

  releases.forEach((release) => {
    packageDependencies.get(release.name)?.forEach((dependency) => {
      if (!releaseIndexes.has(dependency))
        return
      indegrees.set(release.name, (indegrees.get(release.name) || 0) + 1)
      dependents.set(dependency, [...(dependents.get(dependency) || []), release])
    })
  })

  const ready = releases.filter(release => indegrees.get(release.name) === 0)
  const sorted: ReleasePackage[] = []
  const enqueue = (release: ReleasePackage) => {
    const index = ready.findIndex(item => releaseIndexes.get(item.name)! > releaseIndexes.get(release.name)!)
    if (index === -1)
      ready.push(release)
    else
      ready.splice(index, 0, release)
  }

  while (ready.length) {
    const release = ready.shift()!
    sorted.push(release)
    dependents.get(release.name)?.forEach((dependent) => {
      const indegree = (indegrees.get(dependent.name) || 0) - 1
      indegrees.set(dependent.name, indegree)
      if (indegree === 0)
        enqueue(dependent)
    })
  }

  if (sorted.length !== releases.length) {
    const circularPackages = releases.filter(release => indegrees.get(release.name)! > 0).map(release => release.name)
    throw new Error(`Circular package dependencies detected: ${circularPackages.join(', ')}`)
  }

  return sorted
}

export function publishRelease(release: ReleasePackage) {
  if (release.type === 'flutter')
    return Promise.resolve(0)

  return exec('pnpm', ['publish', '--no-git-checks', '--filter', release.name, '--tag', release.tag])
}
