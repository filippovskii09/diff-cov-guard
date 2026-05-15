import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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

const execSync = jest.fn();
const execFileSync = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
	execSync,
	execFileSync,
}));

const git = await import('../git.js');

function fetchCommand(branch) {
	return `git fetch origin ${branch}:${branch} --quiet`;
}

function setOriginHeadCommand(branch) {
	return `git remote set-head origin ${branch}`;
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

beforeEach(() => {
	execSync.mockReset();
	execFileSync.mockReset();
	jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('git', () => {
	test('resolves remote default branch with fallback for empty output and errors', () => {
		execSync.mockReturnValueOnce(`${DEFAULT_BRANCH}\n`);
		expect(git.getRemoteDefaultBranch()).toBe(DEFAULT_BRANCH);

		execSync.mockReturnValueOnce('\n');
		expect(git.getRemoteDefaultBranch()).toBe(DEFAULT_BRANCH);

		execSync.mockImplementationOnce(() => {
			throw new Error(NO_REMOTE_ERROR_MESSAGE);
		});
		expect(git.getRemoteDefaultBranch()).toBe(DEFAULT_BRANCH);
	});

	test('fetches branch successfully and retries by setting origin head once', () => {
		git.fetchBranch(DEVELOP_BRANCH);
		expect(execSync).toHaveBeenCalledWith(fetchCommand(DEVELOP_BRANCH), { stdio: 'ignore' });

		execSync.mockReset();
		execSync
			.mockImplementationOnce(() => {
				throw new Error('fetch failed');
			})
			.mockReturnValueOnce(EMPTY_OUTPUT)
			.mockReturnValueOnce(EMPTY_OUTPUT);

		git.fetchBranch(RELEASE_BRANCH);

		expect(execSync.mock.calls.map(([command]) => command)).toEqual([
			fetchCommand(RELEASE_BRANCH),
			setOriginHeadCommand(RELEASE_BRANCH),
			fetchCommand(RELEASE_BRANCH),
		]);
	});

	test('throws when fetch retry fails', () => {
		execSync.mockImplementation(() => {
			throw new Error('failed');
		});

		expect(() => git.fetchBranch(MISSING_BRANCH)).toThrow(`Failed to fetch ${MISSING_BRANCH}`);
	});

	test('lists changed files and reports git errors', () => {
		const changedFiles = [SOURCE_FILE, README_FILE];
		execSync.mockReturnValueOnce(`${changedFiles.join('\n')}\n`);
		expect(git.getChangedFiles(DEFAULT_BRANCH)).toEqual(changedFiles);

		execSync.mockReturnValueOnce('\n');
		expect(git.getChangedFiles(DEFAULT_BRANCH)).toEqual([]);

		execSync.mockImplementationOnce(() => {
			throw new Error('bad diff');
		});
		expect(() => git.getChangedFiles(DEFAULT_BRANCH)).toThrow(
			'Failed to get changed files: bad diff',
		);
	});

	test('parses changed lines across files and hunk shapes', () => {
		const changedFiles = [SOURCE_FILE, NEW_SOURCE_FILE];
		execFileSync.mockReturnValue(diffFixture());

		const result = git.getChangedLines(DEFAULT_BRANCH, changedFiles);

		expect([...result.get(SOURCE_FILE)]).toEqual([1, 2, 12]);
		expect([...result.get(EXTRA_SOURCE_FILE)]).toEqual([20, 21]);
		expect([...result.get(NEW_SOURCE_FILE)]).toEqual([3]);
		expect(execFileSync).toHaveBeenCalledWith(
			'git',
			['diff', '--unified=0', `${DEFAULT_BRANCH}...HEAD`, '--', ...changedFiles],
			{ encoding: 'utf8' },
		);
	});

	test('returns initialized changed lines for zero files and wraps parser errors', () => {
		expect(git.getChangedLines(DEFAULT_BRANCH, [])).toEqual(new Map());
		expect(execFileSync).not.toHaveBeenCalled();

		execFileSync.mockImplementationOnce(() => {
			throw new Error('diff failed');
		});
		expect(() => git.getChangedLines(DEFAULT_BRANCH, [SOURCE_FILE])).toThrow(
			'Failed to get changed lines: diff failed',
		);
	});

	test('detects dirty and clean git status', () => {
		execSync.mockReturnValueOnce(` M ${SOURCE_FILE}\n`);
		expect(git.isDirty()).toBe(true);

		execSync.mockReturnValueOnce('\n');
		expect(git.isDirty()).toBe(false);
	});
});
