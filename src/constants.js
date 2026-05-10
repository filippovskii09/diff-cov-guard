export const ENV_TYPES = {
	GITHUB: 'GITHUB',
	GITLAB: 'GITLAB',
	LOCAL: 'LOCAL',
}

export const DEFAULT_BRANCH = 'main';

export const DEFAULT_BASE_BRANCH = 'origin/main';

export const ARGS_OPTIONS = {
	threshold: {
		type: 'string',
		short: 't',
		default: '90',
	},
	lcov: {
		type: 'string',
		short: 'l',
		default: './coverage/lcov.info',
	},
	base: {
		type: 'string',
		short: 'b',
	},
	'root-dir': {
		type: 'string',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
	version: {
		type: 'boolean',
		short: 'v',
	},
};

export const CONFIG_FILES = {
	RC_CONFIG_FILE: '.diffcovguardrc',
	PACKAGE_JSON_FILE: 'package.json',
	PACKAGE_CONFIG_KEY: 'diffCovGuard',
};
