import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from '@jest/globals';

import { isLcovEmptyOrMissing, normalizePath, parseLcov } from '../lcov.js';
import { SECOND_SOURCE_FILE, SOURCE_FILE } from './helpers/fixtures.js';

const REPO_ROOT = resolve('/repo');
const NORMALIZED_SOURCE_FILE = 'src/file.js';
const PACKAGE_SOURCE_FILE = 'packages/app/src/file.js';
const TEMP_LCOV_PREFIX = 'lcov';
const LCOV_FILE_EXTENSION = '.info';
const MISSING_LCOV_FILE = 'missing-lcov.info';
const NOT_FOUND_LCOV_FILE = 'not-here.info';
const LCOV_HIT_LINE = 1;
const LCOV_MISS_LINE = 2;

let tempDir;

function tempFile(content) {
	tempDir ??= mkdtempSync(join(tmpdir(), 'diff-cov-guard-'));
	const path = join(tempDir, `${TEMP_LCOV_PREFIX}-${Math.random()}${LCOV_FILE_EXTENSION}`);
	writeFileSync(path, content);
	return path;
}

function lcovRecord(filePath, entries, { end = true } = {}) {
	const lines = [
		`SF:${filePath}`,
		...entries.map(([lineNumber, hitCount]) => `DA:${lineNumber},${hitCount}`),
	];
	return end ? [...lines, 'end_of_record'] : lines;
}

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

describe('lcov', () => {
	test('normalizes absolute, relative, current-dir, and Windows-style paths', () => {
		expect(normalizePath(`/repo/${NORMALIZED_SOURCE_FILE}`, { repoRoot: REPO_ROOT })).toBe(
			NORMALIZED_SOURCE_FILE,
		);
		expect(
			normalizePath(`./${NORMALIZED_SOURCE_FILE}`, { repoRoot: REPO_ROOT, rootDir: REPO_ROOT }),
		).toBe(NORMALIZED_SOURCE_FILE);
		expect(normalizePath(PACKAGE_SOURCE_FILE, { repoRoot: REPO_ROOT })).toBe(PACKAGE_SOURCE_FILE);
		expect(normalizePath('src\\file.js', { repoRoot: REPO_ROOT })).toBe(NORMALIZED_SOURCE_FILE);
	});

	test('detects missing, empty, and whitespace-only LCOV files', () => {
		const missingLcovPath = join(tmpdir(), MISSING_LCOV_FILE);
		const whitespaceOnlyLcov = ' \n\t ';
		const validLcov = lcovRecord(SOURCE_FILE, [[LCOV_HIT_LINE, 1]]).join('\n');

		expect(isLcovEmptyOrMissing(missingLcovPath)).toBe(true);
		expect(isLcovEmptyOrMissing(tempFile(''))).toBe(true);
		expect(isLcovEmptyOrMissing(tempFile(whitespaceOnlyLcov))).toBe(true);
		expect(isLcovEmptyOrMissing(tempFile(validLcov))).toBe(false);
	});

	test('parses multiple records and finalizes the last record without end_of_record', () => {
		const lcovPath = tempFile(
			[
				...lcovRecord(SOURCE_FILE, [[LCOV_HIT_LINE, 1]]),
				...lcovRecord(`./${SECOND_SOURCE_FILE}`, [[LCOV_MISS_LINE, 0]], { end: false }),
			].join('\n'),
		);

		const records = parseLcov(lcovPath, { repoRoot: process.cwd(), rootDir: process.cwd() });

		expect([...records.keys()]).toEqual([SOURCE_FILE, SECOND_SOURCE_FILE]);
		expect(records.get(SOURCE_FILE).lines.get(LCOV_HIT_LINE)).toBe(1);
		expect(records.get(SECOND_SOURCE_FILE).lines.get(LCOV_MISS_LINE)).toBe(0);
	});

	test('throws on missing files and malformed records', () => {
		const missingLcovPath = join(tmpdir(), NOT_FOUND_LCOV_FILE);
		const noRecordsLcov = 'TN:\n';
		const emptySourceRecord = 'SF:   \n';
		const emptyLineCoverageRecord = `SF:${SOURCE_FILE}\nDA:\n`;
		const invalidLineCoverageRecord = `SF:${SOURCE_FILE}\nDA:x,1\n`;

		expect(() => parseLcov(missingLcovPath)).toThrow('LCOV file not found');
		expect(() => parseLcov(tempFile(noRecordsLcov))).toThrow('no records found');
		expect(() => parseLcov(tempFile(emptySourceRecord))).toThrow('empty SF record');
		expect(() => parseLcov(tempFile(emptyLineCoverageRecord))).toThrow('malformed DA record');
		expect(() => parseLcov(tempFile(invalidLineCoverageRecord))).toThrow('malformed DA record');
	});
});
