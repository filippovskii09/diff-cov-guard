export const ENV_TYPES = {
  GITHUB: 'GITHUB',
  GITLAB: 'GITLAB',
  LOCAL: 'LOCAL',
};

export const DEFAULT_BRANCH = 'main';

export const DEFAULT_BASE_BRANCH = 'origin/main';

export const ARGS_OPTIONS = {
  threshold: {
    type: 'string',
    short: 't',
    default: '90',
  },
  lcov: {
    type: 'string',
    short: 'l',
    default: './coverage/lcov.info',
  },
  base: {
    type: 'string',
    short: 'b',
  },
  'root-dir': {
    type: 'string',
  },
  'fail-on-empty': {
    type: 'boolean',
  },
  comment: {
    type: 'boolean',
  },
  'no-comment': {
    type: 'boolean',
  },
  'comment-max-files': {
    type: 'string',
  },
  'comment-max-lines-per-file': {
    type: 'string',
  },
  'comment-fail-on-error': {
    type: 'boolean',
  },
  help: {
    type: 'boolean',
    short: 'h',
  },
  version: {
    type: 'boolean',
    short: 'v',
  },
};

export const COMMENT_MARKER = '<!-- diff-cov-guard:coverage-comment -->';

export const COMMENT_STATUSES = {
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export const COMMENT_REASONS = {
  NO_CHANGED_FILES: 'No changed files.',
  ONLY_NON_SOURCE_FILES: 'Only non-source files changed.',
  NO_EXECUTABLE_CHANGED_LINES: 'No executable changed lines.',
  LCOV_EMPTY_OR_MISSING: 'LCOV file is missing or empty.',
};

export const COMMENT_DEFAULTS = {
  maxFiles: 10,
  maxLinesPerFile: 20,
  failOnError: false,
};

export const CONFIG_FILES = {
  RC_CONFIG_FILE: '.diffcovguardrc',
  PACKAGE_JSON_FILE: 'package.json',
  PACKAGE_CONFIG_KEY: 'diffCovGuard',
};

export const EXIT_CODES = {
  SUCCESS: 0,
  FAILURE: 1,
};

export const CONSOLE_COLORS = {
  GREEN: '\u001b[32m',
  RED: '\u001b[31m',
  RESET: '\u001b[0m',
};

export const COVERAGE_SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
