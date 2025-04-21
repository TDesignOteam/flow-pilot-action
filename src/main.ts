import type { PullRequestData } from './types'

import { endGroup, getInput, info, startGroup } from '@actions/core'
import { context } from '@actions/github'
import { checkReleaseBranch, extractChangelog, getInputPkgs, getPullRequestNumber, getPullRequestReleaseDirs, getStashChangelog, issue_comment, renderChangelogMarkdown } from './utils'
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

async function pull_request(token: string) {
  if (context.eventName !== 'pull_request') {
    return false
  }
  const prNumber = getPullRequestNumber()
  const { getPullRequestData, addComment, getPullRequestFiles, createRelease } = useGithub(token)
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
    if (context.payload.action === 'opened') {
      await cloneRepo()
      checkoutBranch(prData.head.ref)
      const changeFiles = await getPullRequestFiles(prNumber)
      info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
      const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
      info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
      if (!releaseDirs.length) {
        info('没有更新发布版本')
        return
      }
      releaseDirs.forEach((release) => {
        if (release.tag === 'latest') {
          const changelogs = getStashChangelog(release.dir)
          info(`changelogs: ${JSON.stringify(changelogs, null, 2)}`)
          const md = renderChangelogMarkdown(changelogs.changelogs)
          const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的 CHANGELOG.md 文件中\n'
          const currentDate = new Date()
          const year = currentDate.getFullYear()
          const month = currentDate.getMonth() + 1
          const day = currentDate.getDate()
          addComment(prNumber, `${logHead}# 🎉 Release ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n${md}`)
        }
      })
    }
    if (context.payload.action === 'closed' && context.payload.pull_request?.merged) {
      await cloneRepo()
      checkoutBranch(prData.head.ref)
      const changeFiles = await getPullRequestFiles(prNumber)
      info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
      const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
      info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
      if (!releaseDirs.length) {
        info('没有更新发布版本')
        return
      }
      releaseDirs.forEach(async (release) => {
        if (release.changelog) {
          const title = `${release.name}@${release.version}`
          await createRelease(title, title, release.changelog)
        }
      })
    }
  }
}
