import { describe, expect, test } from '@jest/globals';

import { createDiffCoverageAccumulator } from '../stream-coverage.js';
import { README_FILE, SOURCE_FILE, changedLinesMap } from './helpers/fixtures.js';

describe('stream coverage accumulator', () => {
  test('ignores unknown files and does not double-count matching LCOV records', () => {
    const accumulator = createDiffCoverageAccumulator(changedLinesMap([[SOURCE_FILE, [1]]]));

    accumulator.addExecutableLine(README_FILE, 1, 1);
    accumulator.markFileCovered(SOURCE_FILE);
    accumulator.markFileCovered(SOURCE_FILE);
    accumulator.addExecutableLine(SOURCE_FILE, 1, 0);

    expect(accumulator.hasAnyCoverageRecord()).toBe(true);
    expect(accumulator.finish()).toMatchObject({
      percentage: 0,
      coveredLines: 0,
      executableLines: 1,
      files: [
        {
          filePath: SOURCE_FILE,
          hasCoverage: true,
          uncoveredLines: [1],
        },
      ],
    });
  });
});
