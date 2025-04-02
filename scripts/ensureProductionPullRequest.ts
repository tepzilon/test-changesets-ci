import { Octokit, RequestError } from 'octokit'
import fs from 'fs/promises'
import path from 'path'

const OWNER = 'tepzilon'
const REPO = 'test-changesets-ci'
const HEAD = 'main'
const BASE = 'production'
const TITLE = 'Merge main into production'
const PACKAGES_DIR = 'packages'
const CHANGELOG_FILE_NAME = 'CHANGELOG.md'

interface CompareChangelogOptions {
  changelogPath: string
  octokit: Octokit
}

const getChangelogDiff = async ({ changelogPath, octokit }: CompareChangelogOptions): Promise<string> => {
  if (!(await fs.exists(changelogPath))) {
    return ''
  }

  const headChangelog = await fs.readFile(changelogPath, 'utf-8')
  try {
    const baseChangelog = await octokit.rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
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
  octokit: Octokit
}

const getPullRequestBody = async ({ octokit }: GetPullRequestBodyOptions) => {
  const parts = [];

  const rootChangelogPath = CHANGELOG_FILE_NAME
  if (await fs.exists(rootChangelogPath)) {
    const rootChangelogDiff = await getChangelogDiff({
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
    throw new Error(`There are multiple open pull requests from ${HEAD} to ${BASE}`)
  }

  const body = await getPullRequestBody({ octokit })

  if (pullRequests.data.length === 1) {
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
