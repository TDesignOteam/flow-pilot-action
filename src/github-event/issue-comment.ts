import type { PullRequestData } from '../types'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { cwd } from 'node:process'
import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as github from '@actions/github'
import { globSync } from 'tinyglobby'
import { checkIsForkPr, extractChangelog, extractReleaseLogs, getChangelogFilePath, getConfiguredPackages, getInputPkgs, getPrCommentWhitelist, getPullRequestNumber, getPullRequestReleaseDirs, stashPackageChangelog } from '../utils/common'
import useGit from '../utils/git'
import useGithub from '../utils/github'

const PUSH_MAX_ATTEMPTS = 3

export async function issue_comment(token: string) {
  if (github.context.eventName !== 'issue_comment') {
    return false
  }
  if (!github.context.payload.issue?.pull_request) {
    return false
  }

  const action = github.context.payload.action
  const confirmLog = github.context.payload.comment?.body || ''
  const isChangelogCommand = action === 'created' && confirmLog.trim() === '/changelog'
  if (action !== 'edited' && !isChangelogCommand) {
    return false
  }

  if (action === 'edited' && github.context.payload.changes?.body === github.context.payload.comment?.body) {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(github.context.actor)) {
    return false
  }

  const prNumber = getPullRequestNumber()

  if (isChangelogCommand) {
    const { getPullRequestData } = useGithub(token)
    const prData = await getPullRequestData(prNumber) as PullRequestData
    return confirmPullRequestChangelog(prNumber, prData, token)
  }

  await confirmChangelog(prNumber, confirmLog, token)

  await confirmReleaseLog(prNumber, confirmLog, token)
}

export async function confirmPullRequestChangelog(prNumber: number, prData: PullRequestData, token: string) {
  if (prData.head.ref.startsWith('release/')) {
    return false
  }

  let logs = ''
  const prLog = extractChangelog(prData.body || '', getInputPkgs())
  core.info(`pr_log: ${JSON.stringify(prLog, null, 2)}`)
  Object.keys(prLog).forEach((pkgName) => {
    if (!prLog[pkgName].length) {
      return
    }
    logs += `#### ${pkgName}\n`
    prLog[pkgName].forEach((log) => {
      logs += `- ${log}\n`
    })
  })
  if (!logs) {
    return false
  }

  const body = `### 📝 更新日志\n\n${logs}\n\n`
  await confirmChangelog(prNumber, body, token)
  return true
}

