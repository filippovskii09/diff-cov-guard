#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { ARGS_OPTIONS, DEFAULT_BASE_BRANCH } from './constants.js';
import { getEnvironment } from '../src/environment.js';

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
  -h, --help                Show help
  -v, --version             Show version
    `);
    process.exit(0);
  }

  if (values.version) {
    console.log('diff-cov-guard v0.1.0');
    process.exit(0);
  }

  console.log('🚀 Starting check with parameters:');
  console.table({
    'Threshold (%)': values.threshold,
    'LCOV path': values.lcov,
    'Base branch': values.base || 'Auto-detection (coming in 2.2)',
  });

	const env = getEnvironment();

const config = {
	threshold: Number(values.threshold),
	lcovPath: values.lcov,
	baseBranch: env.baseBranch || values.base || DEFAULT_BASE_BRANCH,
}

console.log(`Environment: ${env.type.toUpperCase()}`);
console.log(`Base branch: ${config.baseBranch}`);


} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  console.log('Use --help for available options.');
  process.exit(1);
}
