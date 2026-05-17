import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { loadConfig } from '../config.js';
import {
  CLI_BASE_BRANCH,
  COMMENT_DEFAULTS,
  CONFIG_FILES,
  DEFAULT_LCOV_PATH,
  DEFAULT_THRESHOLD,
  DEVELOP_BRANCH,
  commentConfig,
} from './helpers/fixtures.js';

const PACKAGE_CONFIG = {
  threshold: 70,
  lcovPath: './pkg.info',
  baseBranch: 'pkg-base',
  rootDir: 'pkg-root',
  failOnEmpty: false,
  comment: commentConfig({ maxFiles: 3, maxLinesPerFile: 4 }),
};
const RC_CONFIG = {
  threshold: 80,
  lcovPath: './rc.info',
  baseBranch: 'rc-base',
  rootDir: 'rc-root',
  failOnEmpty: true,
  comment: commentConfig({ enabled: true, maxFiles: 5, maxLinesPerFile: 6, failOnError: true }),
};
const CLI_LCOV_PATH = './cli.info';
const CLI_CONFIG = {
  threshold: '95',
  lcov: CLI_LCOV_PATH,
  base: CLI_BASE_BRANCH,
  'root-dir': 'cli-root',
  'fail-on-empty': false,
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
      baseBranch: undefined,
      rootDir: process.cwd(),
      failOnEmpty: false,
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
      baseBranch: CLI_CONFIG.base,
      rootDir: resolve(process.cwd(), CLI_CONFIG['root-dir']),
      failOnEmpty: CLI_CONFIG['fail-on-empty'],
      comment: {
        enabled: false,
        maxFiles: Number(CLI_CONFIG['comment-max-files']),
        maxLinesPerFile: Number(CLI_CONFIG['comment-max-lines-per-file']),
        failOnError: CLI_CONFIG['comment-fail-on-error'],
      },
    });
  });

  test('enables comments by default in supported CI environments', () => {
    makeTempProject();

    expect(loadConfig({}, { type: 'GITHUB', isCI: true })).toMatchObject({
      comment: {
        enabled: true,
      },
    });
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
      baseBranch: undefined,
      rootDir: process.cwd(),
      failOnEmpty: false,
      comment: commentConfig(),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Failed to read ${CONFIG_FILES.RC_CONFIG_FILE}`));
  });
});
