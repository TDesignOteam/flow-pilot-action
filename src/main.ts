import { endGroup, getInput, info, startGroup } from '@actions/core'
import { context } from '@actions/github'
import useGithub from './github'
import { extractChangelog } from './utils'

export async function main() {
  const token = getInput('token')
  startGroup('context')
  info(`context: ${JSON.stringify(context, null, 2)}`)
  endGroup()
  info(`eventName: ${context.eventName}`)
  const prNumber = Number(context.payload.pull_request?.number)
  info(`pr_number: ${prNumber}`)
  const { getPullRequestData } = useGithub(token)
  const prData = await getPullRequestData(prNumber)
  startGroup('context')
  info(`prData: ${JSON.stringify(prData, null, 2)}`)
  endGroup()

  const prLog = extractChangelog(prData.body || '', ['pkg-a', 'pkg-b', 'pkg-c'])
  info(`prLog: ${JSON.stringify(prLog, null, 2)}`)
}
