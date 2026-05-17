import { closeSync, createReadStream, existsSync, openSync, readSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const LCOV_SOURCE_PREFIX_LENGTH = 3;
const LCOV_LINE_PREFIX_LENGTH = 3;
const LCOV_EMPTY_CHECK_BUFFER_SIZE = 8192;

function toPosixPath(filePath) {
  return filePath.split(sep).join('/').replaceAll('\\', '/');
}

function trimCurrentDirPrefix(filePath) {
  return filePath.replace(/^\.\//, '');
}

/**
 * Converts LCOV source paths to repository-relative paths.
 *
 * Git reports changed files relative to the repository root. LCOV can report
 * paths as absolute, repo-relative, or relative to the directory where tests ran.
 * This function brings those variants into the same shape Git uses.
 *
 * @param {string} sourcePath - Path from an LCOV SF record.
 * @param {object} options - Path context.
 * @param {string} options.repoRoot - Absolute repository root path.
 * @param {string} [options.rootDir] - Directory relative LCOV paths start from.
 * @returns {string} Repository-relative POSIX-style path.
 */
export function normalizePath(sourcePath, { repoRoot = process.cwd(), rootDir = repoRoot } = {}) {
  const cleanSourcePath = sourcePath.trim();
  const absoluteRepoRoot = resolve(repoRoot);
  const absoluteRootDir = resolve(rootDir);

  const absoluteSourcePath = isAbsolute(cleanSourcePath) ? cleanSourcePath : resolve(absoluteRootDir, cleanSourcePath);

  return trimCurrentDirPrefix(toPosixPath(relative(absoluteRepoRoot, absoluteSourcePath)));
}

function createCoverageRecord(filePath) {
  return {
    path: filePath,
    lines: new Map(),
  };
}

function createParseResult(overrides = {}) {
  return {
    emptyOrMissing: false,
    noRecords: false,
    records: new Map(),
    ...overrides,
  };
}

function isValidNumberText(value) {
  return value.length > 0 && value.trim() === value;
}

function parseLineCoverage(line) {
  const commaIndex = line.indexOf(',', LCOV_LINE_PREFIX_LENGTH);

  if (commaIndex === -1) {
    throw new Error(`Invalid LCOV format: malformed DA record "${line}"`);
  }

  const lineNumberText = line.slice(LCOV_LINE_PREFIX_LENGTH, commaIndex);
  const hitCountText = line.slice(commaIndex + 1);

  if (!isValidNumberText(lineNumberText) || !isValidNumberText(hitCountText)) {
    throw new Error(`Invalid LCOV format: malformed DA record "${line}"`);
  }

  const lineNumber = Number(lineNumberText);
  const hitCount = Number(hitCountText);

  if (!Number.isInteger(lineNumber) || !Number.isFinite(hitCount)) {
    throw new Error(`Invalid LCOV format: malformed DA record "${line}"`);
  }

  return {
    lineNumber,
    hitCount,
  };
}

function finalizeRecord(records, currentRecord) {
  if (currentRecord) {
    records.set(currentRecord.path, currentRecord);
  }
}

function shouldKeepRecord(filePath, changedLinesByFile) {
  return !changedLinesByFile || changedLinesByFile.has(filePath);
}

function shouldKeepLine(lineNumber, changedLines) {
  return !changedLines || changedLines.has(lineNumber);
}

export function isLcovEmptyOrMissing(lcovPath) {
  if (!existsSync(lcovPath)) {
    return true;
  }

  if (statSync(lcovPath).size === 0) {
    return true;
  }

  const file = openSync(lcovPath, 'r');
  const buffer = Buffer.allocUnsafe(LCOV_EMPTY_CHECK_BUFFER_SIZE);

  try {
    let bytesRead = readSync(file, buffer, 0, buffer.length, null);

    while (bytesRead > 0) {
      if (buffer.toString('utf8', 0, bytesRead).trim().length > 0) {
        return false;
      }

      bytesRead = readSync(file, buffer, 0, buffer.length, null);
    }
  } finally {
    closeSync(file);
  }

  return true;
}

/**
 * Parses an LCOV report and keys records by normalized repository-relative path.
 *
 * When `changedLinesByFile` is provided, the parser stores only changed files
 * and only line hits for changed lines. Missing changed files remain absent so
 * `calculateDiffCoverage()` can treat their changed lines as uncovered.
 *
 * @param {string} lcovPath - Path to the lcov.info file.
 * @param {object} options - Path context.
 * @param {string} options.repoRoot - Absolute repository root path.
 * @param {string} [options.rootDir] - Directory relative LCOV paths start from.
 * @param {Map<string, Set<number>>} [options.changedLinesByFile] - Optional diff filter.
 * @returns {Promise<{emptyOrMissing: boolean, noRecords: boolean, records: Map<string, {path: string, lines: Map<number, number>}>}>}
 */
export async function parseLcov(lcovPath, options = {}) {
  if (!existsSync(lcovPath)) {
    return createParseResult({ emptyOrMissing: true });
  }

  if (statSync(lcovPath).size === 0) {
    return createParseResult({ emptyOrMissing: true });
  }

  const records = new Map();
  const stream = createReadStream(lcovPath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let hasContent = false;
  let currentRecord = null;
  let currentChangedLines = null;

  for await (const line of lines) {
    if (!hasContent && line.trim().length > 0) {
      hasContent = true;
    }

    if (line.startsWith('SF:')) {
      finalizeRecord(records, currentRecord);

      const sourcePath = line.slice(LCOV_SOURCE_PREFIX_LENGTH);
      if (sourcePath.trim().length === 0) {
        throw new Error('Invalid LCOV format: empty SF record');
      }

      const normalizedPath = normalizePath(sourcePath, options);
      if (shouldKeepRecord(normalizedPath, options.changedLinesByFile)) {
        currentRecord = createCoverageRecord(normalizedPath);
        currentChangedLines = options.changedLinesByFile?.get(normalizedPath) ?? null;
      } else {
        currentRecord = null;
        currentChangedLines = null;
      }
      continue;
    }

    if (line.startsWith('DA:') && currentRecord) {
      const { lineNumber, hitCount } = parseLineCoverage(line);

      if (shouldKeepLine(lineNumber, currentChangedLines)) {
        currentRecord.lines.set(lineNumber, hitCount);
      }
      continue;
    }

    if (line === 'end_of_record') {
      finalizeRecord(records, currentRecord);
      currentRecord = null;
      currentChangedLines = null;
    }
  }

  finalizeRecord(records, currentRecord);

  if (!hasContent) {
    return createParseResult({ emptyOrMissing: true });
  }

  if (records.size === 0) {
    return createParseResult({ noRecords: true });
  }

  return createParseResult({ records });
}
