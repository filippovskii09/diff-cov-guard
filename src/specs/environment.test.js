import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from '@jest/globals';

import { getEnvironment } from '../environment.js';
import {
  CURRENT_BRANCH,
  DEFAULT_BRANCH,
  ENV_TYPES,
  GITHUB_API_URL,
  GITHUB_COMMIT_SHA,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
  GITHUB_SERVER_URL,
} from './helpers/fixtures.js';

const GITHUB_EVENT_PULL_REQUEST_NUMBER = 123;

const originalEnv = process.env;
let tempDir;

afterEach(() => {
  process.env = originalEnv;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function setEnv(values) {
  process.env = { ...values };
}

describe('environment', () => {
  test('detects GitHub Actions metadata', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'diff-cov-env-'));
    const eventPath = join(tempDir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ pull_request: { number: GITHUB_EVENT_PULL_REQUEST_NUMBER } }));

    setEnv({
      GITHUB_ACTIONS: 'true',
      GITHUB_BASE_REF: DEFAULT_BRANCH,
      GITHUB_REF_NAME: CURRENT_BRANCH,
      GITHUB_API_URL,
      GITHUB_REPOSITORY,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_SHA: GITHUB_COMMIT_SHA,
      GITHUB_RUN_ID,
      GITHUB_SERVER_URL,
    });

    expect(getEnvironment()).toEqual({
      type: ENV_TYPES.GITHUB,
      isCI: true,
      baseBranch: DEFAULT_BRANCH,
      currentBranch: CURRENT_BRANCH,
      apiUrl: GITHUB_API_URL,
      repository: GITHUB_REPOSITORY,
      pullRequestNumber: GITHUB_EVENT_PULL_REQUEST_NUMBER,
      commitSha: GITHUB_COMMIT_SHA,
      runId: GITHUB_RUN_ID,
      serverUrl: GITHUB_SERVER_URL,
    });
  });

  test('reads top-level GitHub event numbers and tolerates invalid event payloads', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'diff-cov-env-'));
    const eventPath = join(tempDir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ number: GITHUB_EVENT_PULL_REQUEST_NUMBER }));
    setEnv({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: eventPath });

    expect(getEnvironment().pullRequestNumber).toBe(GITHUB_EVENT_PULL_REQUEST_NUMBER);

    writeFileSync(eventPath, '{');

    expect(getEnvironment().pullRequestNumber).toBeNull();
  });

  test('uses DIFF_COVER_COMPARE_BRANCH before provider base branch metadata', () => {
    setEnv({
      GITHUB_ACTIONS: 'true',
      DIFF_COVER_COMPARE_BRANCH: 'origin/develop',
      GITHUB_BASE_REF: DEFAULT_BRANCH,
    });

    expect(getEnvironment()).toEqual(
      expect.objectContaining({
        type: ENV_TYPES.GITHUB,
        isCI: true,
        baseBranch: 'origin/develop',
      })
    );
  });

  test('ignores empty provider base branch metadata so callers can fall back', () => {
    setEnv({
      GITHUB_ACTIONS: 'true',
      GITHUB_BASE_REF: '',
    });

    expect(getEnvironment()).toEqual(
      expect.objectContaining({
        type: ENV_TYPES.GITHUB,
        isCI: true,
        baseBranch: null,
      })
    );
  });

  test('detects GitLab CI metadata with missing branch values normalized', () => {
    setEnv({ GITLAB_CI: 'true' });

    expect(getEnvironment()).toEqual({
      type: ENV_TYPES.GITLAB,
      isCI: true,
      baseBranch: null,
      currentBranch: null,
      apiUrl: undefined,
      projectId: undefined,
      projectUrl: undefined,
      mergeRequestIid: undefined,
      commitSha: undefined,
      pipelineUrl: undefined,
    });
  });

  test('falls back to local metadata', () => {
    setEnv({});
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;

    expect(getEnvironment()).toEqual({
      type: ENV_TYPES.LOCAL,
      isCI: false,
      baseBranch: null,
      currentBranch: null,
    });
  });
});
