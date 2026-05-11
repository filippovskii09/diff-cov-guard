import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

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

	const absoluteSourcePath = isAbsolute(cleanSourcePath)
		? cleanSourcePath
		: resolve(absoluteRootDir, cleanSourcePath);

	return trimCurrentDirPrefix(toPosixPath(relative(absoluteRepoRoot, absoluteSourcePath)));
}

function createCoverageRecord(filePath) {
	return {
		path: filePath,
		lines: new Map(),
	};
}

function parseLineCoverage(line) {
	const [, payload] = line.split(':');
	if (!payload) {
		throw new Error(`Invalid LCOV format: malformed DA record "${line}"`);
	}

	const [lineNumber, hitCount] = payload.split(',');
	const parsedLineNumber = Number(lineNumber);
	const parsedHitCount = Number(hitCount);

	if (!Number.isInteger(parsedLineNumber) || !Number.isFinite(parsedHitCount)) {
		throw new Error(`Invalid LCOV format: malformed DA record "${line}"`);
	}

	return {
		lineNumber: parsedLineNumber,
		hitCount: parsedHitCount,
	};
}

function finalizeRecord(records, currentRecord) {
	if (currentRecord) {
		records.set(currentRecord.path, currentRecord);
	}
}

export function isLcovEmptyOrMissing(lcovPath) {
	if (!existsSync(lcovPath)) {
		return true;
	}

	return statSync(lcovPath).size === 0 || readFileSync(lcovPath, 'utf8').trim().length === 0;
}

/**
 * Parses an LCOV report and keys records by normalized repository-relative path.
 *
 * @param {string} lcovPath - Path to the lcov.info file.
 * @param {object} options - Path context.
 * @param {string} options.repoRoot - Absolute repository root path.
 * @param {string} [options.rootDir] - Directory relative LCOV paths start from.
 * @returns {Map<string, {path: string, lines: Map<number, number>}>}
 */
export function parseLcov(lcovPath, options = {}) {
	if (!existsSync(lcovPath)) {
		throw new Error(`LCOV file not found: ${lcovPath}`);
	}

	const content = readFileSync(lcovPath, 'utf8');
	const records = new Map();
	let currentRecord = null;

	for (const line of content.split(/\r?\n/)) {
		if (line.startsWith('SF:')) {
			finalizeRecord(records, currentRecord);

			const sourcePath = line.slice(3);
			if (sourcePath.trim().length === 0) {
				throw new Error('Invalid LCOV format: empty SF record');
			}

			currentRecord = createCoverageRecord(normalizePath(sourcePath, options));
			continue;
		}

		if (line.startsWith('DA:') && currentRecord) {
			const { lineNumber, hitCount } = parseLineCoverage(line);
			currentRecord.lines.set(lineNumber, hitCount);
			continue;
		}

		if (line === 'end_of_record') {
			finalizeRecord(records, currentRecord);
			currentRecord = null;
		}
	}

	finalizeRecord(records, currentRecord);

	if (records.size === 0) {
		throw new Error('Invalid LCOV format: no records found');
	}

	return records;
}
