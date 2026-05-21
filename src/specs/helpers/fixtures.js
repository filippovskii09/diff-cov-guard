import {
  ARGS_OPTIONS,
  COMMENT_DEFAULTS,
  COMMENT_REASONS,
  COMMENT_STATUSES,
  CONFIG_DEFAULTS,
  CONFIG_FILES,
  DEFAULT_BRANCH,
  ENV_TYPES,
} from '../../constants.js';

export {
  ARGS_OPTIONS,
  COMMENT_DEFAULTS,
  COMMENT_REASONS,
  COMMENT_STATUSES,
  CONFIG_DEFAULTS,
  CONFIG_FILES,
  DEFAULT_BRANCH,
  ENV_TYPES,
};

export const DEFAULT_THRESHOLD = CONFIG_DEFAULTS.threshold;
export const DEFAULT_LCOV_PATH = CONFIG_DEFAULTS.lcovPath;
export const DEFAULT_GIT_TIMEOUT_MS = CONFIG_DEFAULTS.gitTimeoutMs;
export const DEFAULT_API_TIMEOUT_MS = CONFIG_DEFAULTS.apiTimeoutMs;
export const CURRENT_BRANCH = 'feature';
export const DEVELOP_BRANCH = 'develop';
export const RELEASE_BRANCH = 'release';
export const MISSING_BRANCH = 'missing';
export const CLI_BASE_BRANCH = 'cli-base';
export const CI_BASE_BRANCH = 'origin-main';

export const SOURCE_FILE = 'src/a.js';
export const SECOND_SOURCE_FILE = 'src/b.js';
export const NEW_SOURCE_FILE = 'src/new.js';
export const EXTRA_SOURCE_FILE = 'src/extra.js';
export const MISSING_SOURCE_FILE = 'src/missing.js';
export const README_FILE = 'README.md';

export const FULL_COVERAGE = 100;
export const EMPTY_OUTPUT = '';
export const LCOV_CONTENT = 'lcov';
export const NO_REMOTE_ERROR_MESSAGE = 'no remote';
export const PERMISSION_ERROR_MESSAGE = 'denied';
export const PERMISSION_ERROR_CODE = 'EACCES';
export const GITHUB_API_URL = 'https://api.github.com';
export const GITHUB_REPOSITORY = 'owner/repo';
export const GITHUB_SERVER_URL = 'https://github.com';
export const GITHUB_PULL_REQUEST_NUMBER = 12;
export const GITHUB_COMMENT_ID = 99;
export const GITHUB_COMMIT_SHA = 'abc123';
export const GITHUB_RUN_ID = '456';
export const GITLAB_API_URL = 'https://gitlab.example.com/api/v4';
export const GITLAB_PROJECT_ID = 'group/project';
export const GITLAB_PROJECT_URL = 'https://gitlab.example.com/group/project';
export const GITLAB_MERGE_REQUEST_IID = 34;
export const GITLAB_COMMIT_SHA = 'def456';
export const COMMENT_BODY = 'new body';

export function permissionDeniedError(message = PERMISSION_ERROR_MESSAGE) {
  const error = new Error(message);
  error.code = PERMISSION_ERROR_CODE;
  return error;
}

export function coverageRecord(path = SOURCE_FILE, lines = []) {
  return { path, lines: new Map(lines) };
}

export function changedLinesMap(entries) {
  return new Map(entries.map(([filePath, lines]) => [filePath, new Set(lines)]));
}

export function fileResult(overrides = {}) {
  return {
    filePath: SOURCE_FILE,
    changedLines: [1],
    executableLines: [1],
    coveredLines: [1],
    uncoveredLines: [],
    ...overrides,
  };
}

export function diffCoverage(overrides = {}) {
  return {
    percentage: FULL_COVERAGE,
    coveredLines: 1,
    executableLines: 1,
    files: [fileResult()],
    ...overrides,
  };
}

export function commentConfig(overrides = {}) {
  return {
    enabled: false,
    ...COMMENT_DEFAULTS,
    ...overrides,
  };
}

export function runConfig(overrides = {}) {
  const { comment, ...rest } = overrides;

  return {
    threshold: DEFAULT_THRESHOLD,
    lcovPath: DEFAULT_LCOV_PATH,
    rootDir: process.cwd(),
    failOnEmpty: false,
    exclude: CONFIG_DEFAULTS.exclude,
    gitTimeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    apiTimeoutMs: DEFAULT_API_TIMEOUT_MS,
    ...rest,
    comment: commentConfig(comment),
  };
}

export function localEnvironment(overrides = {}) {
  return {
    type: ENV_TYPES.LOCAL,
    isCI: false,
    baseBranch: null,
    ...overrides,
  };
}

export function ciEnvironment(overrides = {}) {
  return {
    type: ENV_TYPES.GITHUB,
    isCI: true,
    baseBranch: CI_BASE_BRANCH,
    ...overrides,
  };
}

export function packageJson(overrides = {}) {
  return {
    scripts: {},
    ...overrides,
  };
}
