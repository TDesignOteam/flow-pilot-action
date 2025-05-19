import { exec, getExecOutput } from '@actions/exec'
import { context } from '@actions/github'

export default function useGit(token: string) {
  const { repo, owner } = context.repo
  async function cloneRepo() {
    await exec(`git config --global user.email "tdesign@tencent.com"`)
    await exec(`git config --global user.name "tdesign-bot"`)
    await exec('git', ['config', '--global', `url.https://${token}@github.com/.insteadOf`, 'https://github.com/'])

    // const repo_url = `https://${context.token}@github.com/${owner}/${repo}.git`
    const repo_url = `https://github.com/${owner}/${repo}.git`
    // await exec('git', ['clone', '-b', branchName, repo_url, `../${repo}`])
    await exec('rm', ['-rf', './*'])
    await exec('ls', ['-al'])
    await exec('git', ['clone', repo_url, '.'])
  }
  async function createBranch(branch: string) {
    await exec('git', ['checkout', '-b', branch])
  }

  async function checkoutBranch(branch: string) {
    await exec('git', ['checkout', branch])
  }

  async function checkoutPr(pr_number: number) {
    await exec('git', ['fetch', 'origin', `pull/${pr_number}/head:pr-${pr_number}`])
    await exec('git', ['checkout', `pr-${pr_number}`])
  }
  async function gitCommit(message: string) {
    await exec(`git commit -am "${message}" --no-verify`, [])
  }
  async function gitPush(branch: string) {
    await exec(`git push origin ${branch}`, [])
  }

  async function initSubmodule() {
    await exec('git', ['submodule', 'update', '--init', '--recursive'])
  }

  async function updateSubmodule() {
    await exec('git', ['submodule', 'update', '--remote'])
  }

  async function isNeedCommit() {
    const { stdout } = await getExecOutput('git', ['status'])
    return !stdout.includes('nothing to commit, working tree clean')
  }
  async function addRemote(origin: string, gitUrl: string) {
    await exec('git', ['remote', 'add', origin, gitUrl])
    await exec('git', ['fetch', origin])
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
