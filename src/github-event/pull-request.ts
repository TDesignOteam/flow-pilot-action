import type { PullRequestData } from 'src/types'
import { getInput, info, setOutput } from '@actions/core'
import { context } from '@actions/github'
import { extractChangelog, getInputPkgs, getPullRequestNumber, getPullRequestReleaseDirs, getStashChangelog, renderChangelogMarkdown } from 'src/utils'
import useGit from 'src/utils/git'
import useGithub from 'src/utils/github'
import { translateText } from 'src/utils/tmt'

export async function pull_request(token: string) {
  if (context.eventName !== 'pull_request' || context.payload.action === 'closed') {
    return false
  }

  const pullRequestData = context.payload.pull_request as PullRequestData

  const isRelease = pullRequestData.head.ref.startsWith('release/')

  if (!isRelease) {
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
      const body = `${logHead}### 📝 更新日志\n\n${logs}\n\n <!-- FLOW-PR-CHANGELOG -->`

      setOutput('changelog', body)
    }
  }
  const isForkPr = pullRequestData.base.repo.full_name !== pullRequestData.head.repo.full_name
  if (isRelease && !isForkPr && context.payload.action === 'opened') {
    const prNumber = getPullRequestNumber()
    const { addComment, getPullRequestFiles } = useGithub(token)
    const { cloneRepo, checkoutBranch } = useGit(token)
    await cloneRepo()
    checkoutBranch(pullRequestData.head.ref)
    const changeFiles = await getPullRequestFiles(prNumber)
    info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
    const releaseDirs = await getPullRequestReleaseDirs(changeFiles)
    info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
    setOutput('changelog', '')
    if (!releaseDirs.length) {
      info('没有更新发布版本')
      return
    }
    releaseDirs.forEach((release) => {
      if (release.tag === 'latest') {
        const changelogs = getStashChangelog(release.dir)
        info(`changelogs: ${JSON.stringify(changelogs, null, 2)}`)
        const md = renderChangelogMarkdown(changelogs.changelogs)
        info(`markdownChangelogs: ${md}`)
        const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的 CHANGELOG.md 文件中\n'
        const currentDate = new Date()
        const year = currentDate.getFullYear()
        const month = String(currentDate.getMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getDate()).padStart(2, '0')
        // 中文日志
        addComment(prNumber, `${logHead}# 🎉 发布 ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n\n${md}`)
        const secretId = getInput('tmt-secret-id', { trimWhitespace: true })
        const secretKey = getInput('tmt-secret-key', { trimWhitespace: true })
        if (secretId && secretKey && md) {
          // tmt 翻译
          translateText(secretId, secretKey, md).then((text) => {
            info(`en_md: ${text}`)
            addComment(prNumber, `${logHead.replace('CHANGELOG.md', 'CHANGELOG.en-US.md')}# 🎉 Release ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n\n${text}`)
          }).catch((err) => {
            info(`翻译失败，${err}`)
            return ''
          })
        }
      }
    })
  }
}
