import type { PullRequestData } from 'src/types'
import { writeFileSync } from 'node:fs'
import { info } from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import { context } from '@actions/github'
import { checkReleaseBranch, getPullRequestNumber, getPullRequestReleaseDirs } from 'src/utils'
import useGithub from 'src/utils/github'

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
      await exec('npm', ['-v'])
      await exec('npm', ['config', 'ls', '-l'])
      await exec('pnpm', ['config', 'get'])
      const { stdout: userconfig } = await getExecOutput('npm', ['config', 'get', 'userconfig'])
      info(`userconfig: ${userconfig.trim()}`)
      writeFileSync(userconfig.trim(), `//registry.npmjs.org/:_authToken=''\n`, 'utf8')
      await exec('pnpm', ['publish', '--no-git-checks', '--filter', `${release.name}`, '--tag', release.tag, '--loglevel', 'debug'])
      // if (release.changelog && release.tag === 'latest') {
      //   const title = `${release.name}@${release.version}`
      //   await createRelease(title, title, release.changelog)
      // }
    }
  }
}
