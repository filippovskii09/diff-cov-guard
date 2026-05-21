const GLOB_SPECIAL_CHARS = new Set(['*', '?', '[', ']']);
const GLOBSTAR_SLASH_LENGTH = 3;
function normalizePattern(pattern) {
  return pattern.replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizeFilePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function hasGlobSyntax(pattern) {
  for (const char of pattern) {
    if (GLOB_SPECIAL_CHARS.has(char)) {
      return true;
    }
  }

  return false;
}

function matchesGlob(filePath, pattern) {
  const memo = new Map();

  function matches(fileIndex, patternIndex) {
    const key = `${fileIndex}:${patternIndex}`;

    if (memo.has(key)) {
      return memo.get(key);
    }

    const char = pattern[patternIndex];
    const nextChar = pattern[patternIndex + 1];
    const canConsume = fileIndex < filePath.length;
    let result;

    if (patternIndex === pattern.length) {
      result = fileIndex === filePath.length;
    } else if (char === '*' && nextChar === '*' && pattern[patternIndex + 2] === '/') {
      result =
        matches(fileIndex, patternIndex + GLOBSTAR_SLASH_LENGTH) ||
        (canConsume && matches(fileIndex + 1, patternIndex));
    } else if (char === '*' && nextChar === '*') {
      result = matches(fileIndex, patternIndex + 2) || (canConsume && matches(fileIndex + 1, patternIndex));
    } else if (char === '*') {
      result =
        matches(fileIndex, patternIndex + 1) ||
        (canConsume && filePath[fileIndex] !== '/' && matches(fileIndex + 1, patternIndex));
    } else if (char === '?') {
      result = canConsume && filePath[fileIndex] !== '/' && matches(fileIndex + 1, patternIndex + 1);
    } else {
      result = filePath[fileIndex] === char && matches(fileIndex + 1, patternIndex + 1);
    }

    memo.set(key, result);
    return result;
  }

  return matches(0, 0);
}

function patternMatches(filePath, pattern) {
  const normalizedPattern = normalizePattern(pattern);
  const normalizedFilePath = normalizeFilePath(filePath);

  if (!hasGlobSyntax(normalizedPattern)) {
    return normalizedFilePath === normalizedPattern;
  }

  return matchesGlob(normalizedFilePath, normalizedPattern);
}

export function isExcluded(filePath, patterns = []) {
  return patterns.some((pattern) => patternMatches(filePath, pattern));
}

export function filterExcludedFiles(files, patterns = []) {
  if (patterns.length === 0) {
    return files;
  }

  return files.filter((filePath) => !isExcluded(filePath, patterns));
}
