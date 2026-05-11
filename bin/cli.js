#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { ARGS_OPTIONS, DEFAULT_BASE_BRANCH } from '../src/constants.js';
import { run } from '../src/index.js';

try {
	const { values } = parseArgs({ options: ARGS_OPTIONS, allowPositionals: true });

	if (values.help) {
		console.log(`
🛡️ diff-cov-guard — A CLI tool for monitoring code coverage.

Usage:
  npx diff-cov-guard [options]

Options:
  -t, --threshold <number>  Code coverage threshold in % (default: ${ARGS_OPTIONS.threshold.default})
  -l, --lcov <path>         Path to lcov.info (default: ${ARGS_OPTIONS.lcov.default})
  -b, --base <branch>       Base branch for comparison (default: ${DEFAULT_BASE_BRANCH})
      --root-dir <path>     Directory LCOV relative paths are based on (default: current directory)
  -h, --help                Show help
  -v, --version             Show version
    `);
		process.exit(0);
	}

	if (values.version) {
		console.log('diff-cov-guard v0.1.0');
		process.exit(0);
	}

	await run(values);

} catch (error) {
	console.error(`❌ Error: ${error.message}`);
	console.log('Use --help for available options.');
	process.exit(1);
}
