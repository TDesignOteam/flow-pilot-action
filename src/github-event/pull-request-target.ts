import type { PullRequestData } from '../types'
import { cwd } from 'node:process'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { checkReleaseBranch, getConfiguredPackages, getPullRequestNumber, getPullRequestReleaseDirs, publishRelease } from '../utils'
import useGit from '../utils/git'
import useGithub from '../utils/github'

export async function pull_request_target(token: string) {
  if (github.context.eventName !== 'pull_request_target') {
    return false
  }
  const prNumber = getPullRequestNumber()
  const { createRelease, getPullRequestData, getPullRequestFiles } = useGithub(token)

  const prData = await getPullRequestData(prNumber) as PullRequestData
  const isRelease = checkReleaseBranch(prData)
  if (!isRelease) {
    return false
  }
  if (github.context.payload.action === 'closed' && github.context.payload.pull_request?.merged) {
    if (!prData.merge_commit_sha)
      throw new Error('The merged pull request does not have a merge commit SHA')
    await useGit(token).checkoutCommit(prData.merge_commit_sha)
    const changeFiles = await getPullRequestFiles(prNumber)
    core.info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
    const releaseDirs = await getPullRequestReleaseDirs(changeFiles, getConfiguredPackages(cwd()))
    core.info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
    if (!releaseDirs.length) {
      core.info('没有更新发布版本')
      return
    }
    for (const release of releaseDirs) {
      const title = `${release.name}@${release.version}`
      const shouldCreateRelease = release.type === 'flutter' || Boolean(release.changelog && release.tag === 'latest')

      if (release.private) {
        core.info(`${release.name} is private package, skip publish`)
      }
      else if (release.type === 'node') {
        await publishRelease(release)
      }

      if (shouldCreateRelease) {
        try {
          core.info(`Creating release for ${release.name}: ${title}`)
          await createRelease(title, title, release.changelog, prData.merge_commit_sha)
          core.info(`${release.name} release created: ${title}`)
        }
        catch (err) {
          core.info(`Failed to create release for ${release.name}: ${err}`)
        }
      }
    }
  }
}
