import { calculateDiffCoverage, passesThreshold } from './coverage.js';
import { getEnvironment } from './environment.js';
import { fetchBranch, getChangedFiles, getChangedLines, getRemoteDefaultBranch } from './git.js';
import { loadConfig } from './config.js';
import { parseLcov } from './lcov.js';

/**
 * Prints the resolved coverage context and calculated diff coverage totals.
 *
 * This is presentation-only; it should not perform coverage math or change the
 * pass/fail decision.
 *
 * @param {object} config - Resolved CLI and file configuration.
 * @param {string[]} changedFiles - Git-relative changed files.
 * @param {Map<string, object>} coverageByFile - Parsed LCOV records by file.
 * @param {{executableLines: number, coveredLines: number, percentage: number}} diffCoverage - Calculated diff coverage result.
 * @returns {void}
 */
function printCoverageSummary(config, changedFiles, coverageByFile, diffCoverage) {
	console.table({
		'Threshold (%)': config.threshold,
		'LCOV Path': config.lcovPath,
		'LCOV Root Dir': config.rootDir,
		'Base Branch': config.baseBranch,
		'Changed Files': changedFiles.length,
		'LCOV Files': coverageByFile.size,
		'Executable Changed Lines': diffCoverage.executableLines,
		'Covered Changed Lines': diffCoverage.coveredLines,
		'Diff Coverage (%)': diffCoverage.percentage.toFixed(2),
	});
}

/**
 * Prints the list of Git-relative files included in the diff coverage check.
 *
 * @param {string[]} changedFiles - Git-relative changed file paths.
 * @returns {void}
 */
function printChangedFiles(changedFiles) {
	console.log('\nChanged files:');
	changedFiles.forEach((file) => {
		console.log(` - ${file}`);
	});
}

/**
 * Runs the coverage guard workflow for the current repository context.
 *
 * Determines the comparison branch from CLI arguments, CI metadata, or the
 * remote default branch, fetches the base branch in CI, and prints the changed
 * files that downstream coverage checks should evaluate.
 *
 * @param {object} args - Parsed CLI options.
 * @param {string} [args.base] - Explicit base branch override.
 * @param {string|number} args.threshold - Required coverage threshold percentage.
 * @param {string} args.lcov - Path to the LCOV report used by the check.
 * @returns {Promise<void>} Resolves after reporting the comparison context.
 */
export async function run(args) {
	console.log('Starting coverage check...');

	const env = getEnvironment();
	const base = args.base || env.baseBranch || getRemoteDefaultBranch();

	const config = loadConfig({
		...args,
		baseBranch: base,
	});

	console.log('🛠  Resolved Config:', config);

	console.log(`Environment: ${env.type.toUpperCase()}`);

	if(env.isCI) {
		fetchBranch(config.baseBranch);
	}

	const changedFiles = getChangedFiles(config.baseBranch);

	if (changedFiles.length === 0) {
		console.log('No changed files found.');
		return;
	}

	const changedLinesByFile = getChangedLines(config.baseBranch, changedFiles);
	const coverageByFile = parseLcov(config.lcovPath, {
		repoRoot: process.cwd(),
		rootDir: config.rootDir,
	});
	const diffCoverage = calculateDiffCoverage(changedLinesByFile, coverageByFile);

	printCoverageSummary(config, changedFiles, coverageByFile, diffCoverage);
	printChangedFiles(changedFiles);

	if (!passesThreshold(diffCoverage, config.threshold)) {
		throw new Error(
			`Diff coverage ${diffCoverage.percentage.toFixed(2)}% is below threshold ${config.threshold}%`
		);
	}

	console.log(`✅ Diff coverage ${diffCoverage.percentage.toFixed(2)}% meets the ${config.threshold}% threshold.`);
}
