import fs from 'fs/promises'
import { Octokit, RequestError } from 'octokit'
import path from 'path'

const HEAD = 'main'
const BASE = 'production'
const TITLE = 'Merge main into production'
const PACKAGES_DIR = 'packages'
const CHANGELOG_FILE_NAME = 'CHANGELOG.md'

interface CompareChangelogOptions {
  owner: string
  repo: string
  changelogPath: string
  octokit: Octokit
}

const getChangelogDiff = async ({ owner, repo, changelogPath, octokit }: CompareChangelogOptions): Promise<string> => {
  if (!(await fs.exists(changelogPath))) {
    return ''
  }

  const headChangelog = await fs.readFile(changelogPath, 'utf-8')
  try {
    const baseChangelog = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: changelogPath,
      ref: BASE,
    })
    const data = baseChangelog.data
    const isDataValid = !Array.isArray(data) && 'content' in data && 'encoding' in data
    if (!isDataValid) {
      throw new Error(`Invalid response from GitHub API`)
    }

    const content = data.content
    const encoding = data.encoding as BufferEncoding
    const decodedContent = Buffer.from(content, encoding).toString('utf-8')

    const baseLatestVersion = decodedContent.split('\n').find((line) => line.startsWith('##'))
    if (!baseLatestVersion) {
      return headChangelog.trim()
    }

    const idxOfbaseLatestVerInHeadChangelog = headChangelog.indexOf(baseLatestVersion)
    if (idxOfbaseLatestVerInHeadChangelog === -1) {
      throw new Error(`Latest version not found in head changelog`)
    }

    const changelogDiff = headChangelog.slice(0, idxOfbaseLatestVerInHeadChangelog)
    return changelogDiff.trim()
  } catch (error) {
    if (!(error instanceof RequestError)) {
      throw error
    }

    if (error.status !== 404) {
      throw error
    }

    return headChangelog.trim()
  }
}

interface GetPullRequestBodyOptions {
  owner: string
  repo: string
  octokit: Octokit
}

const getPullRequestBody = async ({ owner, repo, octokit }: GetPullRequestBodyOptions): Promise<string> => {
  const parts: string[] = []

  const rootChangelogPath = CHANGELOG_FILE_NAME
  if (await fs.exists(rootChangelogPath)) {
    const rootChangelogDiff = await getChangelogDiff({
      owner,
      repo,
      changelogPath: rootChangelogPath,
      octokit,
    })
    parts.push(rootChangelogDiff)
  }

  if (await fs.exists(PACKAGES_DIR)) {
    const packages = await fs.readdir(PACKAGES_DIR)
    for (const pkg of packages) {
      const changelogPath = path.join(PACKAGES_DIR, pkg, CHANGELOG_FILE_NAME)
      const changelogDiff = await getChangelogDiff({
        owner,
        repo,
        changelogPath,
        octokit,
      })
      if (changelogDiff) {
        parts.push(changelogDiff)
      }
    }
  }

  return parts.join('\n\n')
}

const ensureProductionPullRequest = async () => {
  if (process.env.GITHUB_TOKEN === undefined) {
    throw new Error('GITHUB_TOKEN is not set')
  }
  if (process.env.GITHUB_REPO === undefined) {
    throw new Error('GITHUB_REPO is not set')
  }
  const [owner, repo] = process.env.GITHUB_REPO.split('/')

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })

  const pullRequests = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: HEAD,
    base: BASE,
  })

  if (pullRequests.data.length > 1) {
    throw new Error(`There are multiple open pull requests from ${HEAD} to ${BASE}`)
  }

  const body = await getPullRequestBody({ owner, repo, octokit })

  if (pullRequests.data.length === 1) {
    const pullNumber = pullRequests.data[0].number
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body,
    })
    return
  }

  await octokit.rest.pulls.create({
    owner,
    repo,
    title: TITLE,
    body,
    head: HEAD,
    base: BASE,
  })
}

if (require.main === module) {
  ensureProductionPullRequest()
}
