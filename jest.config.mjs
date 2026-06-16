export default {
  testEnvironment: 'node',
  transform: {},
  clearMocks: true,
  restoreMocks: true,
  coverageProvider: 'v8',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
  collectCoverageFrom: [
    'src/**/*.js',
    'bin/**/*.js',
    '!**/*.test.js',
    '!**/__tests__/**',
    '!**/specs/**',
    '!src/constants.js',
  ],
  testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/bin/**/*.test.js', '<rootDir>/src/**/*.spec.js'],
};
