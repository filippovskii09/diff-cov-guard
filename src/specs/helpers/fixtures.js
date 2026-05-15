import { ARGS_OPTIONS, CONFIG_FILES, DEFAULT_BRANCH, ENV_TYPES } from '../../constants.js';

export { ARGS_OPTIONS, CONFIG_FILES, DEFAULT_BRANCH, ENV_TYPES };

export const DEFAULT_THRESHOLD = Number(ARGS_OPTIONS.threshold.default);
export const DEFAULT_LCOV_PATH = ARGS_OPTIONS.lcov.default;
export const CURRENT_BRANCH = 'feature';
export const DEVELOP_BRANCH = 'develop';
export const RELEASE_BRANCH = 'release';
export const MISSING_BRANCH = 'missing';
export const CLI_BASE_BRANCH = 'cli-base';
export const CI_BASE_BRANCH = 'origin-main';

export const SOURCE_FILE = 'src/a.js';
export const SECOND_SOURCE_FILE = 'src/b.js';
export const NEW_SOURCE_FILE = 'src/new.js';
export const EXTRA_SOURCE_FILE = 'src/extra.js';
export const MISSING_SOURCE_FILE = 'src/missing.js';
export const README_FILE = 'README.md';

export const FULL_COVERAGE = 100;
export const EMPTY_OUTPUT = '';
export const LCOV_CONTENT = 'lcov';
export const NO_REMOTE_ERROR_MESSAGE = 'no remote';
export const PERMISSION_ERROR_MESSAGE = 'denied';
export const PERMISSION_ERROR_CODE = 'EACCES';

export function permissionDeniedError(message = PERMISSION_ERROR_MESSAGE) {
	const error = new Error(message);
	error.code = PERMISSION_ERROR_CODE;
	return error;
}

export function coverageRecord(path = SOURCE_FILE, lines = []) {
	return { path, lines: new Map(lines) };
}

export function changedLinesMap(entries) {
	return new Map(entries.map(([filePath, lines]) => [filePath, new Set(lines)]));
}

export function fileResult(overrides = {}) {
	return {
		filePath: SOURCE_FILE,
		changedLines: [1],
		executableLines: [1],
		coveredLines: [1],
		uncoveredLines: [],
		...overrides,
	};
}

export function diffCoverage(overrides = {}) {
	return {
		percentage: FULL_COVERAGE,
		coveredLines: 1,
		executableLines: 1,
		files: [fileResult()],
		...overrides,
	};
}

export function runConfig(overrides = {}) {
	return {
		threshold: DEFAULT_THRESHOLD,
		lcovPath: DEFAULT_LCOV_PATH,
		rootDir: process.cwd(),
		failOnEmpty: false,
		...overrides,
	};
}

export function localEnvironment(overrides = {}) {
	return {
		type: ENV_TYPES.LOCAL,
		isCI: false,
		baseBranch: null,
		...overrides,
	};
}

export function ciEnvironment(overrides = {}) {
	return {
		type: ENV_TYPES.GITHUB,
		isCI: true,
		baseBranch: CI_BASE_BRANCH,
		...overrides,
	};
}

export function packageJson(overrides = {}) {
	return {
		scripts: {},
		...overrides,
	};
}
