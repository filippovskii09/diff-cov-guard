#!/usr/bin/env node

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ARGS_OPTIONS, COMMENT_DEFAULTS, CONFIG_DEFAULTS, DEFAULT_BASE_BRANCH } from '../src/constants.js';
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
  -t, --threshold <number>  Code coverage threshold in % (default: ${CONFIG_DEFAULTS.threshold})
  -l, --lcov <path>         Path to lcov.info (default: ${CONFIG_DEFAULTS.lcovPath})
  -b, --base <branch>       Base branch for comparison (default: ${DEFAULT_BASE_BRANCH})
      --root-dir <path>     Directory LCOV relative paths are based on (default: current directory)
      --fail-on-empty       Fail when the LCOV report is missing or empty
      --git-timeout-ms <number>
                            Git command timeout in milliseconds (default: ${CONFIG_DEFAULTS.gitTimeoutMs})
      --api-timeout-ms <number>
                            GitHub/GitLab API timeout in milliseconds (default: ${CONFIG_DEFAULTS.apiTimeoutMs})
      --comment             Publish or update a PR/MR coverage comment
      --no-comment          Disable PR/MR coverage comments
      --comment-max-files <number>
                            Maximum files shown in the PR/MR comment (default: ${COMMENT_DEFAULTS.maxFiles})
      --comment-max-lines-per-file <number>
                            Maximum uncovered lines shown per file in the PR/MR comment (default: ${COMMENT_DEFAULTS.maxLinesPerFile})
      --comment-fail-on-error
                            Fail the guard when publishing the PR/MR comment fails
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
