import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { buildCommentBody, publishCoverageComment } from '../comment.js';
import { COMMENT_MARKER, ENV_TYPES } from '../constants.js';
import {
  COMMENT_BODY,
  COMMENT_STATUSES,
  GITHUB_API_URL,
  GITHUB_COMMENT_ID,
  GITHUB_COMMIT_SHA,
  GITHUB_PULL_REQUEST_NUMBER,
  GITHUB_REPOSITORY,
  GITHUB_SERVER_URL,
  GITLAB_API_URL,
  GITLAB_COMMIT_SHA,
  GITLAB_MERGE_REQUEST_IID,
  GITLAB_PROJECT_ID,
  GITLAB_PROJECT_URL,
  SECOND_SOURCE_FILE,
  SOURCE_FILE,
  commentConfig,
  diffCoverage,
  fileResult,
  runConfig,
} from './helpers/fixtures.js';

const originalEnv = process.env;
const originalFetch = globalThis.fetch;
const ENABLED_COMMENT_CONFIG = commentConfig({ enabled: true });
const LIMITED_COMMENT_CONFIG = commentConfig({ enabled: true, maxFiles: 1, maxLinesPerFile: 2 });

function githubEnv(overrides = {}) {
  return {
    type: ENV_TYPES.GITHUB,
    apiUrl: GITHUB_API_URL,
    repository: GITHUB_REPOSITORY,
    pullRequestNumber: GITHUB_PULL_REQUEST_NUMBER,
    commitSha: GITHUB_COMMIT_SHA,
    serverUrl: GITHUB_SERVER_URL,
    ...overrides,
  };
}

function gitlabEnv(overrides = {}) {
  return {
    type: ENV_TYPES.GITLAB,
    apiUrl: GITLAB_API_URL,
    projectId: GITLAB_PROJECT_ID,
    projectUrl: GITLAB_PROJECT_URL,
    mergeRequestIid: GITLAB_MERGE_REQUEST_IID,
    commitSha: GITLAB_COMMIT_SHA,
    ...overrides,
  };
}

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  process.env = {};
  globalThis.fetch = jest.fn();
});

afterEach(() => {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('comment body', () => {
  test('renders passed coverage summary', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.PASSED,
      config: runConfig(),
      diffCoverage: diffCoverage(),
      env: githubEnv(),
    });

    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('## Diff Coverage Guard: ✅ Passed');
    expect(body).toContain('| Diff coverage | 100% |');
    expect(body).toContain('| Required | 90% |');
    expect(body).toContain(`| ${SOURCE_FILE} | 1 | 1 | 100% |`);
    expect(body).toContain('No uncovered changed executable lines.');
  });

  test('renders failed uncovered line summary with limits and links', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig({
        comment: LIMITED_COMMENT_CONFIG,
      }),
      diffCoverage: diffCoverage({
        percentage: 50,
        coveredLines: 1,
        executableLines: 2,
        files: [
          fileResult({
            changedLines: [1, 2, 3, 4],
            executableLines: [1, 2, 3, 4],
            uncoveredLines: [2, 3, 4],
          }),
          fileResult({
            filePath: SECOND_SOURCE_FILE,
            changedLines: [5],
            executableLines: [5],
            coveredLines: [],
            uncoveredLines: [5],
          }),
        ],
      }),
      env: githubEnv(),
    });

    expect(body).toContain('## Diff Coverage Guard: ❌ Failed');
    expect(body).toContain('### Uncovered changed lines');
    expect(body).toContain(
      `- \`${SOURCE_FILE}\`: [2](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_COMMIT_SHA}/${SOURCE_FILE}#L2), [3](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_COMMIT_SHA}/${SOURCE_FILE}#L3) and 1 more`
    );
    expect(body).toContain('Showing first 1 files and first 2 lines per file. See CI logs for the full list.');
    expect(body).not.toContain(SECOND_SOURCE_FILE);
  });

  test('renders skipped reason without coverage tables', () => {
    const reason = 'Only non-source files changed.';
    const body = buildCommentBody({
      status: COMMENT_STATUSES.SKIPPED,
      config: runConfig(),
      reason,
      env: githubEnv(),
    });

    expect(body).toContain('## Diff Coverage Guard: ⏭️ Skipped');
    expect(body).toContain(reason);
    expect(body).not.toContain('| Metric | Value |');
  });
});

describe('publishCoverageComment', () => {
  test('updates existing GitHub comment when marker is found', async () => {
    process.env.DIFF_COV_GUARD_GITHUB_TOKEN = 'token';
    globalThis.fetch
      .mockResolvedValueOnce(response([{ id: GITHUB_COMMENT_ID, body: `${COMMENT_MARKER}\nold` }]))
      .mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: githubEnv(),
      config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/comments/${GITHUB_COMMENT_ID}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ body: COMMENT_BODY }),
      })
    );
  });

  test('passes an abort signal with configured API timeout to GitHub fetch calls', async () => {
    const apiTimeoutMs = 1234;
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    process.env.DIFF_COV_GUARD_GITHUB_TOKEN = 'token';
    globalThis.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: githubEnv(),
      config: runConfig({
        apiTimeoutMs,
        comment: ENABLED_COMMENT_CONFIG,
      }),
      body: COMMENT_BODY,
    });

    expect(timeout).toHaveBeenCalledWith(apiTimeoutMs);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${GITHUB_PULL_REQUEST_NUMBER}/comments`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${GITHUB_PULL_REQUEST_NUMBER}/comments`,
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    );
  });

  test('creates GitLab note when marker is not found', async () => {
    process.env.GITLAB_TOKEN = 'token';
    globalThis.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: gitlabEnv(),
      config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/merge_requests/${GITLAB_MERGE_REQUEST_IID}/notes`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: COMMENT_BODY }),
      })
    );
  });

  test('passes an abort signal with configured API timeout to GitLab fetch calls', async () => {
    const apiTimeoutMs = 4321;
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    process.env.GITLAB_TOKEN = 'token';
    globalThis.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: gitlabEnv(),
      config: runConfig({
        apiTimeoutMs,
        comment: ENABLED_COMMENT_CONFIG,
      }),
      body: COMMENT_BODY,
    });

    expect(timeout).toHaveBeenCalledWith(apiTimeoutMs);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/merge_requests/${GITLAB_MERGE_REQUEST_IID}/notes`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/merge_requests/${GITLAB_MERGE_REQUEST_IID}/notes`,
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    );
  });

  test('throws when token is missing', async () => {
    await expect(
      publishCoverageComment({
        env: githubEnv(),
        config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
        body: COMMENT_BODY,
      })
    ).rejects.toThrow('GitHub token is missing');
  });

  test('does not call fetch when comments are disabled', async () => {
    await publishCoverageComment({
      env: githubEnv(),
      config: runConfig(),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
