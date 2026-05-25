import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { loadConfig } from '../config.js';
import {
  CLI_BASE_BRANCH,
  COMMENT_DEFAULTS,
  CONFIG_DEFAULTS,
  CONFIG_FILES,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_LCOV_PATH,
  DEFAULT_THRESHOLD,
  DEVELOP_BRANCH,
  commentConfig,
} from './helpers/fixtures.js';

const PACKAGE_CONFIG = {
  threshold: 70,
  lcovPath: './pkg.info',
  exclude: ['pkg/**/*.test.js'],
  baseBranch: 'pkg-base',
  rootDir: 'pkg-root',
  failOnEmpty: false,
  gitTimeoutMs: 111,
  apiTimeoutMs: 222,
  comment: commentConfig({ maxFiles: 3, maxLinesPerFile: 4 }),
};
const RC_CONFIG = {
  threshold: 80,
  lcovPath: './rc.info',
  exclude: ['rc/**/*.test.js'],
  baseBranch: 'rc-base',
  rootDir: 'rc-root',
  failOnEmpty: true,
  gitTimeoutMs: 333,
  apiTimeoutMs: 444,
  comment: commentConfig({ enabled: true, maxFiles: 5, maxLinesPerFile: 6, failOnError: true }),
};
const CLI_LCOV_PATH = './cli.info';
const CLI_CONFIG = {
  threshold: '95',
  lcov: CLI_LCOV_PATH,
  base: CLI_BASE_BRANCH,
  'root-dir': 'cli-root',
  'fail-on-empty': false,
  'git-timeout-ms': '555',
  'api-timeout-ms': '666',
  'no-comment': true,
  'comment-max-files': '7',
  'comment-max-lines-per-file': '8',
  'comment-fail-on-error': false,
};
let tempDir;
const originalCwd = process.cwd();

function makeTempProject() {
  tempDir = mkdtempSync(join(tmpdir(), 'diff-cov-config-'));
  process.chdir(tempDir);
  return tempDir;
}

function writeProjectJson(fileName, data) {
  writeFileSync(join(process.cwd(), fileName), JSON.stringify(data));
}

