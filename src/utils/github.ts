import { context, getOctokit } from '@actions/github'

export default function useGithub(token: string) {
  const octokit = getOctokit(token)
  const { repo, owner } = context.repo

  async function getPullRequestData(pr_number: number) {
    const { data } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pr_number,
    })
    return data
  }

  async function getPullRequestFiles(pr_number: number) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pr_number,
    })
    return data
  }
  async function addComment(pr_number: number, body: string) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr_number,
      body,
    })
  }
  async function addPullRequestLabels(pr_number: number, labels: string[]) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pr_number,
      labels,
    })
  }
  async function getRequestedReviewers(pr_number: number) {
    const { data } = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: pr_number,
    })
    return data.users.map(item => item.login)
  }

  return { getPullRequestData, getPullRequestFiles, addPullRequestLabels, addComment, getRequestedReviewers }
}
