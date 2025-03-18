import { getOctokit } from '@actions/github'

export default function useGithub(owner, repo, token: string) {
  const octokit = getOctokit(token)
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
      owner: 'TDesignOteam',
      repo: 'flow-pilot-action',
      pull_number: pr_number,
    })
    return data
  }

  return { getPullRequestData, getPullRequestFiles }
}
