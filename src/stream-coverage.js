import { iterateRanges, toLineRanges } from './ranges.js';

function createFileResult(filePath, changedLines) {
  const sortedChangedLines = [...iterateRanges(toLineRanges(changedLines))];

  return {
    filePath,
    changedLines: sortedChangedLines,
    executableLines: [...sortedChangedLines],
    coveredLines: [],
    uncoveredLines: [...sortedChangedLines],
    hasCoverage: false,
  };
}

export function createDiffCoverageAccumulator(changedLinesByFile = new Map()) {
  const files = new Map();
  let coverageRecordCount = 0;

  for (const [filePath, changedLines] of changedLinesByFile) {
    files.set(filePath, createFileResult(filePath, changedLines));
  }

  return {
    markFileCovered(filePath) {
      const file = files.get(filePath);

      if (file && !file.hasCoverage) {
        coverageRecordCount += 1;
        file.hasCoverage = true;
        file.executableLines = [];
        file.uncoveredLines = [];
      }
    },

    addExecutableLine(filePath, lineNumber, hitCount) {
      const file = files.get(filePath);

      if (!file) {
        return;
      }

      file.executableLines.push(lineNumber);

      if (hitCount > 0) {
        file.coveredLines.push(lineNumber);
      } else {
        file.uncoveredLines.push(lineNumber);
      }
    },

    hasAnyCoverageRecord() {
      return coverageRecordCount > 0;
    },

    finish() {
      const fileResults = [...files.values()];
      const executableLines = fileResults.reduce((total, file) => total + file.executableLines.length, 0);
      const coveredLines = fileResults.reduce((total, file) => total + file.coveredLines.length, 0);

      return {
        percentage: executableLines === 0 ? 100 : (coveredLines / executableLines) * 100,
        coveredLines,
        executableLines,
        files: fileResults,
      };
    },
  };
}
