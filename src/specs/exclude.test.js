import { describe, expect, test } from '@jest/globals';

import { filterExcludedFiles, isExcluded } from '../exclude.js';

describe('exclude', () => {
  test.each([
    ['src/__test__/helper.js', '**/__test__/**'],
    ['src/__tests__/helper.js', '**/__tests__/**'],
    ['src/component.test.js', '**/*.test.js'],
    ['component.test.jsx', '**/*.test.jsx'],
    ['src/component.spec.js', '**/*.spec.js'],
    ['component.spec.jsx', '**/*.spec.jsx'],
    ['jest.config.js', 'jest.config.js'],
  ])('matches %s with %s', (filePath, pattern) => {
    expect(isExcluded(filePath, [pattern])).toBe(true);
  });

  test('filters excluded files and keeps source files that do not match exclude patterns', () => {
    expect(
      filterExcludedFiles(
        ['src/a.js', 'src/a.test.js', 'src/__tests__/a.js', 'jest.config.js'],
        ['**/__tests__/**', '**/*.test.js', 'jest.config.js']
      )
    ).toEqual(['src/a.js']);
  });
});
