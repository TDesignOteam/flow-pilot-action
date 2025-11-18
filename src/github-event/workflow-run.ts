import type { PullRequestData } from '../types'
import { unlinkSync } from 'node:fs'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { extractChangelog, getInputPkgs, getPrCommentWhitelist } from '../utils'
import useGithub from '../utils/github'
import { confirmChangelog } from './issue-comment'

export async function workflow_run(token: string) {
  if (github.context.eventName !== 'workflow_run') {
    return false
  }
  if (github.context.payload.workflow_run?.event !== 'pull_request_review') {
    core.warning(`github.context.payload.workflow_run?.event !== 'pull_request_review'`)
    return false
  }
  if (github.context.payload.workflow_run?.status !== 'completed') {
    core.warning(`github.context.payload.workflow_run?.status !== 'completed'`)
    return false
  }
  if (github.context.payload.workflow_run?.conclusion !== 'success') {
    core.warning(`github.context.payload.workflow_run?.conclusion !== 'success'`)
    return false
  }
  const prNumber = Number(core.getInput('pr_number', { required: true }))
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(github.context.actor)) {
    core.warning(`no in whitelist:${github.context.actor}`)
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
  core.info(`pr_log: ${JSON.stringify(prLog, null, 2)}`)
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
    unlinkSync('./pr-id.txt')
    confirmChangelog(prNumber, body, token)
  }
}
