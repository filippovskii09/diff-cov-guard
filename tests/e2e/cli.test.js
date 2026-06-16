import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from '@jest/globals';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIR, '..', '..');
const CLI_PATH = join(PROJECT_ROOT, 'bin', 'cli.js');
const SOURCE_FILE = 'src/a.js';
const CHANGED_LINE = 2;
const PROCESS_TIMEOUT_MS = 10000;
const GIT_TIMEOUT_MS = 5000;
const tempRepos = [];

function formatFailure(command, result) {
  const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  const suffix = details ? `\n${details}` : '';

  return `${command} failed with status ${result.status}${suffix}`;
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });

  if (result.error) {
    throw new Error(`Failed to execute git ${args.join(' ')}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(formatFailure(`git ${args.join(' ')}`, result));
  }
}

function createTempRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'diff-cov-guard-e2e-'));
  const sourcePath = join(cwd, SOURCE_FILE);
  tempRepos.push(cwd);

  runGit(cwd, ['init', '--initial-branch=main']);
  runGit(cwd, ['config', 'user.name', 'diff-cov-guard E2E']);
  runGit(cwd, ['config', 'user.email', 'diff-cov-guard-e2e@example.test']);

  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, 'export function answer() {\n  return 1;\n}\n');
  runGit(cwd, ['add', SOURCE_FILE]);
  runGit(cwd, ['commit', '-m', 'base source']);

  runGit(cwd, ['switch', '-c', 'feature']);
  writeFileSync(sourcePath, 'export function answer() {\n  return 2;\n}\n');
  runGit(cwd, ['add', SOURCE_FILE]);
  runGit(cwd, ['commit', '-m', 'change source']);

  return cwd;
}

function writeLcov(cwd, hitCount) {
  const coverageDir = join(cwd, 'coverage');
  const lcovPath = join(coverageDir, 'lcov.info');

  mkdirSync(coverageDir, { recursive: true });
  writeFileSync(lcovPath, [`SF:${SOURCE_FILE}`, `DA:${CHANGED_LINE},${hitCount}`, 'end_of_record', ''].join('\n'));
}

function runCli(cwd) {
  const { GITHUB_ACTIONS: _githubActions, GITLAB_CI: _gitlabCi, ...env } = process.env;

  return spawnSync(
    process.execPath,
    [
      CLI_PATH,
      '--base',
      'main',
      '--lcov',
      './coverage/lcov.info',
      '--threshold',
      '100',
      '--git-timeout-ms',
      String(GIT_TIMEOUT_MS),
    ],
    {
      cwd,
      encoding: 'utf8',
      env,
      timeout: PROCESS_TIMEOUT_MS,
    }
  );
}

afterEach(() => {
  for (const cwd of tempRepos.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe('CLI end-to-end coverage workflow', () => {
  test('exits successfully when the changed line is covered', () => {
    const cwd = createTempRepo();
    writeLcov(cwd, 1);

    const result = runCli(cwd);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Success: Diff Coverage is 100%');
  });

  test('exits with failure and reports the uncovered changed line', () => {
    const cwd = createTempRepo();
    writeLcov(cwd, 0);

    const result = runCli(cwd);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Fail: Diff Coverage is 0%');
    expect(result.stderr).toContain(`${SOURCE_FILE}: uncovered changed lines ${CHANGED_LINE}`);
  });
});
