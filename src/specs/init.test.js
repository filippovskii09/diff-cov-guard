import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  CONFIG_FILES,
  DEFAULT_BRANCH,
  DEFAULT_LCOV_PATH,
  DEFAULT_THRESHOLD,
  DEVELOP_BRANCH,
  LCOV_CONTENT,
  NO_REMOTE_ERROR_MESSAGE,
} from './helpers/fixtures.js';

const execFileSync = jest.fn();
const question = jest.fn();
const close = jest.fn();
const outputWrite = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({ execFileSync }));
jest.unstable_mockModule('node:readline/promises', () => ({
  createInterface: jest.fn(() => ({ question, close })),
}));
jest.unstable_mockModule('node:process', () => ({
  stdin: { isTTY: true },
  stdout: { write: outputWrite },
}));

const init = await import('../init.js');

const COMMON_COVERAGE_DIR = 'coverage';
const COMMON_LCOV_FILE = join(COMMON_COVERAGE_DIR, 'lcov.info');
const RECURSIVE_LCOV_FILE = 'nested/reports/lcov.info';
const TOO_DEEP_LCOV_FILE = 'a/b/c/d/lcov.info';
const CUSTOM_LCOV_FILE = 'custom-lcov.info';
const MISSING_LCOV_PATH = './missing.info';
const COVERAGE_SCRIPT_NAME = 'test:coverage';
const ALTERNATIVE_COVERAGE_SCRIPT_NAME = 'test:diff-coverage';
const COVERAGE_SCRIPT_COMMAND = 'npx diff-cov-guard';
const EXISTING_CONFIG = '{"threshold":1}\n';
const EXISTING_SCRIPT_COMMAND = 'existing';
const CONFIG_SCHEMA_URL =
  'https://raw.githubusercontent.com/filippovskii09/diff-cov-guard/main/diff-cov-guard.schema.json';

let tempDir;

function makeTempProject() {
  tempDir = mkdtempSync(join(tmpdir(), 'diff-cov-init-'));
  return tempDir;
}

function projectPath(cwd, filePath) {
  return join(cwd, filePath);
}

