import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { ARGS_OPTIONS, COMMENT_DEFAULTS, CONFIG_FILES, ENV_TYPES } from './constants.js';

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

function parseOptionalNumber(value, fallback) {
  return value === undefined ? fallback : Number(value);
}

function resolveCommentEnabled(cliArgs, fileConfigs, env) {
  if (cliArgs.comment !== undefined) {
    return cliArgs.comment;
  }

  if (cliArgs['no-comment']) {
    return false;
  }

  if (fileConfigs.comment?.enabled !== undefined) {
    return fileConfigs.comment.enabled;
  }

  return env.isCI && (env.type === ENV_TYPES.GITHUB || env.type === ENV_TYPES.GITLAB);
}

function resolveCommentConfig(cliArgs, fileConfigs, env) {
  return {
    enabled: resolveCommentEnabled(cliArgs, fileConfigs, env),
    maxFiles: parseOptionalNumber(
      cliArgs['comment-max-files'],
      fileConfigs.comment?.maxFiles ?? COMMENT_DEFAULTS.maxFiles
    ),
    maxLinesPerFile: parseOptionalNumber(
      cliArgs['comment-max-lines-per-file'],
      fileConfigs.comment?.maxLinesPerFile ?? COMMENT_DEFAULTS.maxLinesPerFile
    ),
    failOnError: Boolean(
      cliArgs['comment-fail-on-error'] ?? fileConfigs.comment?.failOnError ?? COMMENT_DEFAULTS.failOnError
    ),
  };
}

function resolveConfig(cliArgs, fileConfigs, env) {
  return {
    threshold: Number(cliArgs.threshold ?? fileConfigs.threshold ?? ARGS_OPTIONS.threshold.default),
    lcovPath: cliArgs.lcov ?? fileConfigs.lcovPath ?? ARGS_OPTIONS.lcov.default,
    baseBranch: cliArgs.baseBranch ?? cliArgs.base ?? fileConfigs.baseBranch,
    rootDir: resolve(cliArgs.rootDir ?? cliArgs['root-dir'] ?? fileConfigs.rootDir ?? process.cwd()),
    failOnEmpty: Boolean(cliArgs.failOnEmpty ?? cliArgs['fail-on-empty'] ?? fileConfigs.failOnEmpty ?? false),
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
