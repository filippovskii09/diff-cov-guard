import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { DEFAULT_BRANCH, TIMEOUT_DEFAULTS } from './constants.js';
import { addRange, rangesToChangedLinesMap } from './ranges.js';

const GIT_DIFF_FILE_PREFIX = '+++ b/';
const HUNK_HEADER_PREFIX = '@@';
const GIT_OUTPUT_LIMIT = 1000000;
const FORCE_KILL_DELAY_MS = 1000;
const NO_MERGE_BASE_MESSAGE = [
  'No merge base found. This usually means CI uses a shallow clone.',
  'Set GIT_DEPTH: 0 or fetch full history before running diff-cov-guard.',
].join('\n');

function parseRemoteHeadBranch(output) {
  const headBranchLine = output.split('\n').find((line) => line.trim().startsWith('HEAD branch:'));

  return headBranchLine?.split(':').at(1)?.trim() ?? '';
}

function formatGitCommand(args) {
  return `git ${args.join(' ')}`;
}

function appendBoundedOutput(currentOutput, chunk) {
  if (currentOutput.length >= GIT_OUTPUT_LIMIT) {
    return currentOutput;
  }

  const nextChunk = chunk.toString('utf8');
  const remainingLength = GIT_OUTPUT_LIMIT - currentOutput.length;

  return currentOutput + nextChunk.slice(0, remainingLength);
}

function buildGitError(args, code, stderr) {
  const message = stderr.trim();
  const suffix = message ? `: ${message}` : '';

  return new Error(`Git command failed (${formatGitCommand(args)}) with exit code ${code}${suffix}`);
}

function buildGitTimeoutError(args, timeoutMs) {
  return new Error(`Git command timed out after ${timeoutMs}ms (${formatGitCommand(args)})`);
}

function buildDiffError(action, error) {
  const shallowCloneHint = /\bno merge base\b/i.test(error.message) ? `\n${NO_MERGE_BASE_MESSAGE}` : '';

  return new Error(`${action}: ${error.message}${shallowCloneHint}`, { cause: error });
}

function remoteTrackingRef(branch) {
  return `refs/remotes/origin/${branch}`;
}

function remoteShortRef(branch) {
  return `origin/${branch}`;
}

function normalizeRemoteBase(baseRef) {
  if (baseRef.startsWith('refs/remotes/origin/')) {
    const branch = baseRef.slice('refs/remotes/origin/'.length);
    return { branch, diffRef: baseRef };
  }

  if (baseRef.startsWith('origin/')) {
    const branch = baseRef.slice('origin/'.length);
    return { branch, diffRef: baseRef };
  }

  if (baseRef.startsWith('refs/heads/')) {
    const branch = baseRef.slice('refs/heads/'.length);
    return { branch, diffRef: remoteShortRef(branch) };
  }

  return { branch: baseRef, diffRef: remoteShortRef(baseRef) };
}

function startGit(args, timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  const child = spawn('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let timedOut = false;
  let forceKillTimer;

  child.stderr.on('data', (chunk) => {
    stderr = appendBoundedOutput(stderr, chunk);
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, FORCE_KILL_DELAY_MS);
  }, timeoutMs);

  const wait = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);
      reject(new Error(`Failed to start ${formatGitCommand(args)}: ${error.message}`, { cause: error }));
    });

    child.once('close', (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimer);

      if (timedOut) {
        reject(buildGitTimeoutError(args, timeoutMs));
        return;
      }

      if (code !== 0) {
        reject(buildGitError(args, code, stderr));
        return;
      }

      resolve();
    });
  });

  return { child, wait };
}

async function runGitText(args, timeoutMs) {
  const { child, wait } = startGit(args, timeoutMs);
  let stdout = '';

  child.stdout.on('data', (chunk) => {
    stdout = appendBoundedOutput(stdout, chunk);
  });

  await wait;

  return stdout;
}

async function assertValidBranch(branch, timeoutMs) {
  try {
    await runGitText(['check-ref-format', '--branch', branch], timeoutMs);
  } catch (error) {
    throw new Error(`Invalid branch/ref "${branch}": ${error.message}`, { cause: error });
  }
}

