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

  async function getCommitsBetweenRefs(base: string | undefined, head: string) {
    if (!base) {
      const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
        owner,
        repo,
        sha: head,
        per_page: 100,
      })
      return commits.reverse()
    }

    type Commit = Awaited<ReturnType<typeof octokit.rest.repos.listCommits>>['data'][number]
    type CompareData = Awaited<ReturnType<typeof octokit.rest.repos.compareCommitsWithBasehead>>['data']
    return octokit.paginate(
      octokit.rest.repos.compareCommitsWithBasehead,
      {
        owner,
        repo,
        basehead: `${base}...${head}`,
        per_page: 100,
      },
      (response) => {
        const data = response.data as unknown as CompareData | Commit[]
        return Array.isArray(data) ? data : data.commits
      },
    )
  }

  /**
   * 获取 base..head 之间已合并 PR 的编号列表(去重)。
   * base 为空时扫描 head 的全部历史。单个提交查询失败时告警并继续。
   */
  async function getMergedPrNumbersBetweenRefs(base: string | undefined, head: string) {
    const commits = await getCommitsBetweenRefs(base, head)
    const prNumbers = new Set<number>()
    let failedCommits = 0
    for (const commit of commits) {
      try {
        const prs = await octokit.paginate(octokit.rest.repos.listPullRequestsAssociatedWithCommit, {
          owner,
          repo,
          commit_sha: commit.sha,
          per_page: 100,
        })
        prs.forEach((pr) => {
          if (pr.number && pr.merged_at)
            prNumbers.add(pr.number)
        })
      }
      catch (error) {
        failedCommits++
        core.warning(`getMergedPrNumbersBetweenRefs: 跳过 commit ${commit.sha}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    core.info(`getMergedPrNumbersBetweenRefs: 扫描 ${commits.length} 个 commit,关联 ${prNumbers.size} 个 PR`)
    if (failedCommits)
      core.warning(`getMergedPrNumbersBetweenRefs: ${failedCommits} 个 commit 查询失败,发布日志可能不完整`)
    return [...prNumbers]
  }

  return { getPullRequestData, getPullRequestFiles, getOpenPullRequestByHead, createPullRequest, addPullRequestLabels, addComment, updateComment, getCommentList, getRequestedReviewers, createRelease, getMergedPrNumbersBetweenRefs }
}
