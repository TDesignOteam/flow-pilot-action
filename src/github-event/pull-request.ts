import type { PullRequestData } from '../types'
import { cwd } from 'node:process'
import { getInput, info, setOutput } from '@actions/core'
import * as github from '@actions/github'
import { buildReleaseComments, extractChangelog, getConfiguredPackages, getInputPkgs, getPullRequestNumber, getPullRequestReleaseDirs, getStashChangelog, publishRelease, renderChangelogMarkdown, sortReleasePackages } from '../utils'
import useGit from '../utils/git'
import useGithub from '../utils/github'
import { translateText } from '../utils/translate'

export async function pull_request(token: string) {
  if (github.context.eventName !== 'pull_request') {
    return false
  }
  const pullRequestData = github.context.payload.pull_request as PullRequestData

  const isRelease = pullRequestData.head.ref.startsWith('release/')

  if (github.context.payload.action === 'opened') {
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

    if (isRelease && !isForkPr && github.context.payload.action === 'opened') {
      const prNumber = getPullRequestNumber()
      const { addComment, getPullRequestFiles } = useGithub(token)
      const { cloneRepo, checkoutBranch } = useGit(token)
      await cloneRepo()
      await checkoutBranch(pullRequestData.head.ref)
      const changeFiles = await getPullRequestFiles(prNumber)
      info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
      const releaseDirs = await getPullRequestReleaseDirs(changeFiles, getConfiguredPackages(cwd()))
      info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
      setOutput('changelog', '')
      if (!releaseDirs.length) {
        info('没有更新发布版本')
        return
      }
      const zhComments: string[] = []
      const enComments: string[] = []
      const logHead = '(删除此行代表确认该日志): 修改并确认日志后删除这一行，机器人会提交到 本 PR 的 CHANGELOG.md 文件中\n'
      const currentDate = new Date()
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, '0')
      const day = String(currentDate.getDate()).padStart(2, '0')

      for (const release of releaseDirs) {
        if (release.tag === 'latest') {
          const changelogs = getStashChangelog(release.dir, release.type)
          info(`changelogs: ${JSON.stringify(changelogs, null, 2)}`)
          const md = renderChangelogMarkdown(changelogs.changelogs)
          info(`markdownChangelogs: ${md}`)
          // 中文日志
          const zhBody = `# 🎉 发布 ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n\n${md}`
          zhComments.push(zhBody)

          const secretId = getInput('translate-secret-id', { trimWhitespace: true })
          const secretKey = getInput('translate-secret-key', { trimWhitespace: true })
          if (secretId && secretKey && md) {
          // tmt 翻译
            try {
              const text = await translateText(secretId, secretKey, md)
              info(`en_md: ${text}`)
              const enBody = `# 🎉 Release ${changelogs.pkg}\n## 🌈 ${changelogs.version} \`${year}-${month}-${day}\` \n\n${text}`
              enComments.push(enBody)
            }
            catch (err) {
              info(`翻译失败，${err}`)
            }
          }
        }
      }

      for (const comment of buildReleaseComments(logHead, zhComments)) {
        await addComment(prNumber, comment)
      }
      for (const comment of buildReleaseComments(logHead.replace('CHANGELOG.md', 'CHANGELOG.en-US.md'), enComments)) {
        await addComment(prNumber, comment)
      }
    }
  }

  if (github.context.payload.action === 'closed') {
    if (!isRelease) {
      return false
    }
    if (github.context.payload.action === 'closed' && github.context.payload.pull_request?.merged) {
      const prNumber = getPullRequestNumber()
      const { createRelease, getPullRequestFiles } = useGithub(token)
      if (!pullRequestData.merge_commit_sha)
        throw new Error('The merged pull request does not have a merge commit SHA')
      await useGit(token).checkoutCommit(pullRequestData.merge_commit_sha)
      const changeFiles = await getPullRequestFiles(prNumber)
      info(`changeFiles: ${JSON.stringify(changeFiles, null, 2)}`)
      const packages = getConfiguredPackages(cwd())
      const releaseDirs = sortReleasePackages(getPullRequestReleaseDirs(changeFiles, packages), packages)
      info(`releaseDirs: ${JSON.stringify(releaseDirs, null, 2)}`)
      if (!releaseDirs.length) {
        info('没有更新发布版本')
        return
      }
      for (const release of releaseDirs) {
        // Flutter tag 使用 `${name}-${version}`,Node 使用 `${name}@${version}`
        const title = `${release.name}${release.type === 'flutter' ? '-' : '@'}${release.version}`
        const shouldCreateRelease = release.type === 'flutter' || Boolean(release.changelog && release.tag === 'latest')

        if (release.private) {
          info(`${release.name} is private package, skip publish`)
        }
        else if (release.type === 'node') {
          await publishRelease(release)
        }

        if (shouldCreateRelease) {
          try {
            info(`Creating release for ${release.name}: ${title}`)
            await createRelease(title, title, release.changelog, pullRequestData.merge_commit_sha)
            info(`${release.name} release created: ${title}`)
          }
          catch (err) {
            info(`Failed to create release for ${release.name}: ${err}`)
          }
        }
      }
    }
  }
}