function parseNullDelimitedOutput(output) {
  if (!output) {
    return [];
  }

  const values = output.split('\0');

  if (values.at(-1) === '') {
    values.pop();
  }

  return values;
}

function readInteger(value, startIndex) {
  let index = startIndex;

  while (index < value.length && value[index] >= '0' && value[index] <= '9') {
    index += 1;
  }

  if (index === startIndex) {
    return null;
  }

  return {
    number: Number(value.slice(startIndex, index)),
    nextIndex: index,
  };
}

/**
 * Resolves the default branch configured for the `origin` remote.
 *
 * Falls back to the project default when Git cannot report the remote HEAD,
 * the command fails, or the resolved value is empty.
 *
 * @param {number} [timeoutMs] - Git command timeout in milliseconds.
 * @returns {Promise<string>} Remote default branch name, or `DEFAULT_BRANCH` as a fallback.
 */
export async function getRemoteDefaultBranch(timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  try {
    const output = await runGitText(['remote', 'show', 'origin'], timeoutMs);
    const branch = parseRemoteHeadBranch(output);
    return branch || DEFAULT_BRANCH;
  } catch {
    return DEFAULT_BRANCH;
  }
}

/**
 * Fetches the requested base branch from `origin` for CI diff comparisons.
 *
 * If the fetch fails, attempts to update `origin` HEAD to the same branch
 * before failing. CI runs should not continue from stale or incomplete Git
 * state because that can produce false-positive coverage checks.
 *
 * @param {string} branch - Branch name expected to exist on the `origin` remote.
 * @param {number} [timeoutMs] - Git command timeout in milliseconds.
 * @returns {Promise<string>} Git ref that should be used for diff comparisons.
 */
export async function fetchBranch(branch, timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  const remoteBase = normalizeRemoteBase(branch);
  await assertValidBranch(remoteBase.branch, timeoutMs);

  try {
    console.log(`Fetching ${remoteBase.branch}`);
    await runGitText(
      ['fetch', 'origin', `${remoteBase.branch}:${remoteTrackingRef(remoteBase.branch)}`, '--quiet'],
      timeoutMs
    );
  } catch {
    try {
      await runGitText(['remote', 'set-head', 'origin', remoteBase.branch], timeoutMs);
      await runGitText(
        ['fetch', 'origin', `${remoteBase.branch}:${remoteTrackingRef(remoteBase.branch)}`, '--quiet'],
        timeoutMs
      );
    } catch (error) {
      throw new Error(`Failed to fetch ${branch}: ${error.message}`, { cause: error });
    }
  }

  return remoteBase.diffRef;
}

/**
 * Lists files changed between a base branch and the current `HEAD`.
 *
 * Uses Git's three-dot diff form so the result reflects changes introduced on
 * the current branch since it diverged from the base branch.
 *
 * @param {string} baseBranch - Branch or ref used as the comparison base.
 * @param {number} [timeoutMs] - Git command timeout in milliseconds.
 * @returns {Promise<string[]>} Changed file paths relative to the repository root.
 */
export async function getChangedFiles(baseBranch, timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  try {
    const output = await runGitText(['diff', '--name-only', '-z', `${baseBranch}...HEAD`], timeoutMs);

    return parseNullDelimitedOutput(output);
  } catch (error) {
    throw buildDiffError('Failed to get changed files', error);
  }
}

/**
 * Creates the initial changed-lines map with one empty Set per changed file.
 *
 * Pre-populating the map keeps downstream code predictable: every changed file
 * exists in the result even if Git hunk parsing finds no added lines for it.
 *
 * @param {string[]} changedFiles - Git-relative file paths changed in the diff.
 * @returns {Map<string, Set<number>>} Empty changed-line sets keyed by file path.
 */
function createChangedLinesMap(changedFiles) {
  return new Map(changedFiles.map((file) => [file, new Set()]));
}

function createChangedLineRangesMap(changedFiles) {
  return new Map(changedFiles.map((file) => [file, []]));
}

