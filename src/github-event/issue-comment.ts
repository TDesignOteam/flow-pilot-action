import type { PullRequestData } from '../types'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { cwd } from 'node:process'
import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as github from '@actions/github'
import { globSync } from 'glob'
import { checkIsForkPr, extractChangelog, extractReleaseLog, getInputPkgs, getPackages, getPrCommentWhitelist, getPullRequestNumber, getPullRequestReleaseDirs, stashPackageChangelog } from '../utils/common'
import useGit from '../utils/git'
import useGithub from '../utils/github'

export async function issue_comment(token: string) {
  if (github.context.eventName !== 'issue_comment') {
    return false
  }
  if (github.context.payload.action !== 'edited') {
    return false
  }

  if (github.context.payload.changes?.body === github.context.payload.comment?.body) {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(github.context.actor)) {
    return false
  }
  const confirmLog = github.context.payload.comment?.body || ''

  const prNumber = getPullRequestNumber()

  confirmChangelog(prNumber, confirmLog, token)

  confirmReleaseLog(prNumber, confirmLog, token)
}

export async function confirmChangelog(prNumber: number, log: string, token: string) {
  if (!log.startsWith('### 📝 更新日志')) {
    return false
  }
  const changelog = extractChangelog(log || '', getInputPkgs())

  core.info(`stash_changelog: ${JSON.stringify(changelog, null, 2)}`)

  const { getPullRequestData } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData

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
  const pkgs = getPackages(cwd())
  core.info(`pkgs: ${JSON.stringify(pkgs, null, 2)}`)
  stashPackageChangelog(prData, pkgs, changelog)
  await exec('git', ['add', '**/pr-*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    core.info('无需提交')
    return true
  }
  await exec('git', ['commit', '-m', 'chore: stash changelog [ci skip]'])
  if (isForkPr) {
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
  let changelogFileName = 'CHANGELOG.md'

  if (log.startsWith('# 🎉 Release')) {
    changelogFileName = 'CHANGELOG.en-US.md'
  }

  const { pkgName, changelog } = extractReleaseLog(log)

  core.info(`pkgName: ${pkgName}`)
  core.info(`changelog: ${changelog}`)

  const { getPullRequestData, getPullRequestFiles } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData
  const { cloneRepo, checkoutBranch, isNeedCommit } = useGit(token)
  await cloneRepo()
  checkoutBranch(prData.head.ref)
  const changeFiles = await getPullRequestFiles(prNumber)
  core.info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
  const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
  core.info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
  for (const release of releaseDirs) {
    if (release.name !== pkgName) {
      return
    }
    const files = globSync(`${release.dir}/.changelog/*.md`)
    files.forEach((file) => {
      unlinkSync(file)
      core.info(`delete file: ${file}`)
    })
    if (!existsSync(`${release.dir}/${changelogFileName}`)) {
      writeFileSync(`${release.dir}/${changelogFileName}`, '', 'utf8')
    }
    else {
      await exec('git', ['fetch', 'origin', 'develop'])
      await exec('git', ['checkout', 'origin/develop', '--', `${release.dir}/${changelogFileName}`])
    }

    const pkgChangelog = readFileSync(`${release.dir}/${changelogFileName}`, 'utf8')
    const index = pkgChangelog.indexOf('## 🌈')
    let newData = ''
    if (index === -1) {
      newData = pkgChangelog + changelog
    }
    else {
      newData = pkgChangelog.slice(0, index) + changelog + pkgChangelog.slice(index)
    }
    writeFileSync(`${release.dir}/${changelogFileName}`, newData, 'utf8')
  }

  await exec('git', ['add', '**/*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    core.info('无需提交')
    return true
  }
  const commitMsg = `chore: update ${changelogFileName}`
  await exec('git', ['commit', '-m', commitMsg])
  await exec('git', ['pull'])
  await exec('git', ['push', 'origin', prData.head.ref])
}