afterEach(() => {
  process.chdir(originalCwd);
  jest.restoreAllMocks();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('config', () => {
  test('uses defaults when no config source exists', () => {
    makeTempProject();

    expect(loadConfig()).toEqual({
      threshold: DEFAULT_THRESHOLD,
      lcovPath: DEFAULT_LCOV_PATH,
      exclude: CONFIG_DEFAULTS.exclude,
      baseBranch: undefined,
      rootDir: process.cwd(),
      failOnEmpty: false,
      gitTimeoutMs: DEFAULT_GIT_TIMEOUT_MS,
      apiTimeoutMs: DEFAULT_API_TIMEOUT_MS,
      comment: commentConfig(),
    });
  });

  test('applies priority CLI over rc config over package config over defaults', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.PACKAGE_JSON_FILE, {
      [CONFIG_FILES.PACKAGE_CONFIG_KEY]: PACKAGE_CONFIG,
    });
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, RC_CONFIG);

    expect(loadConfig(CLI_CONFIG)).toEqual({
      threshold: Number(CLI_CONFIG.threshold),
      lcovPath: CLI_CONFIG.lcov,
      exclude: RC_CONFIG.exclude,
      baseBranch: CLI_CONFIG.base,
      rootDir: resolve(process.cwd(), CLI_CONFIG['root-dir']),
      failOnEmpty: CLI_CONFIG['fail-on-empty'],
      gitTimeoutMs: Number(CLI_CONFIG['git-timeout-ms']),
      apiTimeoutMs: Number(CLI_CONFIG['api-timeout-ms']),
      comment: {
        enabled: false,
        maxFiles: Number(CLI_CONFIG['comment-max-files']),
        maxLinesPerFile: Number(CLI_CONFIG['comment-max-lines-per-file']),
        failOnError: CLI_CONFIG['comment-fail-on-error'],
      },
    });
  });

  test('uses rc config values when CLI args are empty', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, RC_CONFIG);

    expect(loadConfig({})).toEqual({
      threshold: RC_CONFIG.threshold,
      lcovPath: RC_CONFIG.lcovPath,
      exclude: RC_CONFIG.exclude,
      baseBranch: RC_CONFIG.baseBranch,
      rootDir: resolve(process.cwd(), RC_CONFIG.rootDir),
      failOnEmpty: RC_CONFIG.failOnEmpty,
      gitTimeoutMs: RC_CONFIG.gitTimeoutMs,
      apiTimeoutMs: RC_CONFIG.apiTimeoutMs,
      comment: RC_CONFIG.comment,
    });
  });

  test('extends built-in excludes only when configured explicitly', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, {
      exclude: ['src/generated/**', CONFIG_DEFAULTS.exclude[0]],
      extendDefaultExclude: true,
    });

    expect(loadConfig().exclude).toEqual([...CONFIG_DEFAULTS.exclude, 'src/generated/**']);
  });

  test('enables comments by default only in pull request and merge request CI contexts', () => {
    makeTempProject();

    expect(loadConfig({}, { type: 'GITHUB', isCI: true, pullRequestNumber: 12 })).toMatchObject({
      comment: {
        enabled: true,
      },
    });
    expect(loadConfig({}, { type: 'GITLAB', isCI: true, mergeRequestIid: '34' })).toMatchObject({
      comment: {
        enabled: true,
      },
    });
    expect(loadConfig({}, { type: 'GITHUB', isCI: true })).toMatchObject({
      comment: {
        enabled: false,
      },
    });
    expect(loadConfig({}, { type: 'GITLAB', isCI: true })).toMatchObject({
      comment: {
        enabled: false,
      },
    });
    expect(loadConfig({}, { type: 'CUSTOM', isCI: true })).toMatchObject({
      comment: {
        enabled: false,
      },
    });
  });

  test('allows explicit comment enablement and disablement to override CI defaults', () => {
    makeTempProject();
    const pullRequestEnv = { type: 'GITHUB', isCI: true, pullRequestNumber: 12 };

    expect(loadConfig({ 'no-comment': true }, pullRequestEnv).comment.enabled).toBe(false);
    expect(loadConfig({ comment: false }, pullRequestEnv).comment.enabled).toBe(false);
    expect(loadConfig({ comment: true }).comment.enabled).toBe(true);
  });

  test('merges nested comment config with rc values overriding package values', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.PACKAGE_JSON_FILE, {
      [CONFIG_FILES.PACKAGE_CONFIG_KEY]: {
        comment: {
          enabled: true,
          maxFiles: 3,
          maxLinesPerFile: 4,
          failOnError: COMMENT_DEFAULTS.failOnError,
        },
      },
    });
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, {
      comment: {
        maxFiles: 5,
      },
    });

    expect(loadConfig()).toMatchObject({
      comment: {
        enabled: true,
        maxFiles: 5,
        maxLinesPerFile: 4,
        failOnError: COMMENT_DEFAULTS.failOnError,
      },
    });
  });

  test('supports baseBranch, rootDir, and failOnEmpty CLI aliases', () => {
    makeTempProject();
    const rootDir = 'src';
    const cliArgs = {
      baseBranch: DEVELOP_BRANCH,
      rootDir,
      failOnEmpty: true,
    };

    expect(loadConfig(cliArgs)).toMatchObject({
      baseBranch: DEVELOP_BRANCH,
      rootDir: resolve(process.cwd(), rootDir),
      failOnEmpty: cliArgs.failOnEmpty,
    });
  });

  test('warns and falls back to defaults when a config file has invalid JSON', () => {
    makeTempProject();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const filePath = join(process.cwd(), CONFIG_FILES.RC_CONFIG_FILE);
    writeFileSync(filePath, '{');

    expect(loadConfig()).toEqual({
      threshold: DEFAULT_THRESHOLD,
      lcovPath: DEFAULT_LCOV_PATH,
      exclude: CONFIG_DEFAULTS.exclude,
      baseBranch: undefined,
      rootDir: process.cwd(),
      failOnEmpty: false,
      gitTimeoutMs: DEFAULT_GIT_TIMEOUT_MS,
      apiTimeoutMs: DEFAULT_API_TIMEOUT_MS,
      comment: commentConfig(),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Failed to read ${CONFIG_FILES.RC_CONFIG_FILE}`));
  });

  test.each([
    ['threshold', { threshold: '101' }, 'threshold'],
    ['threshold', { threshold: 'abc' }, 'threshold'],
    ['threshold type', { threshold: null }, 'threshold'],
    ['threshold empty', { threshold: ' ' }, 'threshold'],
    ['threshold non-finite', { threshold: 'Infinity' }, 'threshold'],
    ['git timeout', { 'git-timeout-ms': '0' }, 'gitTimeoutMs'],
    ['git timeout', { 'git-timeout-ms': '300001' }, 'gitTimeoutMs'],
    ['api timeout', { 'api-timeout-ms': '0' }, 'apiTimeoutMs'],
    ['api timeout', { 'api-timeout-ms': '60001' }, 'apiTimeoutMs'],
    ['comment max files', { 'comment-max-files': '101' }, 'comment.maxFiles'],
    ['comment max lines', { 'comment-max-lines-per-file': '501' }, 'comment.maxLinesPerFile'],
    ['comment max files integer', { 'comment-max-files': '1.5' }, 'comment.maxFiles'],
    ['comment max files type', { 'comment-max-files': null }, 'comment.maxFiles'],
    ['comment enabled', { comment: 'true' }, 'comment.enabled'],
    ['comment failure behavior', { 'comment-fail-on-error': 'true' }, 'comment.failOnError'],
    ['fail-on-empty type', { failOnEmpty: null }, 'failOnEmpty'],
    ['LCOV path', { lcov: '' }, 'lcovPath'],
    ['base branch', { base: '' }, 'baseBranch'],
    ['root directory', { 'root-dir': '' }, 'rootDir'],
  ])('rejects invalid %s values', (_label, cliArgs, configName) => {
    makeTempProject();

    expect(() => loadConfig(cliArgs)).toThrow(`Invalid config value "${configName}"`);
  });

  test('accepts inclusive numeric configuration boundaries', () => {
    makeTempProject();

    expect(
      loadConfig({
        threshold: '0',
        'git-timeout-ms': '1',
        'api-timeout-ms': '60000',
        'comment-max-files': '1',
        'comment-max-lines-per-file': '500',
      })
    ).toMatchObject({
      threshold: 0,
      gitTimeoutMs: 1,
      apiTimeoutMs: 60000,
      comment: {
        maxFiles: 1,
        maxLinesPerFile: 500,
      },
    });
  });

  test('rejects invalid file config values after precedence is applied', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, {
      threshold: 80,
      comment: {
        maxFiles: 0,
      },
    });

    expect(() => loadConfig()).toThrow('Invalid config value "comment.maxFiles"');
  });

  test('rejects invalid exclude config values', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, {
      exclude: ['src/*.test.js', ''],
    });

    expect(() => loadConfig()).toThrow('Invalid config value "exclude"');
  });

  test('rejects invalid extendDefaultExclude values', () => {
    makeTempProject();
    writeProjectJson(CONFIG_FILES.RC_CONFIG_FILE, {
      extendDefaultExclude: 'true',
    });

    expect(() => loadConfig()).toThrow('Invalid config value "extendDefaultExclude"');
  });
});
