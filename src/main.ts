import type { PullRequestData } from './types'
import { join } from 'node:path'
import process from 'node:process'

import { endGroup, error, getInput, info, startGroup } from '@actions/core'
import { exec } from '@actions/exec'
import { context } from '@actions/github'
import { extractChangelog, getPackages, getPullRequestNumber, stashPullRequestChangelog } from './utils'
import useGit from './utils/git'
import useGithub from './utils/github'

export async function main() {
  const token = getInput('token')
  const packages = getInput('packages') || ''
  const workPath = process.env.GITHUB_WORKSPACE || process.cwd()

  startGroup('context')
  info(`context: ${JSON.stringify(context, null, 2)}`)
  endGroup()
  info(`eventName: ${context.eventName}`)
  info(`action: ${context.payload.action}`)
  const prNumber = getPullRequestNumber()
  info(`pr_number: ${prNumber}`)
  if (!prNumber) {
    error('没有找到 pr_number')
    return
  }
  const { getPullRequestData, addComment } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData
  const isRelease = prData.head.ref.startsWith('release/')
  startGroup('prData')
  info(`prData: ${JSON.stringify(prData, null, 2)}`)
  endGroup()

  if (!isRelease && context.eventName === 'pull_request') {
    let logs = ''
    const prLog = extractChangelog(prData.body || '', packages.split(','))
    info(`pr_log: ${JSON.stringify(prLog, null, 2)}`)
    Object.keys(prLog).forEach((pkgName) => {
      if (!prLog[pkgName].length) {
        return
      }
      logs += `### ${pkgName}\n`
      prLog[pkgName].forEach((log) => {
        logs += `- ${log}\n`
      },
      )
    })
    if (logs) {
      const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的日志暂存区\n'
      addComment(prNumber, `${logHead}### 📝 更新日志\n\n${logs}`)
    }
  }
  if (context.eventName === 'issue_comment' && context.payload.action === 'edited') {
    const prLog = extractChangelog(context.payload.comment?.body || '', packages.split(','))
    info(`confirm_pr_log: ${JSON.stringify(prLog, null, 2)}`)
    const { cloneRepo, addRemote, checkoutPr, checkoutBranch, isNeedCommit } = useGit(token)
    await cloneRepo()

    let isForkPr = false
    if (prData.head.user.login !== context.repo.owner) {
      isForkPr = true
      info(`pr: ${prNumber} 是 fork pr`)
    }
    const repoPath = join(workPath, context.repo.repo)
    if (isForkPr) {
      await addRemote(prData.head.user.login, prData.head?.repo?.clone_url || '')
      await checkoutPr(prNumber)
      await exec('git', [
        'branch',
        '--set-upstream-to',
        `refs/remotes/${prData.head.user.login}/${prData.head.ref}`,
        `pr-${prNumber}`,
      ], { cwd: repoPath })
    }
    else {
      await checkoutBranch(prData.head.ref)
    }

    await exec('ls', ['-la'], { cwd: repoPath })

    const pkgs = getPackages(repoPath)
    stashPullRequestChangelog(prData, pkgs, prLog)
    await exec('git', [
      'status',
    ], { cwd: repoPath })
    if (!await isNeedCommit()) {
      info('无需提交')
      return true
    }
    await exec('git', ['commit', '-am', 'chore: stash changelog'], { cwd: repoPath })
    if (isForkPr) {
      await exec('git', ['push', prData.head.user.login, `HEAD:${prData.head.ref}`], { cwd: repoPath })
    }
    else {
      await exec('git', ['push', 'origin', prData.head.ref], { cwd: repoPath })
    }
  }
}
