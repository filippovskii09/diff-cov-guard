import { getEnvironment } from "./environment.js";
import { fetchBranch, getChangedFiles, getRemoteDefaultBranch } from "./git.js";

export async function run(args) {
	console.log('Starting coverage check...');

	const env = getEnvironment();
	const base = args.base || env.baseBranch || getRemoteDefaultBranch();

  const config = {
    threshold: Number(args.threshold),
    lcovPath: args.lcov,
    baseBranch: base,
  };

	console.log(`Environment: ${env.type.toUpperCase()}`);

	if(env.isCI) {
		fetchBranch(config.baseBranch);
	}

	const changedFiles = getChangedFiles(config.baseBranch);

  console.table({
    'Threshold (%)': config.threshold,
    'LCOV Path': config.lcovPath,
    'Base Branch': config.baseBranch,
		'Changed Files': changedFiles.length,
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