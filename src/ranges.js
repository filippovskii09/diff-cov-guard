/**
 * @typedef {{start: number, end: number}} LineRange
 */

function compareRanges(left, right) {
  return left.start - right.start || left.end - right.end;
}

/**
 * Merges overlapping or adjacent inclusive line ranges.
 *
 * @param {LineRange[]} ranges - Inclusive line ranges.
 * @returns {LineRange[]} Sorted normalized ranges.
 */
export function normalizeRanges(ranges) {
  const sortedRanges = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start <= range.end)
    .toSorted(compareRanges);
  const normalizedRanges = [];

  for (const range of sortedRanges) {
    const previousRange = normalizedRanges.at(-1);

    if (!previousRange || range.start > previousRange.end + 1) {
      normalizedRanges.push({ ...range });
      continue;
    }

    previousRange.end = Math.max(previousRange.end, range.end);
  }

  return normalizedRanges;
}

/**
 * Iterates inclusive line ranges in sorted order.
 *
 * @param {LineRange[]} ranges - Inclusive line ranges.
 * @returns {Generator<number>}
 */
export function* iterateRanges(ranges) {
  for (const range of normalizeRanges(ranges)) {
    for (let lineNumber = range.start; lineNumber <= range.end; lineNumber += 1) {
      yield lineNumber;
    }
  }
}

/**
 * Converts accepted changed-line shapes into normalized ranges.
 *
 * @param {Set<number>|LineRange[]} changedLines - Public Set API or internal range API.
 * @returns {LineRange[]} Sorted normalized ranges.
 */
export function toLineRanges(changedLines) {
  if (changedLines instanceof Set) {
    return normalizeRanges([...changedLines].map((lineNumber) => ({ start: lineNumber, end: lineNumber })));
  }

  return normalizeRanges(changedLines ?? []);
}

/**
 * Tests line membership by scanning sorted ranges with a caller-owned pointer.
 *
 * @param {LineRange[]} ranges - Sorted inclusive ranges.
 * @param {number} lineNumber - Line number to test.
 * @param {{index: number}} pointer - Mutable scan pointer.
 * @returns {boolean} Whether the line is inside one of the ranges.
 */
export function containsLine(ranges, lineNumber, pointer = { index: 0 }) {
  while (pointer.index < ranges.length && ranges[pointer.index].end < lineNumber) {
    pointer.index += 1;
  }

  const range = ranges[pointer.index];

  return Boolean(range && range.start <= lineNumber && lineNumber <= range.end);
}

/**
 * Adds a range to a map of internal changed-line ranges.
 *
 * @param {Map<string, LineRange[]>} rangesByFile - Mutable ranges map.
 * @param {string} filePath - Git-relative file path.
 * @param {LineRange} range - Inclusive line range.
 * @returns {void}
 */
export function addRange(rangesByFile, filePath, range) {
  const ranges = rangesByFile.get(filePath) ?? [];
  ranges.push(range);
  rangesByFile.set(filePath, ranges);
}

/**
 * Converts internal changed-line ranges to the public Set-based API shape.
 *
 * @param {Map<string, LineRange[]>} rangesByFile - Internal ranges by file.
 * @returns {Map<string, Set<number>>} Public changed-line map.
 */
export function rangesToChangedLinesMap(rangesByFile) {
  const changedLinesByFile = new Map();

  for (const [filePath, ranges] of rangesByFile) {
    changedLinesByFile.set(filePath, new Set(iterateRanges(ranges)));
  }

  return changedLinesByFile;
}
