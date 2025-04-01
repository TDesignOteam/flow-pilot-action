import { exec, getExecOutput } from '@actions/exec'
import { context } from '@actions/github'

export default function useGit(token: string) {
  const { repo, owner } = context.repo
  async function cloneRepo() {
    // const repo_url = `https://${context.token}@github.com/${owner}/${repo}.git`
    const repo_url = `https://${token}@github.com/${owner}/${repo}.git`
    // await exec('git', ['clone', '-b', branchName, repo_url, `../${repo}`])
    await exec('git', ['clone', repo_url, `../${repo}`])
  }
  async function createBranch(branch: string) {
    await exec('git', ['checkout', '-b', branch], { cwd: `../${repo}` })
  }

  async function checkoutBranch(branch: string) {
    await exec('git', ['checkout', branch], { cwd: `../${repo}` })
  }
  async function checkoutPr(pr_number: number) {
    await exec('git', ['fetch', 'origin', `pull/${pr_number}/head:pr-${pr_number}`], { cwd: `../${repo}` })
    await exec('git', ['checkout', `pr-${pr_number}`], { cwd: `../${repo}` })
  }
  async function gitCommit(message: string) {
    await exec(`git commit -am "${message}" --no-verify`, [], { cwd: `../${repo}` })
  }
  async function gitPush(branch: string) {
    await exec(`git push origin ${branch}`, [], { cwd: `../${repo}` })
  }

  async function initSubmodule() {
    await exec('git', ['submodule', 'update', '--init', '--recursive'], { cwd: `../${repo}` })
  }

  async function updateSubmodule() {
    await exec('git', ['submodule', 'update', '--remote'], { cwd: `../${repo}` })
  }

  async function isNeedCommit() {
    const { stdout } = await getExecOutput('git', ['status'], { cwd: `../${repo}` })
    return !stdout.includes('nothing to commit, working tree clean')
  }
  async function addRemote(origin: string, gitUrl: string) {
    await exec('git', ['remote', 'add', origin, gitUrl], { cwd: `../${repo}` })
    await exec('git', ['fetch', origin], { cwd: `../${repo}` })
  }

  return {
    checkoutPr,
    cloneRepo,
    createBranch,
    gitCommit,
    gitPush,
    initSubmodule,
    updateSubmodule,
    isNeedCommit,
    checkoutBranch,
    addRemote,
  }
}
