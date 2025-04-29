import type { PullRequestData } from 'src/types'
import { debug, info } from '@actions/core'
import { context } from '@actions/github'
import { checkReleaseBranch, extractChangelog, getInputPkgs, getPullRequestNumber, getPullRequestReleaseDirs, getStashChangelog, renderChangelogMarkdown } from 'src/utils'
import useGit from 'src/utils/git'
import useGithub from 'src/utils/github'

export async function pull_request(token: string) {
  if (context.eventName !== 'pull_request' || context.payload.action === 'closed') {
    return false
  }
  const prNumber = getPullRequestNumber()
  const { getPullRequestData, addComment, getPullRequestFiles, getCommentList, updateComment } = useGithub(token)
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
      let commentId
      const commentList = await getCommentList(prNumber)
      debug(`commentList: ${JSON.stringify(commentList, null, 2)}`)
      for (let i = commentList.length; i--;) {
        if (commentList[i].body?.includes('<!-- FLOW-PR-CHANGELOG -->')) {
          commentId = commentList[i].id
          break
        }
      }
      const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的日志暂存区\n'
      const body = `${logHead}### 📝 更新日志\n\n${logs}\n\n <!-- FLOW-PR-CHANGELOG -->`
      if (commentId) {
        updateComment(commentId, body)
      }
      else {
        addComment(prNumber, body)
      }
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
          const month = String(currentDate.getMonth() + 1).padStart(2, '0')
          const day = String(currentDate.getDate()).padStart(2, '0')
          addComment(prNumber, `${logHead}# 🎉 Release ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n\n${md}`)
        }
      })
    }
  }
}
