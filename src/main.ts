import { endGroup, getInput, info, startGroup } from '@actions/core'
import * as github from '@actions/github'
import { issue_comment } from './github-event'
import { pull_request } from './github-event/pull-request'
import { pull_request_review } from './github-event/pull-request-review'
import { workflow_run } from './github-event/workflow-run'

export async function run() {
  const token = getInput('token') || ''

  startGroup('context')
  info(`context: ${JSON.stringify(github.context, null, 2)}`)
  endGroup()
  info(`eventName: ${github.context.eventName}`)
  info(`action: ${github.context.payload.action}`)

  await issue_comment(token)

  await pull_request(token)

  await pull_request_review(token)

  await workflow_run(token)
}
