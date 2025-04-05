import type { PullRequestData } from './types'

import process from 'node:process'
import { endGroup, getInput, info, startGroup } from '@actions/core'
import { exec } from '@actions/exec'
import { context } from '@actions/github'
import { extractChangelog, getPackages, getPullRequestNumber, getPullRequestReleaseDirs, getStashChangelog, renderChangelogMarkdown, stashPackageChangelog } from './utils'
import useGit from './utils/git'
import useGithub from './utils/github'

export async function run() {
  const token = getInput('token', { required: true })

  startGroup('context')
  info(`context: ${JSON.stringify(context, null, 2)}`)
  endGroup()
  info(`eventName: ${context.eventName}`)
  info(`action: ${context.payload.action}`)

  issue_comment(token)

  pull_request(token)
}

async function issue_comment(token: string) {
  if (context.eventName !== 'issue_comment' || context.payload.action !== 'edited') {
    return false
  }

  if (context.payload.changes?.body === context.payload.comment?.body) {
    return false
  }

  if (!context.payload.comment?.body.startsWith('### 📝 更新日志')) {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(context.actor)) {
    return false
  }
  const changelog = extractChangelog(context.payload.comment?.body || '', getInputPkgs())

  info(`stash_changelog: ${JSON.stringify(changelog, null, 2)}`)

  const prNumber = getPullRequestNumber()

  const { getPullRequestData } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData
  const prLog = extractChangelog(context.payload.comment?.body || '', getInputPkgs())
  info(`pr_log: ${JSON.stringify(prLog, null, 2)}`)
  const { cloneRepo, addRemote, checkoutPr, checkoutBranch, isNeedCommit } = useGit(token)
  await cloneRepo()
  const isForkPr = checkIsForkPr(prData)
  if (isForkPr) {
    await addRemote(prData.head.user.login, prData.head?.repo?.clone_url || '')
    await checkoutPr(prNumber)
    await exec('git', [
      'branch',
      '--set-upstream-to',
      `refs/remotes/${prData.head.user.login}/${prData.head.ref}`,
      `pr-${prNumber}`,
    ])
  }
  else {
    await checkoutBranch(prData.head.ref)
  }
  const pkgs = getPackages(process.cwd())
  info(`pkgs: ${JSON.stringify(pkgs, null, 2)}`)
  stashPackageChangelog(prData, pkgs, prLog)
  await exec('git', ['add', '**/pr-*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    info('无需提交')
    return true
  }
  await exec('git', ['commit', '-m', 'chore: stash changelog'])
  if (isForkPr) {
    await exec('git', ['push', prData.head.user.login, `HEAD:${prData.head.ref}`])
  }
  else {
    await exec('git', ['push', 'origin', prData.head.ref])
  }
}
async function pull_request(token: string) {
  if (context.eventName !== 'pull_request') {
    return false
  }
  const prNumber = getPullRequestNumber()
  const { getPullRequestData, addComment, getPullRequestFiles } = useGithub(token)
  const { cloneRepo, checkoutBranch } = useGit(token)

  const prData = await getPullRequestData(prNumber) as PullRequestData
  const isRelease = checkReleaseBranch(prData)
  if (!isRelease) {
    let logs = ''
    const prLog = extractChangelog(prData.body || '', getInputPkgs())
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
      addComment(prNumber, `${logHead}### 📝 更新日志\n\n${logs}`)
    }
  }
  else {
    await cloneRepo()
    checkoutBranch(prData.head.ref)
  }
  const changeFiles = await getPullRequestFiles(prNumber)
  info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
  const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
  info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
  if (!releaseDirs.length) {
    info('没有更新发布版本')
    return
  }
  releaseDirs.forEach((dir) => {
    const changelogs = getStashChangelog(dir.pkg)
    info(`changelogs: ${JSON.stringify(changelogs, null, 2)}`)
    const md = renderChangelogMarkdown(changelogs.changelogs)
    const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的 CHANGELOG.md 文件中\n'
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const day = currentDate.getDate()
    addComment(prNumber, `${logHead}# ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day} \` \n${md}`)
  })
}

function checkReleaseBranch(prData: PullRequestData) {
  return prData.head.ref.startsWith('release/')
}
function checkIsForkPr(prData: PullRequestData) {
  return prData.head.user.login !== context.repo.owner
}

function getInputPkgs() {
  const pkgs = getInput('packages', { trimWhitespace: true }) || ''
  if (!pkgs) {
    return []
  }
  return pkgs.split(',').map(pkg => pkg.trim())
}

async function getPrCommentWhitelist() {
  const response = await fetch('https://raw.githubusercontent.com/Tencent/tdesign/refs/heads/main/.github/.pr-comment-ci-whitelist')
  const whitelist = await response.text()
  return whitelist.split('\n')
}
