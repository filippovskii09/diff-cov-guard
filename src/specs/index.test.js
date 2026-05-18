import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  CI_BASE_BRANCH,
  CLI_BASE_BRANCH,
  COMMENT_REASONS,
  COMMENT_STATUSES,
  DEFAULT_BRANCH,
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_LCOV_PATH,
  DEFAULT_THRESHOLD,
  ENV_TYPES,
  FULL_COVERAGE,
  README_FILE,
  SECOND_SOURCE_FILE,
  SOURCE_FILE,
  changedLinesMap,
  ciEnvironment,
  commentConfig,
  diffCoverage,
  fileResult,
  localEnvironment,
  runConfig,
} from './helpers/fixtures.js';

const environment = { getEnvironment: jest.fn() };
const git = {
  fetchBranch: jest.fn(),
  getChangedFiles: jest.fn(),
  getChangedLines: jest.fn(),
  getRemoteDefaultBranch: jest.fn(),
};
const config = { loadConfig: jest.fn() };
const lcov = {
  calculateDiffCoverageFromLcovStream: jest.fn(),
};
const coverage = {
  passesThreshold: jest.fn(),
};
const comment = {
  buildCommentBody: jest.fn(),
  publishCoverageComment: jest.fn(),
};

jest.unstable_mockModule('../environment.js', () => environment);
jest.unstable_mockModule('../git.js', () => git);
jest.unstable_mockModule('../config.js', () => config);
jest.unstable_mockModule('../lcov-stream.js', () => lcov);
jest.unstable_mockModule('../coverage.js', () => coverage);
jest.unstable_mockModule('../comment.js', () => comment);

const index = await import('../index.js');

let lifecycle;
let logs;

beforeEach(() => {
  jest.clearAllMocks();
  lifecycle = { exit: jest.fn() };
  logs = {
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    table: jest.spyOn(console, 'table').mockImplementation(() => {}),
  };
  environment.getEnvironment.mockReturnValue(localEnvironment());
  config.loadConfig.mockReturnValue(runConfig());
  git.getRemoteDefaultBranch.mockReturnValue(DEFAULT_BRANCH);
  git.getChangedFiles.mockReturnValue([SOURCE_FILE]);
  git.getChangedLines.mockReturnValue(changedLinesMap([[SOURCE_FILE, [1]]]));
  lcov.calculateDiffCoverageFromLcovStream.mockResolvedValue({
    emptyOrMissing: false,
    noRecords: false,
    diffCoverage: diffCoverage(),
  });
  coverage.passesThreshold.mockReturnValue(true);
  comment.buildCommentBody.mockReturnValue('comment body');
  comment.publishCoverageComment.mockResolvedValue();
});

describe('index helpers', () => {
  test('filters coverage source files case-insensitively', () => {
    const tsSourceFile = 'src/b.TS';
    const jsxSourceFile = 'src/c.jsx';
    const styleFile = 'src/style.css';

    expect(index.filterCoverageSourceFiles([SOURCE_FILE, tsSourceFile, jsxSourceFile, README_FILE, styleFile])).toEqual(
      [SOURCE_FILE, tsSourceFile, jsxSourceFile]
    );
  });

  test('detects changed line presence', () => {
    expect(index.hasChangedLines(changedLinesMap([[SOURCE_FILE, []]]))).toBe(false);
    expect(index.hasChangedLines(changedLinesMap([[SOURCE_FILE, [1]]]))).toBe(true);
  });

  test('creates rows, failing file list, and exit codes', () => {
    const failingLine = 2;
    const uncoveredDiffCoverage = diffCoverage({
      files: [
        fileResult({
          changedLines: [1, failingLine],
          executableLines: [1, failingLine],
          uncoveredLines: [failingLine],
        }),
        fileResult({
          filePath: SECOND_SOURCE_FILE,
          changedLines: [5],
          executableLines: [],
          coveredLines: [],
        }),
      ],
    });
    coverage.passesThreshold.mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(index.createReportRows(uncoveredDiffCoverage)).toEqual([
      { File: SOURCE_FILE, 'Changed Lines': 2, 'Covered Lines': 1, Percentage: '50%' },
      {
        File: SECOND_SOURCE_FILE,
        'Changed Lines': 1,
        'Covered Lines': 0,
        Percentage: '100% (No executable changes)',
      },
    ]);
    expect(index.getFailingFiles(uncoveredDiffCoverage)).toEqual([uncoveredDiffCoverage.files[0]]);
    expect(index.getExitCode({ percentage: 50 }, DEFAULT_THRESHOLD)).toBe(1);
    expect(index.getExitCode({ percentage: FULL_COVERAGE }, DEFAULT_THRESHOLD)).toBe(0);
  });
});

