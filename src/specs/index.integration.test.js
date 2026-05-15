import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
	DEFAULT_BRANCH,
	DEFAULT_THRESHOLD,
	SOURCE_FILE,
	changedLinesMap,
	localEnvironment,
	runConfig,
} from './helpers/fixtures.js';

const environment = { getEnvironment: jest.fn() };
const git = {
	fetchBranch: jest.fn(),
	getChangedFiles: jest.fn(),
	getChangedLines: jest.fn(),
	getRemoteDefaultBranch: jest.fn(),
};
const config = { loadConfig: jest.fn() };

jest.unstable_mockModule('../environment.js', () => environment);
jest.unstable_mockModule('../git.js', () => git);
jest.unstable_mockModule('../config.js', () => config);

const index = await import('../index.js');

let tempDir;
let lifecycle;
let logs;

function writeLcov(content) {
	tempDir ??= mkdtempSync(join(tmpdir(), 'diff-cov-index-'));
	const lcovPath = join(tempDir, 'lcov.info');
	writeFileSync(lcovPath, content);
	return lcovPath;
}

function lcovRecord(filePath, entries) {
	return [
		`SF:${filePath}`,
		...entries.map(([lineNumber, hitCount]) => `DA:${lineNumber},${hitCount}`),
		'end_of_record',
	].join('\n');
}

beforeEach(() => {
	jest.clearAllMocks();
	lifecycle = { exit: jest.fn() };
	logs = {
		log: jest.spyOn(console, 'log').mockImplementation(() => {}),
		warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
		error: jest.spyOn(console, 'error').mockImplementation(() => {}),
		table: jest.spyOn(console, 'table').mockImplementation(() => {}),
	};
	environment.getEnvironment.mockReturnValue(localEnvironment());
	git.getRemoteDefaultBranch.mockReturnValue(DEFAULT_BRANCH);
	git.getChangedFiles.mockReturnValue([SOURCE_FILE]);
	git.getChangedLines.mockReturnValue(changedLinesMap([[SOURCE_FILE, [1, 2]]]));
});

afterEach(() => {
	jest.restoreAllMocks();
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe('run integration', () => {
	test('passes when real LCOV parsing and diff coverage calculation satisfy the threshold', async () => {
		const lcovPath = writeLcov(
			lcovRecord(SOURCE_FILE, [
				[1, 1],
				[2, 1],
			]),
		);
		config.loadConfig.mockReturnValue(
			runConfig({
				lcovPath,
				threshold: DEFAULT_THRESHOLD,
				rootDir: process.cwd(),
			}),
		);

		await index.run({}, lifecycle);

		expect(logs.table).toHaveBeenCalledWith([
			{ File: SOURCE_FILE, 'Changed Lines': 2, 'Covered Lines': 2, Percentage: '100%' },
		]);
		expect(logs.log).toHaveBeenCalledWith(
			expect.stringContaining('Success: Diff Coverage is 100%'),
		);
		expect(lifecycle.exit).toHaveBeenCalledWith(0);
	});

	test('fails with uncovered changed line details from real LCOV parsing and diff coverage calculation', async () => {
		const lcovPath = writeLcov(
			lcovRecord(SOURCE_FILE, [
				[1, 1],
				[2, 0],
			]),
		);
		config.loadConfig.mockReturnValue(
			runConfig({
				lcovPath,
				threshold: DEFAULT_THRESHOLD,
				rootDir: process.cwd(),
			}),
		);

		await index.run({}, lifecycle);

		expect(logs.error).toHaveBeenCalledWith('\nFiles below diff coverage requirements:');
		expect(logs.error).toHaveBeenCalledWith(` - ${SOURCE_FILE}: uncovered changed lines 2`);
		expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('Fail: Diff Coverage is 50%'));
		expect(lifecycle.exit).toHaveBeenCalledWith(1);
	});
});
