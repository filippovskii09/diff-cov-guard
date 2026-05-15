import { describe, expect, test } from '@jest/globals';

import { calculateDiffCoverage, passesThreshold } from '../coverage.js';
import {
	FULL_COVERAGE,
	MISSING_SOURCE_FILE,
	SOURCE_FILE,
	changedLinesMap,
	coverageRecord,
} from './helpers/fixtures.js';

const COVERED_LINE = 1;
const UNCOVERED_LINE = 2;
const NON_EXECUTABLE_LINE = 3;
const MISSING_FILE_LINES = [4, 5];

describe('coverage', () => {
	test('calculates covered, uncovered, and non-executable changed lines', () => {
		const changedLines = changedLinesMap([
			[SOURCE_FILE, [NON_EXECUTABLE_LINE, COVERED_LINE, UNCOVERED_LINE]],
			[MISSING_SOURCE_FILE, [...MISSING_FILE_LINES].reverse()],
		]);
		const coverage = new Map([
			[
				SOURCE_FILE,
				coverageRecord(SOURCE_FILE, [
					[COVERED_LINE, 1],
					[UNCOVERED_LINE, 0],
				]),
			],
		]);

		const result = calculateDiffCoverage(changedLines, coverage);

		expect(result).toMatchObject({
			percentage: (1 / 4) * FULL_COVERAGE,
			coveredLines: 1,
			executableLines: 4,
		});
		expect(result.files).toEqual([
			{
				filePath: SOURCE_FILE,
				changedLines: [COVERED_LINE, UNCOVERED_LINE, NON_EXECUTABLE_LINE],
				executableLines: [COVERED_LINE, UNCOVERED_LINE],
				coveredLines: [COVERED_LINE],
				uncoveredLines: [UNCOVERED_LINE],
				hasCoverage: true,
			},
			{
				filePath: MISSING_SOURCE_FILE,
				changedLines: MISSING_FILE_LINES,
				executableLines: MISSING_FILE_LINES,
				coveredLines: [],
				uncoveredLines: MISSING_FILE_LINES,
				hasCoverage: false,
			},
		]);
	});

	test('returns 100 percent when there are no executable changed lines', () => {
		const nonExecutableChangedLine = 9;
		const unrelatedCoveredLine = 1;
		const result = calculateDiffCoverage(
			changedLinesMap([[SOURCE_FILE, [nonExecutableChangedLine]]]),
			new Map([[SOURCE_FILE, coverageRecord(SOURCE_FILE, [[unrelatedCoveredLine, 0]])]]),
		);

		expect(result.percentage).toBe(FULL_COVERAGE);
		expect(result.executableLines).toBe(0);
		expect(passesThreshold(result, FULL_COVERAGE)).toBe(true);
		expect(passesThreshold({ percentage: 89.99 }, 90)).toBe(false);
	});
});
