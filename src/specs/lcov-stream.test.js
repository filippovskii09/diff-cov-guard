import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from '@jest/globals';

import { calculateDiffCoverageFromLcovStream } from '../lcov-stream.js';
import { calculateDiffCoverage } from '../coverage.js';
import { parseLcov } from '../lcov.js';
import { README_FILE, SECOND_SOURCE_FILE, SOURCE_FILE, changedLinesMap } from './helpers/fixtures.js';

const LCOV_HIT_LINE = 1;
const LCOV_MISS_LINE = 2;
const LCOV_NON_EXECUTABLE_LINE = 3;

let tempDir;

function tempFile(content) {
  tempDir ??= mkdtempSync(join(tmpdir(), 'diff-cov-guard-stream-'));
  const path = join(tempDir, `lcov-${Math.random()}.info`);
  writeFileSync(path, content);
  return path;
}

function lcovRecord(filePath, entries, { end = true } = {}) {
  const lines = [`SF:${filePath}`, ...entries.map(([lineNumber, hitCount]) => `DA:${lineNumber},${hitCount}`)];
  return end ? [...lines, 'end_of_record'] : lines;
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('lcov stream accumulator', () => {
  test('matches parseLcov plus calculateDiffCoverage for representative records', async () => {
    const lcovPath = tempFile(
      [
        ...lcovRecord(SOURCE_FILE, [
          [LCOV_HIT_LINE, 1],
          [LCOV_MISS_LINE, 0],
          [LCOV_NON_EXECUTABLE_LINE, 1],
        ]),
        ...lcovRecord(SECOND_SOURCE_FILE, [[LCOV_MISS_LINE, 0]], { end: false }),
        ...lcovRecord(README_FILE, [[LCOV_HIT_LINE, 1]]),
      ].join('\r\n')
    );
    const changedLinesByFile = changedLinesMap([
      [SOURCE_FILE, [LCOV_HIT_LINE, LCOV_MISS_LINE]],
      [SECOND_SOURCE_FILE, [LCOV_MISS_LINE]],
    ]);
    const options = { repoRoot: process.cwd(), rootDir: process.cwd(), changedLinesByFile };
    const parsed = await parseLcov(lcovPath, options);
    const expected = calculateDiffCoverage(changedLinesByFile, parsed.records);

    await expect(calculateDiffCoverageFromLcovStream(lcovPath, options)).resolves.toMatchObject({
      emptyOrMissing: false,
      noRecords: false,
      diffCoverage: expected,
    });
  });

  test('keeps missing changed source records uncovered', async () => {
    const lcovPath = tempFile(lcovRecord(README_FILE, [[LCOV_HIT_LINE, 1]]).join('\n'));
    const changedLinesByFile = changedLinesMap([[SOURCE_FILE, [LCOV_HIT_LINE, LCOV_MISS_LINE]]]);

    const result = await calculateDiffCoverageFromLcovStream(lcovPath, {
      repoRoot: process.cwd(),
      rootDir: process.cwd(),
      changedLinesByFile,
    });

    expect(result).toMatchObject({ noRecords: true });
  });

  test('handles whitespace-only, missing final newline, and malformed records', async () => {
    await expect(
      calculateDiffCoverageFromLcovStream(tempFile(' \n\t '), { changedLinesByFile: new Map() })
    ).resolves.toMatchObject({
      emptyOrMissing: true,
    });

    await expect(
      calculateDiffCoverageFromLcovStream(tempFile(`SF:${SOURCE_FILE}\nDA:${LCOV_HIT_LINE},1`), {
        repoRoot: process.cwd(),
        rootDir: process.cwd(),
        changedLinesByFile: changedLinesMap([[SOURCE_FILE, [LCOV_HIT_LINE]]]),
      })
    ).resolves.toMatchObject({
      noRecords: false,
      diffCoverage: expect.objectContaining({ coveredLines: 1 }),
    });

    await expect(
      calculateDiffCoverageFromLcovStream(tempFile(`SF:${SOURCE_FILE}\nDA:x,1\n`), {
        changedLinesByFile: changedLinesMap([[SOURCE_FILE, [LCOV_HIT_LINE]]]),
      })
    ).rejects.toThrow('malformed DA record');

    await expect(
      calculateDiffCoverageFromLcovStream(tempFile('SF:   \n'), {
        changedLinesByFile: changedLinesMap([[SOURCE_FILE, [LCOV_HIT_LINE]]]),
      })
    ).rejects.toThrow('empty SF record');
  });
});
