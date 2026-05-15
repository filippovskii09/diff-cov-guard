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
  help: {
    type: 'boolean',
    short: 'h',
  },
  version: {
    type: 'boolean',
    short: 'v',
  },
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
