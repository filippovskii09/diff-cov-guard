const GLOB_SPECIAL_CHARS = new Set(['*', '?', '[', ']']);
const REGEX_SPECIAL_CHARS = new Set(['\\', '^', '$', '.', '|', '+', '(', ')', '{', '}']);

function normalizePattern(pattern) {
  return pattern.replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizeFilePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function escapeRegexChar(char) {
  return REGEX_SPECIAL_CHARS.has(char) ? `\\${char}` : char;
}

function globToRegex(pattern) {
  const normalizedPattern = normalizePattern(pattern);
  let regex = '^';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    const nextChar = normalizedPattern[index + 1];
    const previousChar = normalizedPattern[index - 1];
    const afterNextChar = normalizedPattern[index + 2];

    if (char === '*' && nextChar === '*' && previousChar !== '*' && afterNextChar === '/') {
      regex += '(?:.*/)?';
      index += 2;
      continue;
    }

    if (char === '*' && nextChar === '*') {
      regex += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      regex += '[^/]*';
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    regex += escapeRegexChar(char);
  }

  return new RegExp(`${regex}$`);
}

function hasGlobSyntax(pattern) {
  for (const char of pattern) {
    if (GLOB_SPECIAL_CHARS.has(char)) {
      return true;
    }
  }

  return false;
}

function patternMatches(filePath, pattern) {
  const normalizedPattern = normalizePattern(pattern);
  const normalizedFilePath = normalizeFilePath(filePath);

  if (!hasGlobSyntax(normalizedPattern)) {
    return normalizedFilePath === normalizedPattern;
  }

  return globToRegex(normalizedPattern).test(normalizedFilePath);
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
