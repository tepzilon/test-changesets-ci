import { Octokit } from '@octokit/rest'

const OWNER = 'tepzilon'
const REPO = 'test-changesets-ci'
const HEAD = 'main'
const BASE = 'production'
const TITLE = 'Merge main into production'

const ensureProductionPullRequest = async () => {
  if (process.env.GITHUB_TOKEN === undefined) {
    console.error('GITHUB_TOKEN is not defined')
    return
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })
  
  const pullRequests = await octokit.rest.pulls.list({
    owner: OWNER,
    repo: REPO,
    state: "open",
    head: HEAD,
    base: BASE,
  })
  
  if (pullRequests.data.length > 1) {
    console.error(`There are multiple open pull requests from ${HEAD} to ${BASE}`)
    return
  }

  // TODO: add pull request body with the updated CHANGELOG.md from the main branch to the production branch for every package
  const body = Date.now().toString()

  if(pullRequests.data.length === 1) {
    const pullNumber = pullRequests.data[0].number
    await octokit.rest.pulls.update({
      owner: OWNER,
      repo: REPO,
      pull_number: pullNumber,
      body,
    })
    return
  }

  await octokit.rest.pulls.create({
    owner: OWNER,
    repo: REPO,
    title: TITLE,
    body,
    head: HEAD,
    base: BASE,
  })
}

if (require.main === module) {
  ensureProductionPullRequest()
}