describe('run', () => {
  test('exits successfully when no files changed', async () => {
    git.getChangedFiles.mockReturnValue([]);

    await index.run({}, lifecycle);

    expect(lifecycle.exit).toHaveBeenCalledWith(0);
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('No changed files found'));
    expect(comment.buildCommentBody).toHaveBeenCalledWith(
      expect.objectContaining({ status: COMMENT_STATUSES.SKIPPED, reason: COMMENT_REASONS.NO_CHANGED_FILES })
    );
  });

  test('exits successfully when only non-source files changed', async () => {
    git.getChangedFiles.mockReturnValue([README_FILE]);

    await index.run({}, lifecycle);

    expect(lifecycle.exit).toHaveBeenCalledWith(0);
    expect(logs.log).toHaveBeenCalledWith('ℹ Nothing to check: only non-source files changed.');
  });

  test('exits successfully when source files have no changed lines', async () => {
    git.getChangedLines.mockReturnValue(changedLinesMap([[SOURCE_FILE, []]]));

    await index.run({}, lifecycle);

    expect(lifecycle.exit).toHaveBeenCalledWith(0);
    expect(logs.log).toHaveBeenCalledWith('ℹ No new executable lines found in this PR. Skipping.');
  });

  test('honors failOnEmpty for missing or empty LCOV', async () => {
    lcov.calculateDiffCoverageFromLcovStream.mockResolvedValue({
      emptyOrMissing: true,
      noRecords: false,
      diffCoverage: null,
    });

    await index.run({}, lifecycle);
    expect(lifecycle.exit).toHaveBeenCalledWith(0);

    lifecycle.exit.mockClear();
    config.loadConfig.mockReturnValue(runConfig({ failOnEmpty: true }));

    await index.run({}, lifecycle);

    expect(logs.warn).toHaveBeenCalledWith('WARN: LCOV file is empty or missing. Skipping coverage check.');
    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });

  test('runs passing coverage workflow and fetches in CI', async () => {
    environment.getEnvironment.mockReturnValue(ciEnvironment({ type: ENV_TYPES.GITHUB }));

    await index.run({}, lifecycle);

    expect(git.fetchBranch).toHaveBeenCalledWith(CI_BASE_BRANCH, DEFAULT_GIT_TIMEOUT_MS);
    expect(lcov.calculateDiffCoverageFromLcovStream).toHaveBeenCalledWith(DEFAULT_LCOV_PATH, {
      repoRoot: process.cwd(),
      rootDir: process.cwd(),
      changedLinesByFile: changedLinesMap([[SOURCE_FILE, [1]]]),
    });
    expect(logs.table).toHaveBeenCalled();
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Success: Diff Coverage is 100%'));
    expect(comment.publishCoverageComment).toHaveBeenCalledWith({
      env: expect.objectContaining({ type: ENV_TYPES.GITHUB }),
      config: expect.any(Object),
      body: 'comment body',
    });
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
  });

  test('prints failing coverage details and exits with failure', async () => {
    const uncoveredLine = 2;
    lcov.calculateDiffCoverageFromLcovStream.mockResolvedValue({
      emptyOrMissing: false,
      noRecords: false,
      diffCoverage: diffCoverage({
        percentage: 50,
        executableLines: 2,
        files: [
          fileResult({
            changedLines: [1, uncoveredLine],
            executableLines: [1, uncoveredLine],
            uncoveredLines: [uncoveredLine],
          }),
        ],
      }),
    });
    coverage.passesThreshold.mockReturnValue(false);

    await index.run({ baseBranch: CLI_BASE_BRANCH }, lifecycle);

    expect(git.getChangedFiles).toHaveBeenCalledWith(CLI_BASE_BRANCH, DEFAULT_GIT_TIMEOUT_MS);
    expect(logs.error).toHaveBeenCalledWith('\nFiles below diff coverage requirements:');
    expect(logs.error).toHaveBeenCalledWith(` - ${SOURCE_FILE}: uncovered changed lines ${uncoveredLine}`);
    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });

  test('keeps coverage exit code when comment publishing fails by default', async () => {
    const publishError = new Error('missing permission');
    comment.publishCoverageComment.mockRejectedValue(publishError);

    await index.run({}, lifecycle);

    expect(logs.warn).toHaveBeenCalledWith(`WARN: Failed to publish coverage comment: ${publishError.message}`);
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
  });

  test('fails when comment publishing fails and failOnError is enabled', async () => {
    comment.publishCoverageComment.mockRejectedValue(new Error('missing permission'));
    config.loadConfig.mockReturnValue(
      runConfig({
        comment: commentConfig({ enabled: true, failOnError: true }),
      })
    );

    await index.run({}, lifecycle);

    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });

  test('prints threshold failure without file details when no file has uncovered lines', async () => {
    const failingPercentage = 80;
    lcov.calculateDiffCoverageFromLcovStream.mockResolvedValue({
      emptyOrMissing: false,
      noRecords: false,
      diffCoverage: diffCoverage({
        percentage: failingPercentage,
        coveredLines: 4,
        executableLines: 5,
      }),
    });
    coverage.passesThreshold.mockReturnValue(false);

    await index.run({}, lifecycle);

    expect(logs.error).not.toHaveBeenCalledWith('\nFiles below diff coverage requirements:');
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining(`Fail: Diff Coverage is ${failingPercentage}%`));
    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });

  test('prints no-executable success report', async () => {
    lcov.calculateDiffCoverageFromLcovStream.mockResolvedValue({
      emptyOrMissing: false,
      noRecords: false,
      diffCoverage: diffCoverage({
        coveredLines: 0,
        executableLines: 0,
        files: [],
      }),
    });

    await index.run({}, lifecycle);

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('No executable changes'));
    expect(lifecycle.exit).toHaveBeenCalledWith(0);
  });

  test('wraps dependency errors with failure exit', async () => {
    const dependencyError = new Error('git exploded');
    git.getChangedFiles.mockImplementation(() => {
      throw dependencyError;
    });

    await index.run({}, lifecycle);

    expect(logs.error).toHaveBeenCalledWith(`Error: ${dependencyError.message}`);
    expect(lifecycle.exit).toHaveBeenCalledWith(1);
  });
});
