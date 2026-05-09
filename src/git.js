import { execSync } from 'child_process';

import { DEFAULT_BRANCH } from './constants.js';

export function getRemoteDefaultBranch() {
  try {
    const command = `git remote show origin | grep 'HEAD branch' | cut -d' ' -f5`;
    const branch = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return branch || DEFAULT_BRANCH;
  } catch (error) {
    return DEFAULT_BRANCH;
  }
}

export function isDirty() {
  const status = execSync('git status --porcelain', {
    encoding: 'utf8',
  }).trim();
  return status.length > 0;
}
