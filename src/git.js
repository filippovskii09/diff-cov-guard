import { execSync } from 'child_process';

import { DEFAULT_BRANCH } from './constants.js';

const execSyncConfig = {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore'],
}

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
}

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
