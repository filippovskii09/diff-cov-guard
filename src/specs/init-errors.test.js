import { describe, expect, jest, test } from '@jest/globals';

import {
  CONFIG_FILES,
  DEFAULT_BRANCH,
  DEFAULT_THRESHOLD,
  PERMISSION_ERROR_CODE,
  PERMISSION_ERROR_MESSAGE,
  permissionDeniedError,
} from './helpers/fixtures.js';

const REPO_ROOT = '/repo';
const RC_CONFIG_PATH = `${REPO_ROOT}/${CONFIG_FILES.RC_CONFIG_FILE}`;
const PACKAGE_JSON_PATH = `${REPO_ROOT}/${CONFIG_FILES.PACKAGE_JSON_FILE}`;
const PACKAGE_CONFIG_KEY_FRAGMENT = '"diffCovGuard"';
const PACKAGE_READ_PERMISSION_ERROR = `Permission denied to read ${CONFIG_FILES.PACKAGE_JSON_FILE}`;
const RC_WRITE_PERMISSION_ERROR = `Permission denied to write ${CONFIG_FILES.RC_CONFIG_FILE}`;

function mockAnswers(...answers) {
  return jest.fn().mockImplementation(() => Promise.resolve(answers.shift() ?? ''));
}

async function importInitWithMocks({
  stdin = { isTTY: true },
  readFileSync = jest.fn(),
  existsSync = jest.fn(() => false),
  readdirSync = jest.fn(() => []),
  readFile = jest.fn(),
  writeFile = jest.fn(),
  question = jest.fn(),
  execSync = jest.fn(() => `${DEFAULT_BRANCH}\n`),
} = {}) {
  jest.resetModules();
  jest.unstable_mockModule('node:fs', () => ({
    existsSync,
    readdirSync,
    readFileSync,
  }));
  jest.unstable_mockModule('node:fs/promises', () => ({
    readFile,
    writeFile,
  }));
  jest.unstable_mockModule('node:child_process', () => ({ execSync }));
  jest.unstable_mockModule('node:readline/promises', () => ({
    createInterface: jest.fn(() => ({ question, close: jest.fn() })),
  }));
  jest.unstable_mockModule('node:process', () => ({
    stdin,
    stdout: { write: jest.fn() },
  }));

  return import('../init.js');
}

function packageJsonExists(path) {
  return path.endsWith(CONFIG_FILES.PACKAGE_JSON_FILE);
}

describe('init error boundaries', () => {
  test('uses non-TTY stdin answers and creates package JSON when it is missing', async () => {
    const writeFile = jest.fn();
    const stdinAnswers = '\n\n2\n';
    const init = await importInitWithMocks({
      stdin: { isTTY: false },
      readFileSync: jest.fn((path) => (path === 0 ? stdinAnswers : '')),
      existsSync: jest.fn(() => false),
      writeFile,
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(REPO_ROOT);

    expect(writeFile).toHaveBeenCalledWith(PACKAGE_JSON_PATH, expect.stringContaining(PACKAGE_CONFIG_KEY_FRAGMENT));
  });

  test('uses empty strings after non-TTY stdin answers are exhausted', async () => {
    const writeFile = jest.fn();
    const init = await importInitWithMocks({
      stdin: { isTTY: false },
      readFileSync: jest.fn((path) => (path === 0 ? '' : '')),
      existsSync: jest.fn(() => false),
      writeFile,
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await init.runInit(REPO_ROOT);

    expect(writeFile).toHaveBeenCalledWith(RC_CONFIG_PATH, expect.any(String));
    expect(writeFile).toHaveBeenCalledWith(PACKAGE_JSON_PATH, expect.any(String));
  });

  test('maps package read permission errors to a friendly message', async () => {
    const init = await importInitWithMocks({
      existsSync: jest.fn(packageJsonExists),
      readFile: jest.fn(() => {
        throw permissionDeniedError(PERMISSION_ERROR_MESSAGE);
      }),
      question: mockAnswers(String(DEFAULT_THRESHOLD), '', '2'),
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(init.runInit(REPO_ROOT)).rejects.toThrow(PACKAGE_READ_PERMISSION_ERROR);
  });

  test('rethrows unexpected package read errors', async () => {
    const readError = new Error('disk failed');
    const init = await importInitWithMocks({
      existsSync: jest.fn(packageJsonExists),
      readFile: jest.fn(() => {
        throw readError;
      }),
      question: mockAnswers(String(DEFAULT_THRESHOLD), '', '2'),
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(init.runInit(REPO_ROOT)).rejects.toThrow(readError.message);
  });

  test('maps write permission errors and rethrows unexpected write errors', async () => {
    const permissionInit = await importInitWithMocks({
      writeFile: jest.fn(() => {
        const error = permissionDeniedError(PERMISSION_ERROR_MESSAGE);
        expect(error.code).toBe(PERMISSION_ERROR_CODE);
        throw error;
      }),
      question: mockAnswers(String(DEFAULT_THRESHOLD), '', '1'),
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(permissionInit.runInit(REPO_ROOT)).rejects.toThrow(RC_WRITE_PERMISSION_ERROR);

    const writeError = new Error('write failed');
    const unexpectedInit = await importInitWithMocks({
      writeFile: jest.fn(() => {
        throw writeError;
      }),
      question: mockAnswers(String(DEFAULT_THRESHOLD), '', '1'),
    });

    await expect(unexpectedInit.runInit(REPO_ROOT)).rejects.toThrow(writeError.message);
  });
});
