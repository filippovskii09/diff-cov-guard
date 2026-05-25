import { describe, expect, test } from '@jest/globals';

import { filterExcludedFiles, isExcluded } from '../exclude.js';

describe('exclude', () => {
  test.each([
    ['src/__test__/helper.js', '**/__test__/**'],
    ['src/__tests__/helper.js', '**/__tests__/**'],
    ['src/component.test.ts', '**/*.test.ts'],
    ['src/component.test.tsx', '**/*.test.tsx'],
    ['src/component.test.js', '**/*.test.js'],
    ['component.test.jsx', '**/*.test.jsx'],
    ['src/component.spec.mjs', '**/*.spec.mjs'],
    ['src/component.spec.js', '**/*.spec.js'],
    ['component.spec.jsx', '**/*.spec.jsx'],
    ['jest.config.js', 'jest.config.js'],
    ['jest.config.ts', 'jest.config.ts'],
    ['src/nested/component.test.js', 'src/**/*.test.js'],
    ['src/a/b/c/helper.js', 'src/**/helper.js'],
    ['src/abc.js', 'src/a?c.js'],
  ])('matches %s with %s', (filePath, pattern) => {
    expect(isExcluded(filePath, [pattern])).toBe(true);
  });

  test.each([
    ['src/nested/component.test.js', 'src/*.test.js'],
    ['src/ac.js', 'src/a?c.js'],
    ['src/a/b/c/helper.js', 'src/*/helper.js'],
  ])('does not match %s with %s', (filePath, pattern) => {
    expect(isExcluded(filePath, [pattern])).toBe(false);
  });

  test('filters excluded files and keeps source files that do not match exclude patterns', () => {
    expect(
      filterExcludedFiles(
        ['src/a.js', 'src/a.test.js', 'src/__tests__/a.js', 'jest.config.js'],
        ['**/__tests__/**', '**/*.test.js', 'jest.config.js']
      )
    ).toEqual(['src/a.js']);
  });

  test('returns files unchanged when no exclusion patterns are configured', () => {
    const files = ['src/a.js', 'src/a.test.js'];

    expect(filterExcludedFiles(files)).toBe(files);
  });
});
