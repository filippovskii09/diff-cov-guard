export const ENV_TYPES = {
  GITHUB: 'GITHUB',
  GITLAB: 'GITLAB',
  LOCAL: 'LOCAL',
};

export const DEFAULT_BRANCH = 'main';

export const DEFAULT_BASE_BRANCH = 'origin/main';

export const TIMEOUT_DEFAULTS = {
  gitTimeoutMs: 30000,
  apiTimeoutMs: 10000,
};

export const CONFIG_DEFAULTS = {
  threshold: 90,
  lcovPath: './coverage/lcov.info',
  exclude: [
    '**/__test__/**',
    '**/__tests__/**',
    '**/*.test.cjs',
    '**/*.test.js',
    '**/*.test.jsx',
    '**/*.test.mjs',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.cjs',
    '**/*.spec.js',
    '**/*.spec.jsx',
    '**/*.spec.mjs',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    'jest.config.cjs',
    'jest.config.js',
    'jest.config.mjs',
    'jest.config.ts',
  ],
  gitTimeoutMs: TIMEOUT_DEFAULTS.gitTimeoutMs,
  apiTimeoutMs: TIMEOUT_DEFAULTS.apiTimeoutMs,
};

export const CONFIG_LIMITS = {
  thresholdMin: 0,
  thresholdMax: 100,
  gitTimeoutMsMin: 1,
  gitTimeoutMsMax: 300000,
  apiTimeoutMsMin: 1,
  apiTimeoutMsMax: 60000,
  commentMaxFilesMin: 1,
  commentMaxFilesMax: 100,
  commentMaxLinesPerFileMin: 1,
  commentMaxLinesPerFileMax: 500,
};

export const ARGS_OPTIONS = {
  threshold: {
    type: 'string',
    short: 't',
  },
  lcov: {
    type: 'string',
    short: 'l',
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
  'git-timeout-ms': {
    type: 'string',
  },
  'api-timeout-ms': {
    type: 'string',
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
  NO_EXECUTABLE_CHANGED_LINES: 'No executable changed JS/TS lines matched coverage report.',
  LCOV_EMPTY_OR_MISSING: 'LCOV file is missing or empty.',
  NO_LCOV_MATCH: 'No LCOV records matched changed source files.',
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
