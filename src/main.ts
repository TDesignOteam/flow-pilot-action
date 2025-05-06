import { endGroup, getInput, info, startGroup } from '@actions/core'
import { context } from '@actions/github'
import { issue_comment } from './github-event'
import { pull_request } from './github-event/pull-request'
import { pull_request_target } from './github-event/pull-request-target'

export async function run() {
  const token = getInput('token') || ''

  startGroup('context')
  info(`context: ${JSON.stringify(context, null, 2)}`)
  endGroup()
  info(`eventName: ${context.eventName}`)
  info(`action: ${context.payload.action}`)

  issue_comment(token)

  pull_request(token)

  pull_request_target(token)
}
