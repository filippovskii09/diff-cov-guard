import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { ARGS_OPTIONS, CONFIG_FILES } from './constants.js';

function readJsonFile(filePath, label) {
	if (!existsSync(filePath)) {
		return null;
	}

	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		console.warn(`Failed to read ${label} at ${filePath}: ${error.message}`);
		return null;
	}
}

function loadFileConfig(cwd) {
	return readJsonFile(join(cwd, CONFIG_FILES.RC_CONFIG_FILE), CONFIG_FILES.RC_CONFIG_FILE) ?? {};
}

function loadPackageConfig(cwd) {
	const packageJson = readJsonFile(
		join(cwd, CONFIG_FILES.PACKAGE_JSON_FILE),
		CONFIG_FILES.PACKAGE_JSON_FILE,
	);

	return packageJson?.[CONFIG_FILES.PACKAGE_CONFIG_KEY] ?? {};
}

function resolveConfig(cliArgs, fileConfigs) {
	return {
		threshold: Number(cliArgs.threshold ?? fileConfigs.threshold ?? ARGS_OPTIONS.threshold.default),
		lcovPath: cliArgs.lcov ?? fileConfigs.lcovPath ?? ARGS_OPTIONS.lcov.default,
		baseBranch: cliArgs.baseBranch ?? cliArgs.base ?? fileConfigs.baseBranch,
		rootDir: resolve(
			cliArgs.rootDir ?? cliArgs['root-dir'] ?? fileConfigs.rootDir ?? process.cwd(),
		),
		failOnEmpty: Boolean(
			cliArgs.failOnEmpty ?? cliArgs['fail-on-empty'] ?? fileConfigs.failOnEmpty ?? false,
		),
	};
}

export function loadConfig(cliArgs = {}) {
	const cwd = process.cwd();
	const packageConfig = loadPackageConfig(cwd);
	const fileConfig = loadFileConfig(cwd);

	const fileConfigs = {
		...packageConfig,
		...fileConfig,
	};

	return resolveConfig(cliArgs, fileConfigs);
}
