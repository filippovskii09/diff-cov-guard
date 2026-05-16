#!/usr/bin/env node

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ARGS_OPTIONS, DEFAULT_BASE_BRANCH } from '../src/constants.js';
import { runInit } from '../src/init.js';
import { run } from '../src/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

function createDefaultLifecycle() {
  return {
    log: console.log,
    error: console.error,
    exit: process.exit,
  };
}

export async function main(argv = process.argv.slice(2), lifecycle = createDefaultLifecycle()) {
  try {
    const [command] = argv;

    if (command === 'init') {
      await runInit();
      lifecycle.exit(0);
      return;
    }

    const { values } = parseArgs({ args: argv, options: ARGS_OPTIONS, allowPositionals: true });

    if (values.help) {
      lifecycle.log(`
🛡️ diff-cov-guard — A CLI tool for monitoring code coverage.

Usage:
  npx diff-cov-guard [options]
  npx diff-cov-guard init

Options:
  -t, --threshold <number>  Code coverage threshold in % (default: ${ARGS_OPTIONS.threshold.default})
  -l, --lcov <path>         Path to lcov.info (default: ${ARGS_OPTIONS.lcov.default})
  -b, --base <branch>       Base branch for comparison (default: ${DEFAULT_BASE_BRANCH})
      --root-dir <path>     Directory LCOV relative paths are based on (default: current directory)
      --fail-on-empty       Fail when the LCOV report is missing or empty
  -h, --help                Show help
  -v, --version             Show version
    `);
      lifecycle.exit(0);
      return;
    }

    if (values.version) {
      lifecycle.log(`diff-cov-guard v${version}`);
      lifecycle.exit(0);
      return;
    }

    await run(values);
  } catch (error) {
    lifecycle.error(`❌ Error: ${error.message}`);
    lifecycle.log('Use --help for available options.');
    lifecycle.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