function writeProjectFile(cwd, filePath, content = '') {
  const fullPath = projectPath(cwd, filePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
  return fullPath;
}

function writePackageJson(cwd, data) {
  writeFileSync(projectPath(cwd, CONFIG_FILES.PACKAGE_JSON_FILE), JSON.stringify(data));
}

function readProjectJson(cwd, filePath) {
  return JSON.parse(readFileSync(projectPath(cwd, filePath), 'utf8'));
}

function readPackageJson(cwd) {
  return readProjectJson(cwd, CONFIG_FILES.PACKAGE_JSON_FILE);
}

function readRcConfig(cwd) {
  return readProjectJson(cwd, CONFIG_FILES.RC_CONFIG_FILE);
}

function mockAnswers(...answers) {
  for (const answer of answers) {
    question.mockResolvedValueOnce(answer);
  }
}

function remoteShowOutput(branch) {
  return [`* remote origin`, `  Fetch URL: git@example.com/repo.git`, `  HEAD branch: ${branch}`].join('\n');
}

function expectedConfig(overrides = {}) {
  return {
    threshold: DEFAULT_THRESHOLD,
    lcovPath: DEFAULT_LCOV_PATH,
    baseBranch: DEFAULT_BRANCH,
    ...overrides,
  };
}

function expectedRcConfig(overrides = {}) {
  return {
    $schema: CONFIG_SCHEMA_URL,
    ...expectedConfig(overrides),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

beforeEach(() => {
  execFileSync.mockReset();
  question.mockReset();
  close.mockReset();
  outputWrite.mockReset();
});

describe('init discovery', () => {
  test('discovers common and recursive LCOV paths while skipping missing trees', () => {
    const cwd = makeTempProject();
    writeProjectFile(cwd, COMMON_LCOV_FILE);

    expect(init.discoverLcovPath(cwd)).toBe(`./${COMMON_LCOV_FILE}`);

    rmSync(projectPath(cwd, COMMON_COVERAGE_DIR), { recursive: true, force: true });
    writeProjectFile(cwd, RECURSIVE_LCOV_FILE);

    expect(init.discoverLcovPath(cwd)).toBe(`./${RECURSIVE_LCOV_FILE}`);

    rmSync(projectPath(cwd, 'nested'), { recursive: true, force: true });
    writeProjectFile(cwd, TOO_DEEP_LCOV_FILE);
    expect(init.discoverLcovPath(cwd)).toBeNull();

    expect(init.discoverLcovPath(projectPath(cwd, 'missing'))).toBeNull();
  });

  test('discovers base branch from remote, local main, local master, and default fallback', () => {
    const cwd = makeTempProject();
    execFileSync.mockReturnValueOnce(remoteShowOutput(DEVELOP_BRANCH));
    expect(init.discoverBaseBranch(cwd)).toBe(DEVELOP_BRANCH);

    execFileSync.mockReset();
    execFileSync
      .mockImplementationOnce(() => {
        throw new Error(NO_REMOTE_ERROR_MESSAGE);
      })
      .mockReturnValueOnce('');
    expect(init.discoverBaseBranch(cwd)).toBe(DEFAULT_BRANCH);

    execFileSync.mockReset();
    execFileSync.mockReturnValueOnce('  Fetch URL: git@example.com/repo.git\n').mockReturnValueOnce('');
    expect(init.discoverBaseBranch(cwd)).toBe(DEFAULT_BRANCH);

    execFileSync.mockReset();
    execFileSync
      .mockImplementationOnce(() => {
        throw new Error(NO_REMOTE_ERROR_MESSAGE);
      })
      .mockImplementationOnce(() => {
        throw new Error('no main');
      })
      .mockReturnValueOnce('');
    expect(init.discoverBaseBranch(cwd)).toBe('master');

    execFileSync.mockReset();
    execFileSync.mockImplementation(() => {
      throw new Error('missing');
    });
    expect(init.discoverBaseBranch(cwd)).toBe(DEFAULT_BRANCH);
  });
});

describe('runInit', () => {
  test('creates rc config and default script after validation loops', async () => {
    const cwd = makeTempProject();
    const selectedThreshold = 95;
    writeProjectFile(cwd, COMMON_LCOV_FILE, LCOV_CONTENT);
    writePackageJson(cwd, { scripts: { test: 'jest' } });
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers('bad', String(selectedThreshold), MISSING_LCOV_PATH, '', '3', '1');
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(cwd);

    expect(readRcConfig(cwd)).toEqual(
      expectedRcConfig({
        threshold: selectedThreshold,
        lcovPath: DEFAULT_LCOV_PATH,
      })
    );
    expect(readPackageJson(cwd).scripts[COVERAGE_SCRIPT_NAME]).toBe(COVERAGE_SCRIPT_COMMAND);
    expect(question).toHaveBeenCalledTimes(6);
    expect(close).toHaveBeenCalled();
  });

  test('accepts absolute LCOV paths and default config format choice', async () => {
    const cwd = makeTempProject();
    const absoluteLcovPath = projectPath(cwd, CUSTOM_LCOV_FILE);
    writeFileSync(absoluteLcovPath, LCOV_CONTENT);
    writePackageJson(cwd, {});
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers(String(DEFAULT_THRESHOLD), absoluteLcovPath, '');
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(cwd);

    expect(readRcConfig(cwd)).toEqual(expectedRcConfig({ lcovPath: absoluteLcovPath }));
  });

  test('writes package config and alternative script when default script exists', async () => {
    const cwd = makeTempProject();
    writePackageJson(cwd, {
      scripts: { [COVERAGE_SCRIPT_NAME]: 'jest --coverage' },
    });
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers('', '', '2', 'maybe', 'yes');
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(cwd);

    const packageJson = readPackageJson(cwd);
    expect(packageJson[CONFIG_FILES.PACKAGE_CONFIG_KEY]).toEqual(expectedConfig());
    expect(packageJson.scripts[ALTERNATIVE_COVERAGE_SCRIPT_NAME]).toBe(COVERAGE_SCRIPT_COMMAND);
    expect(question).toHaveBeenCalledTimes(5);
  });

  test('overwrites rc config and skips conflicting script when user declines alternative', async () => {
    const cwd = makeTempProject();
    const selectedThreshold = 88;
    writeProjectFile(cwd, CONFIG_FILES.RC_CONFIG_FILE, EXISTING_CONFIG);
    writePackageJson(cwd, {
      scripts: { [COVERAGE_SCRIPT_NAME]: EXISTING_SCRIPT_COMMAND },
    });
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers(String(selectedThreshold), '', '1', 'maybe', 'yes', 'no');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(cwd);

    expect(readRcConfig(cwd)).toEqual(expectedRcConfig({ threshold: selectedThreshold }));
    expect(readPackageJson(cwd).scripts).toEqual({
      [COVERAGE_SCRIPT_NAME]: EXISTING_SCRIPT_COMMAND,
    });
    expect(question).toHaveBeenCalledTimes(6);
    expect(warn).toHaveBeenCalledWith('⚠️  Skipped script creation. Existing "test:coverage" was left untouched.');
  });

  test('skips rc overwrite and script creation when user declines both prompts', async () => {
    const cwd = makeTempProject();
    writeProjectFile(cwd, CONFIG_FILES.RC_CONFIG_FILE, EXISTING_CONFIG);
    writePackageJson(cwd, {
      scripts: { [COVERAGE_SCRIPT_NAME]: EXISTING_SCRIPT_COMMAND },
    });
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers('88', '', '1', 'no', 'no');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(cwd);

    expect(readFileSync(projectPath(cwd, CONFIG_FILES.RC_CONFIG_FILE), 'utf8')).toBe(EXISTING_CONFIG);
    expect(readPackageJson(cwd).scripts).toEqual({
      [COVERAGE_SCRIPT_NAME]: EXISTING_SCRIPT_COMMAND,
    });
    expect(warn).toHaveBeenCalledWith('⚠️  Skipped .diffcovguardrc. Existing config was left untouched.');
    expect(warn).toHaveBeenCalledWith('⚠️  Skipped script creation. Existing "test:coverage" was left untouched.');
    expect(log).toHaveBeenCalledWith('✅ Config created! Add a package script when you are ready to guard your PRs.');
  });

  test('closes the questioner when package JSON cannot be parsed', async () => {
    const cwd = makeTempProject();
    writeProjectFile(cwd, CONFIG_FILES.PACKAGE_JSON_FILE, '{');
    execFileSync.mockReturnValue(remoteShowOutput(DEFAULT_BRANCH));
    mockAnswers(String(DEFAULT_THRESHOLD), '', '2');
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(init.runInit(cwd)).rejects.toThrow('package.json is not valid JSON');
    expect(close).toHaveBeenCalled();
  });
});
