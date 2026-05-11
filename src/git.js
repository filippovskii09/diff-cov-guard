import { execFileSync, execSync } from 'node:child_process';

import { DEFAULT_BRANCH } from './constants.js';

const execSyncConfig = {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore'],
}

const GIT_DIFF_FILE_PREFIX = '+++ b/';
const HUNK_HEADER_PREFIX = '@@';

/**
 * Resolves the default branch configured for the `origin` remote.
 *
 * Falls back to the project default when Git cannot report the remote HEAD,
 * the command fails, or the resolved value is empty.
 *
 * @returns {string} Remote default branch name, or `DEFAULT_BRANCH` as a fallback.
 */
export function getRemoteDefaultBranch() {
  try {
    const command = `git remote show origin | grep 'HEAD branch' | cut -d' ' -f5`;
    const branch = execSync(command, execSyncConfig).trim();
    return branch || DEFAULT_BRANCH;
  } catch (error) {
    return DEFAULT_BRANCH;
  }
}

/**
 * Fetches the requested base branch from `origin` for CI diff comparisons.
 *
 * If the fetch fails, attempts to update `origin` HEAD to the same branch
 * before warning. Failures are intentionally non-fatal so the caller can still
 * continue with the local repository state.
 *
 * @param {string} branch - Branch name expected to exist on the `origin` remote.
 */
export const fetchBranch = (branch) => {
	const execSyncOptions = {
    stdio: 'ignore'
  }
  try {
    console.log(`Fetching ${branch}`);
    execSync(`git fetch origin ${branch}:${branch} --quiet`, execSyncOptions);
  } catch (error) {
		try {
			execSync(`git remote set-head origin ${branch}`, execSyncOptions);
		} catch (error) {
		  console.warn(`Failed to fetch ${branch}`);
		}
	}
};

/**
 * Lists files changed between a base branch and the current `HEAD`.
 *
 * Uses Git's three-dot diff form so the result reflects changes introduced on
 * the current branch since it diverged from the base branch.
 *
 * @param {string} baseBranch - Branch or ref used as the comparison base.
 * @returns {string[]} Changed file paths relative to the repository root.
 */
export const getChangedFiles = (baseBranch) => {
	try {
		const command = `git diff --name-only ${baseBranch}...HEAD`;
		const output = execSync(command, { encoding: 'utf8' }).trim();

		return output ? output.split('\n') : [];
	} catch (error) {
		console.warn(`Failed to get changed files: ${error.message}`);
		return [];
	}
};

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

/**
 * Parses the added-line range from a unified diff hunk header.
 *
 * For a header like `@@ -1 +2,3 @@`, only the new-file part is relevant:
 * `+2,3` means changed lines `2`, `3`, and `4` in the current branch.
 *
 * @param {string} hunkHeader - Unified diff hunk header starting with `@@`.
 * @returns {number[]} Changed line numbers from the new-file side of the hunk.
 */
function parseChangedLineRange(hunkHeader) {
	const match = hunkHeader.match(/\+(\d+)(?:,(\d+))?/);

	if (!match) {
		return [];
	}

	const startLine = Number(match[1]);
	const lineCount = match[2] === undefined ? 1 : Number(match[2]);

	return Array.from({ length: lineCount }, (_, index) => startLine + index);
}

/**
 * Adds parsed hunk line numbers to the changed-lines map for one file.
 *
 * @param {Map<string, Set<number>>} changedLinesByFile - Mutable changed-line map.
 * @param {string} filePath - Git-relative file path for the current diff hunk.
 * @param {string} hunkHeader - Unified diff hunk header to parse.
 * @returns {void}
 */
function addChangedLines(changedLinesByFile, filePath, hunkHeader) {
	const changedLines = parseChangedLineRange(hunkHeader);
	const fileLines = changedLinesByFile.get(filePath) ?? new Set();

	for (const changedLine of changedLines) {
		fileLines.add(changedLine);
	}

	changedLinesByFile.set(filePath, fileLines);
}

/**
 * Parses zero-context Git diff output into changed line numbers by file.
 *
 * The parser tracks `+++ b/<file>` lines to know the current file, then reads
 * each following hunk header to collect added or modified line numbers.
 *
 * @param {string} output - Raw `git diff --unified=0` output.
 * @param {Map<string, Set<number>>} changedLinesByFile - Mutable result map.
 * @returns {void}
 */
function parseChangedLinesDiff(output, changedLinesByFile) {
	let currentFile = null;

	for (const line of output.split('\n')) {
		if (line.startsWith(GIT_DIFF_FILE_PREFIX)) {
			currentFile = line.slice(GIT_DIFF_FILE_PREFIX.length);
			changedLinesByFile.set(currentFile, changedLinesByFile.get(currentFile) ?? new Set());
			continue;
		}

		if (line.startsWith(HUNK_HEADER_PREFIX) && currentFile) {
			addChangedLines(changedLinesByFile, currentFile, line);
		}
	}
}

/**
 * Maps changed files to line numbers added or modified in the current branch.
 *
 * Uses zero-context diff hunks so hunk ranges describe only changed lines,
 * without surrounding unchanged code.
 *
 * @param {string} baseBranch - Branch or ref used as the comparison base.
 * @param {string[]} changedFiles - Git-relative changed file paths.
 * @returns {Map<string, Set<number>>} Changed line numbers by file path.
 */
export function getChangedLines(baseBranch, changedFiles) {
	const changedLinesByFile = createChangedLinesMap(changedFiles);

	if (changedFiles.length === 0) {
		return changedLinesByFile;
	}

	try {
		const output = execFileSync(
			'git',
			['diff', '--unified=0', `${baseBranch}...HEAD`, '--', ...changedFiles],
			{ encoding: 'utf8' }
		);
		parseChangedLinesDiff(output, changedLinesByFile);
	} catch (error) {
		console.warn(`Failed to get changed lines: ${error.message}`);
	}

	return changedLinesByFile;
}

/**
 * Checks whether the working tree contains tracked or untracked changes.
 *
 * @returns {boolean} `true` when `git status --porcelain` reports any entry.
 */
export function isDirty() {
	const status = execSync('git status --porcelain', execSyncConfig).trim();
	return status.length > 0;
}