/**
 * Parses the added-line range from a unified diff hunk header.
 *
 * For a header like `@@ -1 +2,3 @@`, only the new-file part is relevant:
 * `+2,3` means changed lines `2`, `3`, and `4` in the current branch.
 *
 * @param {string} hunkHeader - Unified diff hunk header starting with `@@`.
 * @returns {{start: number, end: number}|null} Changed line range from the new-file side of the hunk.
 */
function parseChangedLineRange(hunkHeader) {
  const plusIndex = hunkHeader.indexOf('+');

  if (plusIndex === -1) {
    return null;
  }

  const start = readInteger(hunkHeader, plusIndex + 1);

  if (!start) {
    return null;
  }

  let lineCount = 1;

  if (hunkHeader[start.nextIndex] === ',') {
    const count = readInteger(hunkHeader, start.nextIndex + 1);

    if (!count) {
      return null;
    }

    lineCount = count.number;
  }

  if (lineCount <= 0) {
    return null;
  }

  return {
    start: start.number,
    end: start.number + lineCount - 1,
  };
}

/**
 * Adds parsed hunk line numbers to the changed-lines map for one file.
 *
 * @param {Map<string, {start: number, end: number}[]>} rangesByFile - Mutable changed-line ranges map.
 * @param {string} filePath - Git-relative file path for the current diff hunk.
 * @param {string} hunkHeader - Unified diff hunk header to parse.
 * @returns {void}
 */
function addChangedLines(rangesByFile, filePath, hunkHeader) {
  const range = parseChangedLineRange(hunkHeader);

  if (range) {
    addRange(rangesByFile, filePath, range);
  }
}

/**
 * Parses one zero-context Git diff line into changed line numbers by file.
 *
 * @param {string} line - One line from `git diff --unified=0` stdout.
 * @param {string|null} currentFile - Current new-file path from the diff header.
 * @param {Map<string, {start: number, end: number}[]>} rangesByFile - Mutable result map.
 * @returns {string|null} Updated current file path.
 */
function parseChangedLinesDiffLine(line, currentFile, rangesByFile) {
  if (line.startsWith(GIT_DIFF_FILE_PREFIX)) {
    const filePath = line.slice(GIT_DIFF_FILE_PREFIX.length);
    rangesByFile.set(filePath, rangesByFile.get(filePath) ?? []);
    return filePath;
  }

  if (line.startsWith(HUNK_HEADER_PREFIX) && currentFile) {
    addChangedLines(rangesByFile, currentFile, line);
  }

  return currentFile;
}

/**
 * Maps changed files to line numbers added or modified in the current branch.
 *
 * Uses zero-context diff hunks so hunk ranges describe only changed lines,
 * without surrounding unchanged code.
 *
 * @param {string} baseBranch - Branch or ref used as the comparison base.
 * @param {string[]} changedFiles - Git-relative changed file paths.
 * @param {number} [timeoutMs] - Git command timeout in milliseconds.
 * @returns {Promise<Map<string, Set<number>>>} Changed line numbers by file path.
 */
export async function getChangedLines(baseBranch, changedFiles, timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  const rangesByFile = createChangedLineRangesMap(changedFiles);

  if (changedFiles.length === 0) {
    return createChangedLinesMap(changedFiles);
  }

  const args = ['diff', '--unified=0', `${baseBranch}...HEAD`, '--', ...changedFiles];
  const { child, wait } = startGit(args, timeoutMs);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let currentFile = null;

  try {
    await Promise.all([
      (async () => {
        for await (const line of lines) {
          currentFile = parseChangedLinesDiffLine(line, currentFile, rangesByFile);
        }
      })(),
      wait,
    ]);
  } catch (error) {
    throw buildDiffError('Failed to get changed lines', error);
  }

  return rangesToChangedLinesMap(rangesByFile);
}

/**
 * Checks whether the working tree contains tracked or untracked changes.
 *
 * @param {number} [timeoutMs] - Git command timeout in milliseconds.
 * @returns {Promise<boolean>} `true` when `git status --porcelain` reports any entry.
 */
export async function isDirty(timeoutMs = TIMEOUT_DEFAULTS.gitTimeoutMs) {
  const status = (await runGitText(['status', '--porcelain'], timeoutMs)).trim();
  return status.length > 0;
}