export async function confirmChangelog(prNumber: number, log: string, token: string) {
  if (!log.startsWith('### 📝 更新日志')) {
    return false
  }
  const changelog = extractChangelog(log || '', getInputPkgs())

  core.info(`stash_changelog: ${JSON.stringify(changelog, null, 2)}`)

  const { createPullRequest, getOpenPullRequestByHead, getPullRequestData } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData

  const { cloneRepo, addRemote, checkoutPr, checkoutBranch, createBranch, gitPush, isNeedCommit } = useGit(token)
  const isMerged = prData.merged === true
  const changelogBranch = `changelog/pr-${prNumber}`
  const openChangelogPr = isMerged ? await getOpenPullRequestByHead(changelogBranch) : undefined
  await cloneRepo()
  const isForkPr = checkIsForkPr(prData)
  if (isMerged) {
    if (openChangelogPr) {
      await checkoutBranch(changelogBranch)
    }
    else {
      await checkoutBranch(prData.base.ref)
      await createBranch(changelogBranch)
    }
  }
  else if (isForkPr) {
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
  const pkgs = getConfiguredPackages(cwd())
  core.info(`pkgs: ${JSON.stringify(pkgs, null, 2)}`)
  stashPackageChangelog(prData, pkgs, changelog)
  await exec('git', ['add', '**/pr-*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    core.info('无需提交')
    return true
  }
  await exec('git', ['commit', '-m', 'chore: stash changelog [ci skip]'])
  if (isMerged) {
    await gitPush(changelogBranch)
    if (!openChangelogPr) {
      const pullRequest = await createPullRequest(
        `chore: add changelog for #${prNumber}`,
        changelogBranch,
        prData.base.ref,
        `补充已合并 PR #${prNumber} 的 Changelog。`,
      )
      core.info(`Created changelog pull request: ${pullRequest.html_url}`)
    }
  }
  else if (isForkPr) {
    await exec('git', ['push', prData.head.user.login, `HEAD:${prData.head.ref}`])
  }
  else {
    await exec('git', ['push', 'origin', prData.head.ref])
  }
}

async function confirmReleaseLog(prNumber: number, log: string, token: string) {
  const isReleaseHead = log.startsWith('# 🎉 发布') || log.startsWith('# 🎉 Release')
  core.info(`isReleaseHead: ${isReleaseHead}`)
  if (!isReleaseHead) {
    return false
  }
  const releaseHeading = log.startsWith('# 🎉 Release') ? '🎉 Release' : '🎉 发布'

  const releaseLogs = extractReleaseLogs(log, releaseHeading)
  core.info(`releaseLogs: ${JSON.stringify(releaseLogs, null, 2)}`)
  if (!releaseLogs.length) {
    throw new Error('Release log does not contain any valid package sections')
  }
  const changelogMap = new Map(releaseLogs.map(item => [item.pkgName, item.changelog]))
  if (changelogMap.size !== releaseLogs.length) {
    throw new Error('Release log contains duplicate package names')
  }

  const { getPullRequestData, getPullRequestFiles } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData
  const { cloneRepo, checkoutBranch, isNeedCommit } = useGit(token)
  const defaultBranch = prData.base.ref
  await cloneRepo()
  await checkoutBranch(prData.head.ref)
  const changeFiles = await getPullRequestFiles(prNumber)
  core.info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
  const releaseDirs = await getPullRequestReleaseDirs(changeFiles, getConfiguredPackages(cwd()))
  core.info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
  const releaseNames = new Set(releaseDirs.map(release => release.name))
  const unknownPackages = releaseLogs.filter(item => !releaseNames.has(item.pkgName)).map(item => item.pkgName)
  if (unknownPackages.length) {
    throw new Error(`Release log contains unknown packages: ${unknownPackages.join(', ')}`)
  }
  const emptyPackages = releaseLogs.filter(item => !item.changelog.trim()).map(item => item.pkgName)
  if (emptyPackages.length) {
    throw new Error(`Release log is empty for packages: ${emptyPackages.join(', ')}`)
  }

  for (const release of releaseDirs) {
    const changelog = changelogMap.get(release.name)
    if (!changelog) {
      continue
    }
    const changelogFilePath = getChangelogFilePath(release, releaseHeading === '🎉 Release' ? 'en' : 'zh')

    const files = globSync(`${release.dir}/.changelog/*.md`)
    files.forEach((file) => {
      unlinkSync(file)
      core.info(`delete file: ${file}`)
    })
    if (!existsSync(changelogFilePath)) {
      writeFileSync(changelogFilePath, '', 'utf8')
    }
    else {
      await exec('git', ['fetch', 'origin', defaultBranch])
      await exec('git', ['checkout', `origin/${defaultBranch}`, '--', changelogFilePath])
    }

    const pkgChangelog = readFileSync(changelogFilePath, 'utf8')
    const index = pkgChangelog.indexOf('## 🌈')
    let newData = ''
    if (index === -1) {
      newData = pkgChangelog + changelog
    }
    else {
      newData = pkgChangelog.slice(0, index) + changelog + pkgChangelog.slice(index)
    }
    writeFileSync(changelogFilePath, newData, 'utf8')

    await exec('git', ['add', '-A', '--', release.dir])
    await exec('git', ['add', '--', changelogFilePath])
    await exec('git', ['status'])
    if (await isNeedCommit()) {
      const commitMsg = `chore: update ${release.name} ${basename(changelogFilePath)}`
      await exec('git', ['commit', '-m', commitMsg])
    }
  }

  await pushReleaseBranch(prData.head.ref)
}

async function pushReleaseBranch(branch: string) {
  for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt++) {
    await exec('git', ['pull', '--rebase', 'origin', branch])
    const exitCode = await exec('git', ['push', 'origin', branch], { ignoreReturnCode: true })
    if (exitCode === 0) {
      return
    }
    core.info(`Push attempt ${attempt} failed, rebasing and retrying`)
  }
  throw new Error(`Failed to push ${branch} after ${PUSH_MAX_ATTEMPTS} attempts`)
}
