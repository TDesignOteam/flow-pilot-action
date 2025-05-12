import type { PullRequestData } from 'src/types'
import { info } from '@actions/core'
import { context } from '@actions/github'
import { extractChangelog, getInputPkgs, getPrCommentWhitelist } from 'src/utils'
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
    const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的日志暂存区\n'
    const body = `${logHead}### 📝 更新日志\n\n${logs}\n\n`

    confirmChangelog(body, token)
  }
}
