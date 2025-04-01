import { Octokit } from '@octokit/rest'

const OWNER = 'tepzilon'
const REPO = 'test-changesets-ci'
const HEAD = 'main'
const BASE = 'production'

const ensureProductionPullRequest = async () => {
  if (process.env.GITHUB_TOKEN === undefined) {
    console.error('GITHUB_TOKEN is not defined')
    return
  }
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })
  await octokit.rest.pulls.create({
    owner: OWNER,
    repo: REPO,
    title: 'Merge main into production',
    head: HEAD,
    base: BASE,
  })

  // TODO: add pull request body with the updated CHANGELOG.md from the main branch to the production branch for every package
}

if (require.main === module) {
  ensureProductionPullRequest()
}
