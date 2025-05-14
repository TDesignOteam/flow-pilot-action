import type { PullRequestData } from 'src/types'
import { info } from '@actions/core'
import { context } from '@actions/github'
import { extractChangelog, getInputPkgs, getPrCommentWhitelist } from 'src/utils'
import useGithub from 'src/utils/github'
import { confirmChangelog } from './issue-comment'

export async function workflow_run(token: string) {
  if (context.eventName !== 'workflow_run') {
    return false
  }
  if (context.payload.workflow_run?.event !== 'pull_request') {
    return false
  }
  if (context.payload.workflow_run?.status !== 'completed') {
    return false
  }
  if (context.payload.workflow_run?.conclusion !== 'success') {
    return false
  }
  if (context.payload.pull_requests.length !== 1) {
    return false
  }
  const prNumber = context.payload.pull_requests[0].number
  if (prNumber) {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(context.actor)) {
    return false
  }

  const { getPullRequestData } = useGithub(token)
  const pullRequestData = await getPullRequestData(prNumber) as PullRequestData
  const isRelease = pullRequestData.head.ref.startsWith('release/')
  if (isRelease) {
    return false
  }
  let logs = ''
  const prLog = extractChangelog(pullRequestData.body || '', getInputPkgs())
  info(`pr_log: ${JSON.stringify(prLog, null, 2)}`)
  Object.keys(prLog).forEach((pkgName) => {
    if (!prLog[pkgName].length) {
      return
    }
    logs += `#### ${pkgName}\n`
    prLog[pkgName].forEach((log) => {
      logs += `- ${log}\n`
    },
    )
  })
  if (logs) {
    const body = `### 📝 更新日志\n\n${logs}\n\n`

    confirmChangelog(body, token)
  }
}
