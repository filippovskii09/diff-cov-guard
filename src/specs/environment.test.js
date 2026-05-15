import { afterEach, describe, expect, test } from '@jest/globals';

import { getEnvironment } from '../environment.js';
import { CURRENT_BRANCH, DEFAULT_BRANCH, ENV_TYPES } from './helpers/fixtures.js';

const originalEnv = process.env;

afterEach(() => {
	process.env = originalEnv;
});

function setEnv(values) {
	process.env = { ...originalEnv, ...values };
}

describe('environment', () => {
	test('detects GitHub Actions metadata', () => {
		setEnv({
			GITHUB_ACTIONS: 'true',
			GITHUB_BASE_REF: DEFAULT_BRANCH,
			GITHUB_REF_NAME: CURRENT_BRANCH,
		});

		expect(getEnvironment()).toEqual({
			type: ENV_TYPES.GITHUB,
			isCI: true,
			baseBranch: DEFAULT_BRANCH,
			currentBranch: CURRENT_BRANCH,
		});
	});

	test('detects GitLab CI metadata with missing branch values preserved', () => {
		setEnv({ GITLAB_CI: 'true' });

		expect(getEnvironment()).toEqual({
			type: ENV_TYPES.GITLAB,
			isCI: true,
			baseBranch: undefined,
			currentBranch: undefined,
		});
	});

	test('falls back to local metadata', () => {
		setEnv({});
		delete process.env.GITHUB_ACTIONS;
		delete process.env.GITLAB_CI;

		expect(getEnvironment()).toEqual({
			type: ENV_TYPES.LOCAL,
			isCI: false,
			baseBranch: null,
			currentBranch: null,
		});
	});
});
