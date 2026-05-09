import { execSync } from 'child_process';

import { DEFAULT_BRANCH } from './constants.js';

const execSyncConfig = {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore'],
}

export function getRemoteDefaultBranch() {
  try {
    const command = `git remote show origin | grep 'HEAD branch' | cut -d' ' -f5`;
    const branch = execSync(command, execSyncConfig).trim();
    return branch || DEFAULT_BRANCH;
  } catch (error) {
    return DEFAULT_BRANCH;
  }
}

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

export function isDirty() {
  const status = execSync('git status --porcelain', execSyncConfig).trim();
  return status.length > 0;
}
