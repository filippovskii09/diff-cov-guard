/**
 * Builds a per-file diff coverage summary from changed lines and LCOV data.
 *
 * A changed line is executable when LCOV has a `DA:` entry for it. If a source
 * file is missing from LCOV entirely, all changed lines are treated as
 * uncovered so newly added files cannot silently pass with 0% visibility.
 *
 * @param {string} filePath - Git-relative file path.
 * @param {Set<number>} changedLines - Line numbers changed in the current diff.
 * @param {{path: string, lines: Map<number, number>}|undefined} coverageRecord - Parsed LCOV record for the file.
 * @returns {{filePath: string, changedLines: number[], executableLines: number[], coveredLines: number[], uncoveredLines: number[], hasCoverage: boolean}}
 */
function createFileResult(filePath, changedLines, coverageRecord) {
	const executableLines = [];
	const coveredLines = [];
	const uncoveredLines = [];
	const sortedChangedLines = [...changedLines].sort((left, right) => left - right);

	if (!coverageRecord) {
		return {
			filePath,
			changedLines: sortedChangedLines,
			executableLines: sortedChangedLines,
			coveredLines,
			uncoveredLines: sortedChangedLines,
			hasCoverage: false,
		};
	}

	for (const lineNumber of sortedChangedLines) {
		if (!coverageRecord.lines.has(lineNumber)) {
			continue;
		}

		const hitCount = coverageRecord.lines.get(lineNumber);
		executableLines.push(lineNumber);

		if (hitCount > 0) {
			coveredLines.push(lineNumber);
		} else {
			uncoveredLines.push(lineNumber);
		}
	}

	return {
		filePath,
		changedLines: sortedChangedLines,
		executableLines,
		coveredLines,
		uncoveredLines,
		hasCoverage: Boolean(coverageRecord),
	};
}

/**
 * Calculates coverage only for executable changed lines.
 *
 * @param {Map<string, Set<number>>} changedLinesByFile - Git changed lines by file.
 * @param {Map<string, {path: string, lines: Map<number, number>}>} coverageByFile - Parsed LCOV records.
 * @returns {{percentage: number, coveredLines: number, executableLines: number, files: object[]}}
 */
export function calculateDiffCoverage(changedLinesByFile, coverageByFile) {
	const files = [];
	let executableLineCount = 0;
	let coveredLineCount = 0;

	for (const [filePath, changedLines] of changedLinesByFile) {
		const fileResult = createFileResult(filePath, changedLines, coverageByFile.get(filePath));
		files.push(fileResult);

		executableLineCount += fileResult.executableLines.length;
		coveredLineCount += fileResult.coveredLines.length;
	}

	const percentage =
		executableLineCount === 0 ? 100 : (coveredLineCount / executableLineCount) * 100;

	return {
		percentage,
		coveredLines: coveredLineCount,
		executableLines: executableLineCount,
		files,
	};
}

/**
 * Checks whether calculated diff coverage satisfies the configured threshold.
 *
 * @param {{percentage: number}} diffCoverage - Result from `calculateDiffCoverage()`.
 * @param {number} threshold - Required minimum coverage percentage.
 * @returns {boolean} `true` when diff coverage is equal to or above threshold.
 */
export function passesThreshold(diffCoverage, threshold) {
	return diffCoverage.percentage >= threshold;
}
