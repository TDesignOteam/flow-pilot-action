import type { PullRequestData } from '../types'
import { info } from '@actions/core'
import { context } from '@actions/github'
import { extractChangelog, getInputPkgs, getPrCommentWhitelist, getPullRequestNumber } from '../utils'
import { confirmChangelog } from './issue-comment'

export async function pull_request_review(token: string) {
  if (context.eventName !== 'pull_request_review') {
    return false
  }
  if (context.payload.action !== 'submitted') {
    return false
  }
  if (context.payload.review?.state !== 'approved') {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(context.actor)) {
    return false
  }
  const prNumber = getPullRequestNumber()
  const pullRequestData = context.payload.pull_request as PullRequestData

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

    confirmChangelog(prNumber, body, token)
  }
}
