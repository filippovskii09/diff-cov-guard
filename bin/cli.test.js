import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { CONFIG_FILES, DEFAULT_BASE_BRANCH } from '../src/constants.js';

const run = jest.fn();
const runInit = jest.fn();

jest.unstable_mockModule('../src/index.js', () => ({ run }));
jest.unstable_mockModule('../src/init.js', () => ({ runInit }));

const cli = await import('./cli.js');
const packageJson = JSON.parse(readFileSync(join(process.cwd(), CONFIG_FILES.PACKAGE_JSON_FILE), 'utf8'));

let originalArgv;

function createLifecycle() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    exit: jest.fn(),
  };
}

beforeEach(() => {
  run.mockReset();
  runInit.mockReset();
  originalArgv = process.argv;
});

afterEach(() => {
  process.argv = originalArgv;
});

describe('cli', () => {
  test('runs init command and exits successfully', async () => {
    const lifecycle = createLifecycle();

    await cli.main(['init'], lifecycle);

    expect(runInit).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
  });

  test('prints help and exits successfully', async () => {
    const lifecycle = createLifecycle();

    await cli.main(['--help'], lifecycle);

    expect(lifecycle.log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(lifecycle.log).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_BASE_BRANCH));
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
    expect(run).not.toHaveBeenCalled();
  });

  test('prints the package version and exits successfully', async () => {
    const lifecycle = createLifecycle();

    await cli.main(['--version'], lifecycle);

    expect(lifecycle.log).toHaveBeenCalledWith(`diff-cov-guard v${packageJson.version}`);
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
    expect(run).not.toHaveBeenCalled();
  });

  test('passes parsed options to the coverage workflow', async () => {
    const lifecycle = createLifecycle();
    const threshold = '95';
    const lcovPath = './custom/lcov.info';
    const baseBranch = 'develop';
    const rootDir = 'workspace';

    await cli.main(
      ['--threshold', threshold, '--lcov', lcovPath, '--base', baseBranch, '--root-dir', rootDir, '--fail-on-empty'],
      lifecycle
    );

    expect(run).toHaveBeenCalledWith({
      threshold,
      lcov: lcovPath,
      base: baseBranch,
      'root-dir': rootDir,
      'fail-on-empty': true,
    });
    expect(lifecycle.exit).not.toHaveBeenCalled();
  });

  test('uses default argv and lifecycle when they are omitted', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    process.argv = [process.execPath, join(process.cwd(), 'bin/cli.js'), '--version'];

    await cli.main();

    expect(log).toHaveBeenCalledWith(`diff-cov-guard v${packageJson.version}`);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('runs automatically when loaded as the bin entrypoint', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    process.argv = [process.execPath, join(process.cwd(), 'bin/cli.js'), '--version'];

    await import(`./cli.js?entrypoint=${Date.now()}`);

    expect(log).toHaveBeenCalledWith(`diff-cov-guard v${packageJson.version}`);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('prints a friendly error and exits with failure', async () => {
    const lifecycle = createLifecycle();
    const error = new Error('coverage failed');
    run.mockRejectedValueOnce(error);

    await cli.main([], lifecycle);

    expect(lifecycle.error).toHaveBeenCalledWith(`❌ Error: ${error.message}`);
    expect(lifecycle.log).toHaveBeenCalledWith('Use --help for available options.');
    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });
});
