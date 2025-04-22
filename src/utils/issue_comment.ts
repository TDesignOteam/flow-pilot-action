import type { PullRequestData } from 'src/types'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { info } from '@actions/core'
import { exec } from '@actions/exec'
import { context } from '@actions/github'
import { globSync } from 'glob'
import { checkIsForkPr, extractChangelog, extractReleaseLog, getInputPkgs, getPackages, getPrCommentWhitelist, getPullRequestNumber, getPullRequestReleaseDirs, stashPackageChangelog } from './common'
import useGit from './git'
import useGithub from './github'

export async function issue_comment(token: string) {
  if (context.eventName !== 'issue_comment' || context.payload.action !== 'edited') {
    return false
  }

  if (context.payload.changes?.body === context.payload.comment?.body) {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(context.actor)) {
    return false
  }
  const confirmLog = context.payload.comment?.body || ''

  confirmChangelog(confirmLog, token)

  confirmReleaseLog(confirmLog, token)
}

async function confirmChangelog(log: string, token: string) {
  if (!log.startsWith('### 📝 更新日志')) {
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
  const pkgs = getPackages(cwd())
  info(`pkgs: ${JSON.stringify(pkgs, null, 2)}`)
  stashPackageChangelog(prData, pkgs, prLog)
  await exec('git', ['add', '**/pr-*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    info('无需提交')
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

async function confirmReleaseLog(log: string, token: string) {
  if (!log.startsWith('# 🎉 Release')) {
    return false
  }
  const { pkgName, changelog } = extractReleaseLog(log)

  info(`pkgName: ${pkgName}`)
  info(`changelog: ${changelog}`)

  const prNumber = getPullRequestNumber()
  const { getPullRequestData, getPullRequestFiles } = useGithub(token)
  const prData = await getPullRequestData(prNumber) as PullRequestData
  const { cloneRepo, checkoutBranch, isNeedCommit } = useGit(token)
  await cloneRepo()
  checkoutBranch(prData.head.ref)
  const changeFiles = await getPullRequestFiles(prNumber)
  info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
  const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
  info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
  releaseDirs.forEach((release) => {
    if (release.name !== pkgName) {
      return
    }
    const files = globSync(`${release.dir}/.changelog/*.md`)
    files.forEach((file) => {
      unlinkSync(file)
      info(`delete file: ${file}`)
    })
    if (!existsSync(`${release.dir}/CHANGELOG.md`)) {
      writeFileSync(`${release.dir}/CHANGELOG.md`, '', 'utf8')
    }

    const pkgChangelog = readFileSync(`${release.dir}/CHANGELOG.md`, 'utf8')
    const index = pkgChangelog.indexOf('## 🌈')
    let newData = ''
    if (index === -1) {
      newData = pkgChangelog + changelog
    }
    else {
      newData = pkgChangelog.slice(0, index) + changelog + pkgChangelog.slice(index)
    }
    writeFileSync(`${release.dir}/CHANGELOG.md`, newData, 'utf8')
  })

  await exec('git', ['add', '**/*.md'])
  await exec('git', ['status'])
  if (!await isNeedCommit()) {
    info('无需提交')
    return true
  }
  await exec('git', ['commit', '-m', 'chore: changelog'])
  await exec('git', ['push', 'origin', prData.head.ref])
}
