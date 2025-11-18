import type { PullRequestData } from '../types'
import { info } from '@actions/core'
import { exec } from '@actions/exec'
import { context } from '@actions/github'
import { checkReleaseBranch, getPullRequestNumber, getPullRequestReleaseDirs } from '../utils'
import useGithub from '../utils/github'

export async function pull_request_target(token: string) {
  if (context.eventName !== 'pull_request_target') {
    return false
  }
  const prNumber = getPullRequestNumber()
  const { getPullRequestData, getPullRequestFiles } = useGithub(token)

  const prData = await getPullRequestData(prNumber) as PullRequestData
  const isRelease = checkReleaseBranch(prData)
  if (!isRelease) {
    return false
  }
  if (context.payload.action === 'closed' && context.payload.pull_request?.merged) {
    const changeFiles = await getPullRequestFiles(prNumber)
    info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
    const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
    info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
    if (!releaseDirs.length) {
      info('没有更新发布版本')
      return
    }
    for (const release of releaseDirs) {
      if (release.private) {
        info(`${release.name} is private package, skip publish`)
        return
      }

      await exec('pnpm', ['publish', '--no-git-checks', '--filter', `${release.name}`, '--tag', release.tag])
      // if (release.changelog && release.tag === 'latest') {
      //   const title = `${release.name}@${release.version}`
      //   await createRelease(title, title, release.changelog)
      // }
    }
  }
}
