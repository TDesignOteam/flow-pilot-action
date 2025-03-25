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

  return { getPullRequestData, getPullRequestFiles }
}
