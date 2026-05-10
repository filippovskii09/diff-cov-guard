import { getEnvironment } from "./environment.js";
import { fetchBranch, getChangedFiles, getRemoteDefaultBranch } from "./git.js";
import { loadConfig } from "./config.js";
import { parseLcov } from "./lcov.js";

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
	const coverageByFile = parseLcov(config.lcovPath, {
		repoRoot: process.cwd(),
		rootDir: config.rootDir,
	});

  console.table({
    'Threshold (%)': config.threshold,
    'LCOV Path': config.lcovPath,
    'LCOV Root Dir': config.rootDir,
    'Base Branch': config.baseBranch,
		'Changed Files': changedFiles.length,
		'LCOV Files': coverageByFile.size,
  });

	if(changedFiles.length === 0) {
		console.log('No changed files found.');
		return;
	}

	console.log('\nChanged files:');
	changedFiles.forEach((file) => {
		console.log(` - ${file}`);
	});
}
