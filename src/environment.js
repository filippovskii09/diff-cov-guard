import { ENV_TYPES } from './constants.js';

/**
 * Detects the execution environment from supported CI variables.
 *
 * GitHub Actions and GitLab CI return their merge-request base and current
 * branch metadata when available. Local runs intentionally use `null` branch
 * values so callers can fall back to CLI options or Git defaults.
 *
 * @returns {{type: string, isCI: boolean, baseBranch: string|null, currentBranch: string|null}} Environment metadata for branch selection.
 */
export const getEnvironment = () => {
  if (process.env.GITHUB_ACTIONS) {
    return {
      type: ENV_TYPES.GITHUB,
      isCI: true,
      baseBranch: process.env.GITHUB_BASE_REF,
      currentBranch: process.env.GITHUB_REF_NAME,
    };
  }

  if (process.env.GITLAB_CI) {
    return {
      type: ENV_TYPES.GITLAB,
      isCI: true,
      baseBranch: process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME,
      currentBranch: process.env.GITLAB_COMMIT_REF_NAME,
    };
  }

  return {
    type: ENV_TYPES.LOCAL,
    isCI: false,
    baseBranch: null,
    currentBranch: null,
  };
};
