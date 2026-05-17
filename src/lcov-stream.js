import { createReadStream, existsSync, statSync } from 'node:fs';

import { createDiffCoverageAccumulator } from './stream-coverage.js';
import { normalizePath } from './lcov.js';
import { containsLine, toLineRanges } from './ranges.js';

const SF_PREFIX = Buffer.from('SF:');
const DA_PREFIX = Buffer.from('DA:');
const END_OF_RECORD = Buffer.from('end_of_record');
const LF = 10;
const CR = 13;
const COMMA = 44;
const ZERO = 48;
const NINE = 57;
const TAB = 9;
const SPACE = 32;
const DECIMAL_BASE = 10;

function createParseResult(overrides = {}) {
  return {
    emptyOrMissing: false,
    noRecords: false,
    diffCoverage: null,
    ...overrides,
  };
}

function startsWith(buffer, prefix) {
  if (buffer.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (buffer[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function isWhitespace(byte) {
  return byte === TAB || byte === LF || byte === CR || byte === SPACE;
}

function isBlank(buffer) {
  for (const byte of buffer) {
    if (!isWhitespace(byte)) {
      return false;
    }
  }

  return true;
}

function trimTrailingCarriageReturn(line) {
  return line.at(-1) === CR ? line.subarray(0, -1) : line;
}

function parseUnsignedInteger(buffer, startIndex, endIndex) {
  if (startIndex >= endIndex) {
    return null;
  }

  let value = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const byte = buffer[index];

    if (byte < ZERO || byte > NINE) {
      return null;
    }

    value = value * DECIMAL_BASE + (byte - ZERO);
  }

  return value;
}

function parseDaLine(line) {
  let commaIndex = -1;

  for (let index = DA_PREFIX.length; index < line.length; index += 1) {
    if (line[index] === COMMA) {
      commaIndex = index;
      break;
    }
  }

  if (commaIndex === -1) {
    throw new Error(`Invalid LCOV format: malformed DA record "${line.toString('utf8')}"`);
  }

  const lineNumber = parseUnsignedInteger(line, DA_PREFIX.length, commaIndex);
  const hitCount = parseUnsignedInteger(line, commaIndex + 1, line.length);

  if (lineNumber === null || hitCount === null) {
    throw new Error(`Invalid LCOV format: malformed DA record "${line.toString('utf8')}"`);
  }

  return { lineNumber, hitCount };
}

function createChangedLineLookup(changedLinesByFile) {
  const lookup = new Map();

  for (const [filePath, changedLines] of changedLinesByFile) {
    lookup.set(filePath, {
      ranges: toLineRanges(changedLines),
      pointer: { index: 0 },
    });
  }

  return lookup;
}

function createPathNormalizer(options) {
  const cache = new Map();

  return function normalizeSourcePath(sourcePath) {
    if (!cache.has(sourcePath)) {
      cache.set(sourcePath, normalizePath(sourcePath, options));
    }

    return cache.get(sourcePath);
  };
}

function handleLine(line, state) {
  if (!state.hasContent && !isBlank(line)) {
    state.hasContent = true;
  }

  if (startsWith(line, SF_PREFIX)) {
    const sourcePathBuffer = line.subarray(SF_PREFIX.length);
    const sourcePath = sourcePathBuffer.toString('utf8');

    if (sourcePath.trim().length === 0) {
      throw new Error('Invalid LCOV format: empty SF record');
    }

    const normalizedPath = state.normalizeSourcePath(sourcePath);
    const changedLines = state.changedLineLookup.get(normalizedPath);

    state.currentRecord = changedLines
      ? {
          filePath: normalizedPath,
          changedLines,
          hasRecord: true,
        }
      : null;

    if (state.currentRecord) {
      state.accumulator.markFileCovered(normalizedPath);
    }
    return;
  }

  if (startsWith(line, DA_PREFIX) && state.currentRecord) {
    const { lineNumber, hitCount } = parseDaLine(line);

    if (containsLine(state.currentRecord.changedLines.ranges, lineNumber, state.currentRecord.changedLines.pointer)) {
      state.accumulator.addExecutableLine(state.currentRecord.filePath, lineNumber, hitCount);
    }
    return;
  }

  if (line.equals(END_OF_RECORD)) {
    state.currentRecord = null;
  }
}

/**
 * Calculates diff coverage directly from LCOV bytes without building full LCOV records.
 *
 * @param {string} lcovPath - Path to the lcov.info file.
 * @param {object} options - Path and diff context.
 * @param {Map<string, Set<number>|{start: number, end: number}[]>} options.changedLinesByFile - Changed lines by file.
 * @returns {Promise<{emptyOrMissing: boolean, noRecords: boolean, diffCoverage: object|null}>}
 */
export async function calculateDiffCoverageFromLcovStream(lcovPath, options = {}) {
  if (!existsSync(lcovPath) || statSync(lcovPath).size === 0) {
    return createParseResult({ emptyOrMissing: true });
  }

  const accumulator = createDiffCoverageAccumulator(options.changedLinesByFile);
  const state = {
    accumulator,
    changedLineLookup: createChangedLineLookup(options.changedLinesByFile ?? new Map()),
    currentRecord: null,
    hasContent: false,
    normalizeSourcePath: createPathNormalizer(options),
  };
  const stream = createReadStream(lcovPath);
  let pending = Buffer.alloc(0);

  for await (const chunk of stream) {
    const buffer = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    let lineStart = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] !== LF) {
        continue;
      }

      handleLine(trimTrailingCarriageReturn(buffer.subarray(lineStart, index)), state);
      lineStart = index + 1;
    }

    pending = buffer.subarray(lineStart);
  }

  if (pending.length > 0) {
    handleLine(trimTrailingCarriageReturn(pending), state);
  }

  if (!state.hasContent) {
    return createParseResult({ emptyOrMissing: true });
  }

  if (!accumulator.hasAnyCoverageRecord()) {
    return createParseResult({ noRecords: true });
  }

  return createParseResult({ diffCoverage: accumulator.finish() });
}
