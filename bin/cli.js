#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { getEnvironment } from '../src/environment.js';
import { ARGS_OPTIONS, DEFAULT_BASE_BRANCH } from './constants.js';
import { getRemoteDefaultBranch } from '../src/git.js';

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

  const env = getEnvironment();

  const resolvedBase = values.base || env.baseBranch || getRemoteDefaultBranch();

  const config = {
    threshold: Number(values.threshold),
    lcovPath: values.lcov,
    baseBranch: resolvedBase,
  }

  console.log(`Environment: ${env.type.toUpperCase()}`);

  console.table({
    'Threshold (%)': config.threshold,
    'LCOV Path': config.lcovPath,
    'Base Branch': config.baseBranch,
  });

} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  console.log('Use --help for available options.');
  process.exit(1);
}
