#!/usr/bin/env node

import { parseArgs } from 'node:util';

const options = {
  threshold: {
    type: 'string',
    short: 't',
    default: '90',
  },
  lcov: {
    type: 'string',
    short: 'l',
    default: './coverage/lcov.info',
  },
  base: {
    type: 'string',
    short: 'b',
  },
  help: {
    type: 'boolean',
    short: 'h',
  },
  version: {
    type: 'boolean',
    short: 'v',
  },
};

try {
  const { values } = parseArgs({ options, allowPositionals: true });

  if (values.help) {
    console.log(`
🛡️ diff-cov-guard — A CLI tool for monitoring code coverage.

Usage:
  npx diff-cov-guard [options]

Options:
  -t, --threshold <number>  Code coverage threshold in % (default: 90)
  -l, --lcov <path>         Path to lcov.info (default: ./coverage/lcov.info)
  -b, --base <branch>       Base branch for comparison (e.g., origin/main)
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

} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  console.log('Use --help for available options.');
  process.exit(1);
}
