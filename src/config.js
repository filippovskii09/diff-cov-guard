import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { COMMENT_DEFAULTS, CONFIG_DEFAULTS, CONFIG_FILES, CONFIG_LIMITS, ENV_TYPES } from './constants.js';

function readJsonFile(filePath, label) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Failed to read ${label} at ${filePath}: ${error.message}`);
    return null;
  }
}

function loadFileConfig(cwd) {
  return readJsonFile(join(cwd, CONFIG_FILES.RC_CONFIG_FILE), CONFIG_FILES.RC_CONFIG_FILE) ?? {};
}

function loadPackageConfig(cwd) {
  const packageJson = readJsonFile(join(cwd, CONFIG_FILES.PACKAGE_JSON_FILE), CONFIG_FILES.PACKAGE_JSON_FILE);

  return packageJson?.[CONFIG_FILES.PACKAGE_CONFIG_KEY] ?? {};
}

function assertInRange(name, number, min, max) {
  if (number < min || number > max) {
    throw new Error(`Invalid config value "${name}": expected a value from ${min} to ${max}.`);
  }
}

function parseNumberValue(name, value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`Invalid config value "${name}": expected a number.`);
  }

  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`Invalid config value "${name}": expected a number.`);
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid config value "${name}": expected a finite number.`);
  }

  return number;
}

function parseOptionalFiniteNumber(name, value, fallback, min, max) {
  if (value === undefined) {
    return fallback;
  }

  const number = parseNumberValue(name, value);
  assertInRange(name, number, min, max);

  return number;
}

function parseOptionalInteger(name, value, fallback, min, max) {
  if (value === undefined) {
    return fallback;
  }

  const number = parseNumberValue(name, value);

  if (!Number.isInteger(number)) {
    throw new Error(`Invalid config value "${name}": expected an integer.`);
  }

  assertInRange(name, number, min, max);

  return number;
}

function parseOptionalBoolean(name, value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Invalid config value "${name}": expected a boolean.`);
  }

  return value;
}

function parseOptionalString(name, value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid config value "${name}": expected a non-empty string.`);
  }

  return value;
}

function parseOptionalStringArray(name, value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`Invalid config value "${name}": expected an array of non-empty strings.`);
  }

  return value;
}

function resolveCommentEnabled(cliArgs, fileConfigs, env) {
  if (cliArgs.comment !== undefined) {
    return parseOptionalBoolean('comment.enabled', cliArgs.comment, undefined);
  }

  if (cliArgs['no-comment']) {
    return false;
  }

  if (fileConfigs.comment?.enabled !== undefined) {
    return parseOptionalBoolean('comment.enabled', fileConfigs.comment.enabled, undefined);
  }

  return env.isCI && (env.type === ENV_TYPES.GITHUB || env.type === ENV_TYPES.GITLAB);
}

function resolveCommentConfig(cliArgs, fileConfigs, env) {
  return {
    enabled: resolveCommentEnabled(cliArgs, fileConfigs, env),
    maxFiles: parseOptionalInteger(
      'comment.maxFiles',
      cliArgs['comment-max-files'] ?? fileConfigs.comment?.maxFiles,
      COMMENT_DEFAULTS.maxFiles,
      CONFIG_LIMITS.commentMaxFilesMin,
      CONFIG_LIMITS.commentMaxFilesMax
    ),
    maxLinesPerFile: parseOptionalInteger(
      'comment.maxLinesPerFile',
      cliArgs['comment-max-lines-per-file'] ?? fileConfigs.comment?.maxLinesPerFile,
      COMMENT_DEFAULTS.maxLinesPerFile,
      CONFIG_LIMITS.commentMaxLinesPerFileMin,
      CONFIG_LIMITS.commentMaxLinesPerFileMax
    ),
    failOnError: parseOptionalBoolean(
      'comment.failOnError',
      cliArgs['comment-fail-on-error'] ?? fileConfigs.comment?.failOnError,
      COMMENT_DEFAULTS.failOnError
    ),
  };
}

function resolveConfig(cliArgs, fileConfigs, env) {
  const lcovPath = parseOptionalString('lcovPath', cliArgs.lcov ?? fileConfigs.lcovPath, CONFIG_DEFAULTS.lcovPath);
  const baseBranch = parseOptionalString(
    'baseBranch',
    cliArgs.baseBranch ?? cliArgs.base ?? fileConfigs.baseBranch,
    undefined
  );
  const rootDir = parseOptionalString(
    'rootDir',
    cliArgs.rootDir ?? cliArgs['root-dir'] ?? fileConfigs.rootDir,
    process.cwd()
  );

  return {
    threshold: parseOptionalFiniteNumber(
      'threshold',
      cliArgs.threshold ?? fileConfigs.threshold,
      CONFIG_DEFAULTS.threshold,
      CONFIG_LIMITS.thresholdMin,
      CONFIG_LIMITS.thresholdMax
    ),
    lcovPath,
    baseBranch,
    rootDir: resolve(rootDir),
    failOnEmpty: parseOptionalBoolean(
      'failOnEmpty',
      cliArgs.failOnEmpty ?? cliArgs['fail-on-empty'] ?? fileConfigs.failOnEmpty,
      false
    ),
    exclude: parseOptionalStringArray('exclude', fileConfigs.exclude, CONFIG_DEFAULTS.exclude),
    gitTimeoutMs: parseOptionalInteger(
      'gitTimeoutMs',
      cliArgs['git-timeout-ms'] ?? fileConfigs.gitTimeoutMs,
      CONFIG_DEFAULTS.gitTimeoutMs,
      CONFIG_LIMITS.gitTimeoutMsMin,
      CONFIG_LIMITS.gitTimeoutMsMax
    ),
    apiTimeoutMs: parseOptionalInteger(
      'apiTimeoutMs',
      cliArgs['api-timeout-ms'] ?? fileConfigs.apiTimeoutMs,
      CONFIG_DEFAULTS.apiTimeoutMs,
      CONFIG_LIMITS.apiTimeoutMsMin,
      CONFIG_LIMITS.apiTimeoutMsMax
    ),
    comment: resolveCommentConfig(cliArgs, fileConfigs, env),
  };
}

export function loadConfig(cliArgs = {}, env = { type: ENV_TYPES.LOCAL, isCI: false }) {
  const cwd = process.cwd();
  const packageConfig = loadPackageConfig(cwd);
  const fileConfig = loadFileConfig(cwd);

  const fileConfigs = {
    ...packageConfig,
    ...fileConfig,
    comment: {
      ...packageConfig.comment,
      ...fileConfig.comment,
    },
  };

  return resolveConfig(cliArgs, fileConfigs, env);
}
