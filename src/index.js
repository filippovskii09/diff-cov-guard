import { extname } from 'node:path';

import { calculateDiffCoverage, passesThreshold } from './coverage.js';
import { COVERAGE_SOURCE_EXTENSIONS, EXIT_CODES, CONSOLE_COLORS } from './constants.js';
import { getEnvironment } from './environment.js';
import { fetchBranch, getChangedFiles, getChangedLines, getRemoteDefaultBranch } from './git.js';
import { loadConfig } from './config.js';
import { isLcovEmptyOrMissing, parseLcov } from './lcov.js';


function colorize(color, message) {
	return `${color}${message}${CONSOLE_COLORS.RESET}`;
}

function formatPercentage(percentage) {
	return Number(percentage.toFixed(2));
}

function isCoverageSourceFile(filePath) {
	return COVERAGE_SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export function filterCoverageSourceFiles(changedFiles) {
	return changedFiles.filter(isCoverageSourceFile);
}

export function hasChangedLines(changedLinesByFile) {
	for (const changedLines of changedLinesByFile.values()) {
		if (changedLines.size > 0) {
			return true;
		}
	}

	return false;
}

/**
 * Converts per-file coverage results into a CI-friendly table shape.
 *
 * @param {{files: object[]}} diffCoverage - Calculated diff coverage result.
 * @returns {object[]} Rows for `console.table()`.
 */
export function createReportRows(diffCoverage) {
	return diffCoverage.files.map((file) => {
		const executableLineCount = file.executableLines.length;
		const percentage = executableLineCount === 0
			? 100
			: (file.coveredLines.length / executableLineCount) * 100;

		return {
			File: file.filePath,
			'Changed Lines': file.changedLines.length,
			'Covered Lines': file.coveredLines.length,
			Percentage: executableLineCount === 0
				? '100% (No executable changes)'
				: `${formatPercentage(percentage)}%`,
		};
	});
}

/**
 * Returns files that contain uncovered executable changed lines.
 *
 * @param {{files: object[]}} diffCoverage - Calculated diff coverage result.
 * @returns {object[]} Failing file results.
 */
export function getFailingFiles(diffCoverage) {
	return diffCoverage.files.filter((file) => file.uncoveredLines.length > 0);
}

function printFailureDetails(diffCoverage) {
	const failingFiles = getFailingFiles(diffCoverage);

	if (failingFiles.length === 0) {
		return;
	}

	console.error('\nFiles below diff coverage requirements:');
	for (const file of failingFiles) {
		console.error(` - ${file.filePath}: uncovered changed lines ${file.uncoveredLines.join(', ')}`);
	}
}

function printFinalReport(config, diffCoverage) {
	console.table(createReportRows(diffCoverage));

	if (diffCoverage.executableLines === 0) {
		console.log(colorize(CONSOLE_COLORS.GREEN, '✔ Success: Diff Coverage is 100% (No executable changes).'));
		return;
	}

	if (passesThreshold(diffCoverage, config.threshold)) {
		console.log(colorize(
			CONSOLE_COLORS.GREEN,
			`✔ Success: Diff Coverage is ${formatPercentage(diffCoverage.percentage)}%, minimum required is ${config.threshold}%.`
		));
		return;
	}

	printFailureDetails(diffCoverage);
	console.error(colorize(
		CONSOLE_COLORS.RED,
		`✖ Fail: Diff Coverage is ${formatPercentage(diffCoverage.percentage)}%, but minimum required is ${config.threshold}%.`
	));
}

export function getExitCode(diffCoverage, threshold) {
	return passesThreshold(diffCoverage, threshold)
		? EXIT_CODES.SUCCESS
		: EXIT_CODES.FAILURE;
}

function exitWith(lifecycle, code) {
	lifecycle.exit(code);
}

/**
 * Runs the coverage guard workflow for the current repository context.
 *
 * Determines the comparison branch from CLI arguments, CI metadata, config, or
 * the remote default branch, fetches the base branch in CI, and prints the
 * changed files that downstream coverage checks should evaluate.
 *
 * @param {object} args - Parsed CLI options.
 * @param {string} [args.base] - Explicit base branch override.
 * @param {string|number} args.threshold - Required coverage threshold percentage.
 * @param {string} args.lcov - Path to the LCOV report used by the check.
 * @param {object} [lifecycle=process] - Process-like lifecycle dependency.
 * @returns {Promise<void>} Resolves only when lifecycle exit is stubbed by tests.
 */
export async function run(args, lifecycle = process) {
	try {
		console.log('Starting coverage check...');

		const env = getEnvironment();
		const config = loadConfig(args);
		const cliBase = args.base ?? args.baseBranch;
		const base = cliBase ?? env.baseBranch ?? config.baseBranch ?? getRemoteDefaultBranch();
		config.baseBranch = base;

		console.log('🛠  Resolved Config:', config);

		console.log(`Environment: ${env.type.toUpperCase()}`);

		if (env.isCI) {
			fetchBranch(config.baseBranch);
		}

		const changedFiles = getChangedFiles(config.baseBranch);
		const sourceChangedFiles = filterCoverageSourceFiles(changedFiles);

		if (changedFiles.length === 0) {
			console.log(colorize(CONSOLE_COLORS.GREEN, '✔ Success: No changed files found.'));
			exitWith(lifecycle, EXIT_CODES.SUCCESS);
			return;
		}

		if (sourceChangedFiles.length === 0) {
			console.log('ℹ Nothing to check: only non-source files changed.');
			exitWith(lifecycle, EXIT_CODES.SUCCESS);
			return;
		}

		const changedLinesByFile = getChangedLines(config.baseBranch, sourceChangedFiles);

		if (!hasChangedLines(changedLinesByFile)) {
			console.log('ℹ No new executable lines found in this PR. Skipping.');
			exitWith(lifecycle, EXIT_CODES.SUCCESS);
			return;
		}

		if (isLcovEmptyOrMissing(config.lcovPath)) {
			console.warn('WARN: LCOV file is empty or missing. Skipping coverage check.');
			exitWith(lifecycle, config.failOnEmpty ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS);
			return;
		}

		const coverageByFile = parseLcov(config.lcovPath, {
			repoRoot: process.cwd(),
			rootDir: config.rootDir,
		});
		const diffCoverage = calculateDiffCoverage(changedLinesByFile, coverageByFile);

		printFinalReport(config, diffCoverage);

		exitWith(lifecycle, getExitCode(diffCoverage, config.threshold));
	} catch (error) {
		console.error(`Error: ${error.message}`);
		exitWith(lifecycle, EXIT_CODES.FAILURE);
	}
}
