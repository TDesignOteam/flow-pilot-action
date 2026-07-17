import type { PullRequestData } from '../types'
import * as github from '@actions/github'
import { getPrCommentWhitelist, getPullRequestNumber } from '../utils'
import { confirmPullRequestChangelog } from './issue-comment'

export async function pull_request_review(token: string) {
  if (github.context.eventName !== 'pull_request_review') {
    return false
  }
  if (github.context.payload.action !== 'submitted') {
    return false
  }
  if (github.context.payload.review?.state !== 'approved') {
    return false
  }
  const whitelist = await getPrCommentWhitelist()
  if (!whitelist.includes(github.context.actor)) {
    return false
  }
  const prNumber = getPullRequestNumber()
  const pullRequestData = github.context.payload.pull_request as PullRequestData
  return confirmPullRequestChangelog(prNumber, pullRequestData, token)
}
