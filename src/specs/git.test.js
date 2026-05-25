import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  DEFAULT_BRANCH,
  DEVELOP_BRANCH,
  EMPTY_OUTPUT,
  EXTRA_SOURCE_FILE,
  MISSING_BRANCH,
  NEW_SOURCE_FILE,
  NO_REMOTE_ERROR_MESSAGE,
  README_FILE,
  RELEASE_BRANCH,
  SOURCE_FILE,
} from './helpers/fixtures.js';

const spawn = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  spawn,
}));

const git = await import('../git.js');

class GitChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.kill = jest.fn((signal) => {
      this.emit('close', null, signal);
      return true;
    });
  }
}

function remoteShowOutput(branch) {
  return [`* remote origin`, `  Fetch URL: git@example.com/repo.git`, `  HEAD branch: ${branch}`].join('\n');
}

function fetchCall(branch) {
  return [
    'git',
    ['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`, '--quiet'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  ];
}

function checkRefFormatCall(branch) {
  return ['git', ['check-ref-format', '--branch', branch], { stdio: ['ignore', 'pipe', 'pipe'] }];
}

function setOriginHeadCall(branch) {
  return ['git', ['remote', 'set-head', 'origin', branch], { stdio: ['ignore', 'pipe', 'pipe'] }];
}

function diffFixture() {
  return [
    `diff --git a/${SOURCE_FILE} b/${SOURCE_FILE}`,
    `+++ b/${SOURCE_FILE}`,
    '@@ -1,0 +1,2 @@',
    '@@ -9 +12 @@',
    `diff --git a/${EXTRA_SOURCE_FILE} b/${EXTRA_SOURCE_FILE}`,
    `+++ b/${EXTRA_SOURCE_FILE}`,
    '@@ -0,0 +20,2 @@',
    `diff --git a/${NEW_SOURCE_FILE} b/${NEW_SOURCE_FILE}`,
    `+++ b/${NEW_SOURCE_FILE}`,
    '@@ -0,0 +3,1 @@',
    '@@ malformed @@',
  ].join('\n');
}

function mockGitProcess({ stdout = EMPTY_OUTPUT, stderr = EMPTY_OUTPUT, code = 0, stdoutChunks = null }) {
  const child = new GitChild();
  const chunks = stdoutChunks ?? [stdout];

  spawn.mockImplementationOnce(() => {
    queueMicrotask(() => {
      for (const chunk of chunks) {
        child.stdout.write(chunk);
      }

      child.stdout.end();
      child.stderr.end(stderr);
      child.emit('close', code, null);
    });

    return child;
  });

  return child;
}

beforeEach(() => {
  spawn.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('git', () => {
  test('resolves remote default branch with fallback for empty output and errors', async () => {
    mockGitProcess({ stdout: remoteShowOutput(DEFAULT_BRANCH) });
    await expect(git.getRemoteDefaultBranch()).resolves.toBe(DEFAULT_BRANCH);

    mockGitProcess({ stdout: '\n' });
    await expect(git.getRemoteDefaultBranch()).resolves.toBe(DEFAULT_BRANCH);

    mockGitProcess({ stderr: NO_REMOTE_ERROR_MESSAGE, code: 1 });
    await expect(git.getRemoteDefaultBranch()).resolves.toBe(DEFAULT_BRANCH);
  });

  test('fetches branch successfully and retries by setting origin head once', async () => {
    mockGitProcess({});
    mockGitProcess({});
    await expect(git.fetchBranch(DEVELOP_BRANCH)).resolves.toBe(`origin/${DEVELOP_BRANCH}`);
    expect(spawn.mock.calls).toEqual([checkRefFormatCall(DEVELOP_BRANCH), fetchCall(DEVELOP_BRANCH)]);

    spawn.mockReset();
    mockGitProcess({});
    mockGitProcess({ stderr: 'fetch failed', code: 1 });
    mockGitProcess({});
    mockGitProcess({});

    await git.fetchBranch(RELEASE_BRANCH);

    expect(spawn.mock.calls).toEqual([
      checkRefFormatCall(RELEASE_BRANCH),
      fetchCall(RELEASE_BRANCH),
      setOriginHeadCall(RELEASE_BRANCH),
      fetchCall(RELEASE_BRANCH),
    ]);
  });

  test('fetches normalized remote branch while preserving remote diff refs', async () => {
    mockGitProcess({});
    mockGitProcess({});
    await expect(git.fetchBranch(`origin/${DEVELOP_BRANCH}`)).resolves.toBe(`origin/${DEVELOP_BRANCH}`);
    expect(spawn.mock.calls).toEqual([checkRefFormatCall(DEVELOP_BRANCH), fetchCall(DEVELOP_BRANCH)]);

    spawn.mockReset();
    mockGitProcess({});
    mockGitProcess({});

    await expect(git.fetchBranch(`refs/remotes/origin/${RELEASE_BRANCH}`)).resolves.toBe(
      `refs/remotes/origin/${RELEASE_BRANCH}`
    );
    expect(spawn.mock.calls).toEqual([checkRefFormatCall(RELEASE_BRANCH), fetchCall(RELEASE_BRANCH)]);

    spawn.mockReset();
    mockGitProcess({});
    mockGitProcess({});

    await expect(git.fetchBranch(`refs/heads/${DEVELOP_BRANCH}`)).resolves.toBe(`origin/${DEVELOP_BRANCH}`);
    expect(spawn.mock.calls).toEqual([checkRefFormatCall(DEVELOP_BRANCH), fetchCall(DEVELOP_BRANCH)]);
  });

  test('throws when fetch retry fails with stderr context', async () => {
    mockGitProcess({});
    mockGitProcess({ stderr: 'failed once', code: 1 });
    mockGitProcess({ stderr: 'failed twice', code: 1 });

    const promise = git.fetchBranch(MISSING_BRANCH);

    await expect(promise).rejects.toThrow(`Failed to fetch ${MISSING_BRANCH}: Git command failed`);
    await expect(promise).rejects.toThrow('failed twice');
  });

  test('rejects invalid branch refs before fetching', async () => {
    const invalidBranch = 'bad branch';
    mockGitProcess({ stderr: 'fatal: invalid ref', code: 1 });

    await expect(git.fetchBranch(invalidBranch)).rejects.toThrow(`Invalid branch/ref "${invalidBranch}"`);

    expect(spawn.mock.calls).toEqual([checkRefFormatCall(invalidBranch)]);
  });

  test('lists changed files and reports git errors with stderr context', async () => {
    const changedFiles = [SOURCE_FILE, 'src/file with spaces [x] #ф.js', README_FILE];
    mockGitProcess({ stdout: `${changedFiles.join('\0')}\0` });
    await expect(git.getChangedFiles(DEFAULT_BRANCH)).resolves.toEqual(changedFiles);
    expect(spawn).toHaveBeenCalledWith('git', ['diff', '--name-only', '-z', `${DEFAULT_BRANCH}...HEAD`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    mockGitProcess({ stdout: '' });
    await expect(git.getChangedFiles(DEFAULT_BRANCH)).resolves.toEqual([]);

    mockGitProcess({ stderr: 'bad diff', code: 1 });
    const promise = git.getChangedFiles(DEFAULT_BRANCH);

    await expect(promise).rejects.toThrow('Failed to get changed files:');
    await expect(promise).rejects.toThrow('bad diff');
    await expect(promise).rejects.not.toThrow('shallow clone');
  });

  test('explains missing merge base caused by shallow CI history for changed files', async () => {
    mockGitProcess({ stderr: 'fatal: origin/main...HEAD: no merge base', code: 1 });

    const promise = git.getChangedFiles(DEFAULT_BRANCH);

    await expect(promise).rejects.toThrow('No merge base found. This usually means CI uses a shallow clone.');
    await expect(promise).rejects.toThrow('Set GIT_DEPTH: 0 or fetch full history before running diff-cov-guard.');
  });

  test('parses streamed changed lines across files and hunk shapes', async () => {
    const changedFiles = [SOURCE_FILE, NEW_SOURCE_FILE];
    mockGitProcess({ stdout: diffFixture() });

    const result = await git.getChangedLines(DEFAULT_BRANCH, changedFiles);

    expect([...result.get(SOURCE_FILE)]).toEqual([1, 2, 12]);
    expect([...result.get(EXTRA_SOURCE_FILE)]).toEqual([20, 21]);
    expect([...result.get(NEW_SOURCE_FILE)]).toEqual([3]);
    expect(spawn).toHaveBeenCalledWith(
      'git',
      ['diff', '--unified=0', `${DEFAULT_BRANCH}...HEAD`, '--', ...changedFiles],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  });

  test('parses CRLF chunks when hunk headers are split across stream chunks', async () => {
    const changedFiles = [SOURCE_FILE];
    mockGitProcess({
      stdoutChunks: [`+++ b/${SOURCE_FILE}\r\n@@ -1,0 `, '+1,2 @@\r\n@@ malformed @@\r\n'],
    });

    const result = await git.getChangedLines(DEFAULT_BRANCH, changedFiles);

    expect([...result.get(SOURCE_FILE)]).toEqual([1, 2]);
  });

  test('ignores deletion-only and malformed added-side hunk ranges', async () => {
    mockGitProcess({
      stdout: [
        `+++ b/${SOURCE_FILE}`,
        '@@ -1 + @@',
        '@@ -2 +x,2 @@',
        '@@ -3 +3,x @@',
        '@@ -4 +4,0 @@',
        '@@ -5 +5,1 @@',
      ].join('\n'),
    });

    const result = await git.getChangedLines(DEFAULT_BRANCH, [SOURCE_FILE]);

    expect([...result.get(SOURCE_FILE)]).toEqual([5]);
  });

  test('returns initialized changed lines for zero files and wraps parser errors', async () => {
    await expect(git.getChangedLines(DEFAULT_BRANCH, [])).resolves.toEqual(new Map());
    expect(spawn).not.toHaveBeenCalled();

    mockGitProcess({ stderr: 'diff failed', code: 1 });
    await expect(git.getChangedLines(DEFAULT_BRANCH, [SOURCE_FILE])).rejects.toThrow('Failed to get changed lines:');
  });

  test('explains missing merge base when it occurs while reading changed lines', async () => {
    mockGitProcess({ stderr: 'fatal: origin/main...HEAD: no merge base', code: 1 });

    await expect(git.getChangedLines(DEFAULT_BRANCH, [SOURCE_FILE])).rejects.toThrow(
      'Set GIT_DEPTH: 0 or fetch full history before running diff-cov-guard.'
    );
  });

  test('kills a hanging Git child when timeout is reached', async () => {
    jest.useFakeTimers();
    const child = new GitChild();
    spawn.mockReturnValueOnce(child);

    const promise = git.getChangedFiles(DEFAULT_BRANCH, 1);
    const assertion = expect(promise).rejects.toThrow('Git command timed out after 1ms');
    await jest.advanceTimersByTimeAsync(1);

    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('force kills a Git child that does not stop after its timeout', async () => {
    jest.useFakeTimers();
    const child = new GitChild();
    child.kill.mockImplementation((signal) => {
      if (signal === 'SIGKILL') {
        child.emit('close', null, signal);
      }

      return true;
    });
    spawn.mockReturnValueOnce(child);

    const promise = git.getChangedFiles(DEFAULT_BRANCH, 1);
    const assertion = expect(promise).rejects.toThrow('Git command timed out after 1ms');
    await jest.advanceTimersByTimeAsync(1001);

    await assertion;
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  test('reports failure to start a Git process', async () => {
    const child = new GitChild();
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return child;
    });

    await expect(git.getChangedFiles(DEFAULT_BRANCH)).rejects.toThrow('Failed to start git diff');
  });

  test('bounds captured stderr from Git commands', async () => {
    const capturedPrefix = 'a'.repeat(1000000);
    const child = new GitChild();
    spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stderr.write(capturedPrefix);
        child.stderr.end('discarded');
        child.stdout.end();
        child.emit('close', 1, null);
      });

      return child;
    });

    const promise = git.getChangedFiles(DEFAULT_BRANCH);

    await expect(promise).rejects.toThrow('Git command failed');
    await expect(promise).rejects.not.toThrow('discarded');
  });

  test('detects dirty and clean git status', async () => {
    mockGitProcess({ stdout: ` M ${SOURCE_FILE}\n` });
    await expect(git.isDirty()).resolves.toBe(true);

    mockGitProcess({ stdout: '\n' });
    await expect(git.isDirty()).resolves.toBe(false);
  });
});
