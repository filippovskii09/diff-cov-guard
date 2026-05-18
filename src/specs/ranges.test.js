import { describe, expect, test } from '@jest/globals';

import { containsLine, iterateRanges, normalizeRanges, rangesToChangedLinesMap } from '../ranges.js';
import { SOURCE_FILE } from './helpers/fixtures.js';

describe('ranges', () => {
  test('normalizes overlapping and adjacent ranges in sorted order', () => {
    expect(
      normalizeRanges([
        { start: 10, end: 12 },
        { start: 1, end: 2 },
        { start: 3, end: 5 },
        { start: 11, end: 20 },
      ])
    ).toEqual([
      { start: 1, end: 5 },
      { start: 10, end: 20 },
    ]);
  });

  test('iterates ranges and converts them to the public changed-lines map', () => {
    const ranges = [
      { start: 3, end: 4 },
      { start: 1, end: 1 },
    ];

    expect([...iterateRanges(ranges)]).toEqual([1, 3, 4]);
    expect([...rangesToChangedLinesMap(new Map([[SOURCE_FILE, ranges]])).get(SOURCE_FILE)]).toEqual([1, 3, 4]);
  });

  test('checks membership with a scan pointer', () => {
    const ranges = normalizeRanges([
      { start: 5, end: 7 },
      { start: 10, end: 10 },
    ]);
    const pointer = { index: 0 };

    expect(containsLine(ranges, 4, pointer)).toBe(false);
    expect(containsLine(ranges, 5, pointer)).toBe(true);
    expect(containsLine(ranges, 8, pointer)).toBe(false);
    expect(containsLine(ranges, 10, pointer)).toBe(true);
  });
});
