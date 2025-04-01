import { endGroup, getInput, info, startGroup } from '@actions/core'
import { context } from '@actions/github'

import useGithub from './github'
import { extractChangelog } from './utils'

export async function main() {
  const token = getInput('token')
  const packages = getInput('packages') || ''

  startGroup('context')
  info(`context: ${JSON.stringify(context, null, 2)}`)
  endGroup()
  info(`eventName: ${context.eventName}`)
  info(`action: ${context.payload.action}`)
  const prNumber = Number(context.payload.number)
  info(`pr_number: ${prNumber}`)
  const { getPullRequestData, addComment } = useGithub(token)
  const prData = await getPullRequestData(prNumber)
  const isRelease = prData.head.ref.startsWith('release/')
  startGroup('context')
  info(`prData: ${JSON.stringify(prData, null, 2)}`)
  endGroup()

  const prLog = extractChangelog(prData.body || '', packages.split(','))
  info(`prLog: ${JSON.stringify(prLog, null, 2)}`)
  if (!isRelease && context.eventName === 'pull_request') {
    let logs = ''
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
      addComment(prNumber, `${logHead}## 更新日志\n\n${logs}`)
    }
  }
}
