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
  README_FILE,
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
    expect(body).toContain('All changed executable lines in this pull request meet the required coverage threshold.');
    expect(body).toContain('### Coverage summary');
    expect(body).toContain('| Diff coverage | 100% |');
    expect(body).toContain('| Required | 90% |');
    expect(body).toContain('| Covered changed executable lines | 1 / 1 |');
    expect(body).toContain('| Policy | Source-only diff coverage |');
    expect(body).toContain('<summary>View changed files (1 file)</summary>');
    expect(body).toContain('### Changed files');
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
      runContext: {
        diffRef: 'refs/remotes/origin/main',
        lcovPath: 'frontend/coverage/lcov.info',
        checkedFileCount: 2,
      },
    });

    expect(body).toContain('## Diff Coverage Guard: ❌ Failed');
    expect(body).toContain('Coverage validation did not pass for this pull request.');
    expect(body).toContain('### Coverage summary');
    expect(body).toContain('- Compare branch: `refs/remotes/origin/main`');
    expect(body).toContain('**Action required:** 4 uncovered changed executable lines across 2 files.');
    expect(body).toContain('<summary>View affected files and uncovered lines (2 failing files)</summary>');
    expect(body).toContain('### Changed files');
    expect(body).toContain('### Uncovered changed lines');
    expect(body).toContain(
      `- \`${SOURCE_FILE}\`: [2-3](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_COMMIT_SHA}/${SOURCE_FILE}#L2-L3) and 1 more`
    );
    expect(body).toContain('Showing first 1 of 2 changed files in this summary.');
    expect(body).toContain('<summary>Show all uncovered changed lines</summary>');
    expect(body).toContain(
      `- \`${SOURCE_FILE}\`: [2-4](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_COMMIT_SHA}/${SOURCE_FILE}#L2-L4)`
    );
    expect(body).toContain(SECOND_SOURCE_FILE);
    expect(body).not.toContain('See CI logs for the full list.');
  });

  test('renders skipped reason without coverage tables', () => {
    const reason = 'Only non-source files changed.';
    const body = buildCommentBody({
      status: COMMENT_STATUSES.SKIPPED,
      config: runConfig(),
      reason,
      env: githubEnv(),
      runContext: {
        diffRef: 'origin/main',
        lcovPath: './coverage/lcov.info',
        changedFiles: [README_FILE],
        sourceFiles: [],
        checkedFileCount: 0,
      },
    });

    expect(body).toContain('## Diff Coverage Guard: ⏭️ Not required');
    expect(body).toContain('No source files were changed in this pull request.');
    expect(body).toContain('Coverage validation was skipped because this diff only contains non-source files.');
    expect(body).toContain('| Source files changed | No |');
    expect(body).toContain('| Coverage validation | Not required |');
    expect(body).toContain('| Policy | Source-only diff coverage |');
    expect(body).toContain('- Compare branch: `origin/main`');
    expect(body).toContain('- Changed files checked: 0');
    expect(body).toContain('### Changed files');
    expect(body).toContain('<summary>Diagnostics</summary>');
    expect(body).toContain('- Changed files:\n  - `README.md`');
    expect(body).toContain('- Source files after filters: none');
    expect(body).toContain('- LCOV path: `./coverage/lcov.info`');
    expect(body).not.toContain('| Diff coverage |');
  });

  test('uses merge request context for GitLab comments', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.SKIPPED,
      config: runConfig(),
      reason: 'Only non-source files changed.',
      env: gitlabEnv(),
      runContext: { checkedFileCount: 0 },
    });

    expect(body).toContain('No source files were changed in this merge request.');
  });

  test.each([
    ['No changed files.', 'No files were changed in this diff.'],
    [
      'No executable changed JS/TS lines matched coverage report.',
      'No changed executable lines were detected in this diff.',
    ],
    ['LCOV file is missing or empty.', 'Coverage validation was not required for this diff.'],
  ])('renders local skipped reason "%s"', (reason, expectedSummary) => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.SKIPPED,
      config: runConfig(),
      reason,
      env: { type: ENV_TYPES.LOCAL },
    });

    expect(body).toContain(expectedSummary);
    expect(body).toContain(`**Reason:** ${reason}`);
    expect(body).not.toContain('<summary>Diagnostics</summary>');
  });

  test('omits invalid optional run summary fields', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.SKIPPED,
      config: runConfig(),
      reason: 'No changed files.',
      env: { type: ENV_TYPES.LOCAL },
      runContext: { checkedFileCount: '0' },
    });

    expect(body).not.toContain('Changed files checked:');
  });

  test('renders a failed result when validation cannot calculate coverage', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      reason: 'LCOV file is missing or empty.',
      env: githubEnv(),
      runContext: { checkedFileCount: 1 },
    });

    expect(body).toContain('## Diff Coverage Guard: ❌ Failed');
    expect(body).toContain('| Source files selected | 1 |');
    expect(body).toContain('| Coverage validation | Failed |');
    expect(body).not.toContain('| Coverage validation | Not required |');
  });

  test('explains a failed LCOV path mismatch in the comment', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      reason: 'No LCOV records matched changed source files.',
      env: githubEnv(),
      runContext: { checkedFileCount: 1, lcovPath: 'frontend/coverage/lcov.info' },
    });

    expect(body).toContain('changed source file paths did not match any LCOV source records');
    expect(body).toContain('- LCOV path: `frontend/coverage/lcov.info`');
  });

  test('escapes markdown paths in tables, code spans, and GitHub line URLs', () => {
    const specialPath = 'src/a|b `[x]` #ф.js';
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      diffCoverage: diffCoverage({
        files: [
          fileResult({
            filePath: specialPath,
            changedLines: [7],
            executableLines: [7],
            coveredLines: [],
            uncoveredLines: [7],
          }),
        ],
      }),
      env: githubEnv(),
    });

    expect(body).toContain('| src/a\\|b `[x]` #ф.js | 1 | 0 | 0% |');
    expect(body).toContain('- `src/a|b \\`[x]\\` #ф.js`:');
    expect(body).toContain(
      `[7](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${GITHUB_COMMIT_SHA}/src/a%7Cb%20%60%5Bx%5D%60%20%23%D1%84.js#L7)`
    );
  });

  test('escapes fallback uncovered line labels without URLs', () => {
    const specialPath = 'src/a`b #x.js';
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      diffCoverage: diffCoverage({
        files: [
          fileResult({
            filePath: specialPath,
            changedLines: [3],
            executableLines: [3],
            coveredLines: [],
            uncoveredLines: [3],
          }),
        ],
      }),
      env: { type: ENV_TYPES.LOCAL },
    });

    expect(body).toContain('- `src/a\\`b #x.js`: `src/a\\`b #x.js:3`');
  });

  test('uses GitLab blob links and renders files without executable changes', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      diffCoverage: diffCoverage({
        files: [
          fileResult({
            changedLines: [3],
            executableLines: [3],
            coveredLines: [],
            uncoveredLines: [3],
          }),
          fileResult({
            filePath: SECOND_SOURCE_FILE,
            changedLines: [4],
            executableLines: [],
            coveredLines: [],
          }),
        ],
      }),
      env: gitlabEnv(),
    });

    expect(body).toContain(`[3](${GITLAB_PROJECT_URL}/-/blob/${GITLAB_COMMIT_SHA}/${SOURCE_FILE}#L3)`);
    expect(body).toContain(`| ${SECOND_SOURCE_FILE} | 1 | 0 | 100% |`);
  });

  test('renders a failed calculated result even when no per-file uncovered lines are provided', () => {
    const body = buildCommentBody({
      status: COMMENT_STATUSES.FAILED,
      config: runConfig(),
      diffCoverage: diffCoverage({ percentage: 80, coveredLines: 4, executableLines: 5 }),
      env: githubEnv(),
    });

    expect(body).toContain('0 uncovered changed executable lines across 0 files.');
    expect(body).toContain('No uncovered changed executable lines.');
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

  test('creates a GitHub comment with the standard Actions token when no marker exists', async () => {
    process.env.GITHUB_TOKEN = 'fallback-token';
    globalThis.fetch.mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: githubEnv(),
      config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/issues/${GITHUB_PULL_REQUEST_NUMBER}/comments`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: COMMENT_BODY }),
      })
    );
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fallback-token');
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

  test('updates an existing GitLab note using the diff-cov-guard-specific token', async () => {
    const existingNoteId = 55;
    process.env.DIFF_COV_GUARD_GITLAB_TOKEN = 'token';
    globalThis.fetch
      .mockResolvedValueOnce(response([{ id: existingNoteId, body: `${COMMENT_MARKER}\nold` }]))
      .mockResolvedValueOnce(response({}));

    await publishCoverageComment({
      env: gitlabEnv(),
      config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      `${GITLAB_API_URL}/projects/${encodeURIComponent(GITLAB_PROJECT_ID)}/merge_requests/${GITLAB_MERGE_REQUEST_IID}/notes/${existingNoteId}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ body: COMMENT_BODY }),
      })
    );
    expect(globalThis.fetch.mock.calls[0][1].headers['PRIVATE-TOKEN']).toBe('token');
  });

  test.each([
    [ENV_TYPES.GITHUB, githubEnv(), 'GitHub token is missing'],
    [ENV_TYPES.GITLAB, gitlabEnv(), 'GitLab token is missing'],
  ])('throws for missing %s token', async (_provider, env, message) => {
    await expect(
      publishCoverageComment({
        env,
        config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
        body: COMMENT_BODY,
      })
    ).rejects.toThrow(message);
  });

  test.each([
    [
      'GitHub',
      () => {
        process.env.GITHUB_TOKEN = 'token';
        return githubEnv({ repository: undefined });
      },
      'GitHub pull request metadata is missing',
    ],
    [
      'GitLab',
      () => {
        process.env.GITLAB_TOKEN = 'token';
        return gitlabEnv({ projectId: undefined });
      },
      'GitLab merge request metadata is missing',
    ],
  ])('throws when %s comment metadata is incomplete', async (_provider, getEnv, message) => {
    await expect(
      publishCoverageComment({
        env: getEnv(),
        config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
        body: COMMENT_BODY,
      })
    ).rejects.toThrow(message);
  });

  test.each([
    ['list', [response({}, false, 403)], 'List GitHub comments failed with HTTP 403'],
    ['create', [response([]), response({}, false, 422)], 'Create GitHub comment failed with HTTP 422'],
    [
      'update',
      [response([{ id: GITHUB_COMMENT_ID, body: COMMENT_MARKER }]), response({}, false, 500)],
      'Update GitHub comment failed with HTTP 500',
    ],
  ])('surfaces GitHub %s request failures', async (_action, responses, message) => {
    process.env.GITHUB_TOKEN = 'token';
    globalThis.fetch.mockResolvedValueOnce(responses[0]);

    if (responses[1]) {
      globalThis.fetch.mockResolvedValueOnce(responses[1]);
    }

    await expect(
      publishCoverageComment({
        env: githubEnv(),
        config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
        body: COMMENT_BODY,
      })
    ).rejects.toThrow(message);
  });

  test('does not call fetch when comments are disabled', async () => {
    await publishCoverageComment({
      env: githubEnv(),
      config: runConfig(),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('does not call fetch for an unsupported provider even when comments are enabled', async () => {
    await publishCoverageComment({
      env: { type: ENV_TYPES.LOCAL },
      config: runConfig({ comment: ENABLED_COMMENT_CONFIG }),
      body: COMMENT_BODY,
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
