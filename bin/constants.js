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
	help: {
		type: 'boolean',
		short: 'h',
	},
	version: {
		type: 'boolean',
		short: 'v',
	},
};
