import { readFileSync } from 'node:fs';

import { ENV_TYPES } from './constants.js';

function readGitHubPullRequestNumber(eventPath) {
  if (!eventPath) {
    return null;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    return event.pull_request?.number ?? event.number ?? null;
  } catch {
    return null;
  }
}

function readOptionalEnv(name) {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    return null;
  }

  return value;
}

/**
 * Detects the execution environment from supported CI variables.
 *
 * GitHub Actions and GitLab CI return their merge-request base and current
 * branch metadata when available. Local runs intentionally use `null` branch
 * values so callers can fall back to CLI options or Git defaults.
 *
 * @returns {{type: string, isCI: boolean, baseBranch: string|null, currentBranch: string|null}} Environment metadata for branch selection.
 */
export const getEnvironment = () => {
  if (process.env.GITHUB_ACTIONS) {
    return {
      type: ENV_TYPES.GITHUB,
      isCI: true,
      baseBranch: readOptionalEnv('DIFF_COVER_COMPARE_BRANCH') ?? readOptionalEnv('GITHUB_BASE_REF'),
      currentBranch: readOptionalEnv('GITHUB_REF_NAME'),
      apiUrl: process.env.GITHUB_API_URL,
      repository: process.env.GITHUB_REPOSITORY,
      pullRequestNumber: readGitHubPullRequestNumber(process.env.GITHUB_EVENT_PATH),
      commitSha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      serverUrl: process.env.GITHUB_SERVER_URL,
    };
  }

  if (process.env.GITLAB_CI) {
    return {
      type: ENV_TYPES.GITLAB,
      isCI: true,
      baseBranch:
        readOptionalEnv('DIFF_COVER_COMPARE_BRANCH') ?? readOptionalEnv('CI_MERGE_REQUEST_TARGET_BRANCH_NAME'),
      currentBranch: readOptionalEnv('CI_COMMIT_REF_NAME') ?? readOptionalEnv('GITLAB_COMMIT_REF_NAME'),
      apiUrl: process.env.CI_API_V4_URL,
      projectId: process.env.CI_PROJECT_ID,
      projectUrl: process.env.CI_PROJECT_URL,
      mergeRequestIid: process.env.CI_MERGE_REQUEST_IID,
      commitSha: process.env.CI_COMMIT_SHA,
      pipelineUrl: process.env.CI_PIPELINE_URL,
    };
  }

  return {
    type: ENV_TYPES.LOCAL,
    isCI: false,
    baseBranch: null,
    currentBranch: null,
  };
};
