import * as core from '@actions/core'
import * as github from '@actions/github'

export default function useGithub(token: string) {
  const octokit = github.getOctokit(token)
  const { repo, owner } = github.context.repo

  async function getPullRequestData(pr_number: number) {
    const { data } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pr_number,
    })
    return data
  }

  async function getPullRequestFiles(pr_number: number) {
    return octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pr_number,
      per_page: 100,
    })
  }
  async function getOpenPullRequestByHead(head: string) {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${head}`,
      state: 'open',
    })
    return data[0]
  }
  async function createPullRequest(title: string, head: string, base: string, body: string) {
    const { data } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
    })
    return data
  }
  async function getCommentList(pr_number: number) {
    const { data } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pr_number,
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
  async function updateComment(comment_id: number, body: string) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id,
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
  async function createRelease(tag_name: string, name: string, body: string, target_commitish?: string, prerelease = false) {
    await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name,
      name,
      body,
      target_commitish,
      prerelease,
    })
  }
  /**
   * 获取 base..head 之间已合并 PR 的编号列表(去重)。
   * 通过 compare API 取区间提交,再关联其已合并 PR 编号;单个提交失败时容错跳过。
   */
  async function getMergedPrNumbersBetweenRefs(base: string, head: string) {
    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${base}...${head}`,
    })
    const prNumbers = new Set<number>()
    for (const commit of data.commits || []) {
      try {
        const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner,
          repo,
          commit_sha: commit.sha,
        })
        prs.forEach((pr) => {
          if (pr.number && pr.merged_at)
            prNumbers.add(pr.number)
        })
      }
      catch (error) {
        core.info(`getMergedPrNumbersBetweenRefs: 跳过 commit ${commit.sha}:${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return [...prNumbers]
  }

  return { getPullRequestData, getPullRequestFiles, getOpenPullRequestByHead, createPullRequest, addPullRequestLabels, addComment, updateComment, getCommentList, getRequestedReviewers, createRelease, getMergedPrNumbersBetweenRefs }
}
