import { COMMENT_MARKER, COMMENT_REASONS, COMMENT_STATUSES, ENV_TYPES } from './constants.js';

const COMMENT_STATUS_TITLES = {
  [COMMENT_STATUSES.PASSED]: '✅ Passed',
  [COMMENT_STATUSES.FAILED]: '❌ Failed',
  [COMMENT_STATUSES.SKIPPED]: '⏭️ Not required',
};

function formatPercentage(percentage) {
  return `${Number(percentage.toFixed(2))}%`;
}

function getStatusTitle(status) {
  return COMMENT_STATUS_TITLES[status] ?? COMMENT_STATUS_TITLES[COMMENT_STATUSES.SKIPPED];
}

function getChangeContext(env) {
  if (env?.type === ENV_TYPES.GITHUB) {
    return 'pull request';
  }

  if (env?.type === ENV_TYPES.GITLAB) {
    return 'merge request';
  }

  return 'diff';
}

function getSummary(status, reason, env) {
  const changeContext = getChangeContext(env);

  if (status === COMMENT_STATUSES.PASSED) {
    return `All changed executable lines in this ${changeContext} meet the required coverage threshold.`;
  }

  if (status === COMMENT_STATUSES.FAILED) {
    return `Coverage validation did not pass for this ${changeContext}.`;
  }

  if (reason === COMMENT_REASONS.NO_CHANGED_FILES) {
    return `No files were changed in this ${changeContext}.`;
  }

  if (reason === COMMENT_REASONS.ONLY_NON_SOURCE_FILES) {
    return `No source files were changed in this ${changeContext}.`;
  }

  if (reason === COMMENT_REASONS.NO_EXECUTABLE_CHANGED_LINES) {
    return `No changed executable lines were detected in this ${changeContext}.`;
  }

  return `Coverage validation was not required for this ${changeContext}.`;
}

function getReasonDetail(reason) {
  if (reason === COMMENT_REASONS.ONLY_NON_SOURCE_FILES) {
    return 'Coverage validation was skipped because this diff only contains non-source files.';
  }

  if (reason === COMMENT_REASONS.NO_LCOV_MATCH) {
    return 'Coverage validation failed because changed source file paths did not match any LCOV source records.';
  }

  return `**Reason:** ${reason}`;
}

function getFileCoverage(file) {
  if (file.executableLines.length === 0) {
    return '100%';
  }

  return formatPercentage((file.coveredLines.length / file.executableLines.length) * 100);
}

function escapeMarkdownTableCell(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function escapeInlineCode(value) {
  return String(value).replaceAll('`', '\\`');
}

function formatContextLine(label, value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return `- ${label}: \`${escapeInlineCode(value)}\``;
}

function formatCountLine(label, value) {
  if (!Number.isInteger(value)) {
    return null;
  }

  return `- ${label}: ${value}`;
}

function buildRunSummary(runContext) {
  if (!runContext) {
    return [];
  }

  return [
    formatContextLine('Compare branch', runContext.diffRef ?? runContext.baseBranch),
    formatCountLine('Changed files checked', runContext.checkedFileCount),
  ].filter(Boolean);
}

function buildDiagnosticsList(title, values) {
  if (!values) {
    return [];
  }

  if (values.length === 0) {
    return [`- ${title}: none`];
  }

  return [`- ${title}:`, ...values.map((value) => `  - \`${escapeInlineCode(value)}\``)];
}

function buildDiagnostics(runContext) {
  if (!runContext) {
    return [];
  }

  return [
    '<details>',
    '<summary>Diagnostics</summary>',
    '',
    ...buildDiagnosticsList('Changed files', runContext.changedFiles),
    ...buildDiagnosticsList('Source files after filters', runContext.sourceFiles),
    formatContextLine('LCOV path', runContext.lcovPath),
    '</details>',
  ].filter(Boolean);
}

function encodeBlobPath(filePath) {
  return filePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function createLineUrl(env, filePath, startLine, endLine = startLine) {
  const encodedFilePath = encodeBlobPath(filePath);
  const lineAnchor = startLine === endLine ? `#L${startLine}` : `#L${startLine}-L${endLine}`;

  if (env.type === ENV_TYPES.GITHUB && env.serverUrl && env.repository && env.commitSha) {
    return `${env.serverUrl}/${env.repository}/blob/${env.commitSha}/${encodedFilePath}${lineAnchor}`;
  }

  if (env.type === ENV_TYPES.GITLAB && env.projectUrl && env.commitSha) {
    return `${env.projectUrl}/-/blob/${env.commitSha}/${encodedFilePath}${lineAnchor}`;
  }

  return null;
}

function formatLineReference(env, filePath, startLine, endLine = startLine) {
  const lineUrl = createLineUrl(env, filePath, startLine, endLine);
  const label = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

  if (!lineUrl) {
    return `\`${escapeInlineCode(`${filePath}:${label}`)}\``;
  }

  return `[${label}](${lineUrl})`;
}

function compactLineRanges(lineNumbers) {
  const ranges = [];

  for (const lineNumber of [...new Set(lineNumbers)].sort((left, right) => left - right)) {
    const currentRange = ranges.at(-1);

    if (currentRange && lineNumber === currentRange.end + 1) {
      currentRange.end = lineNumber;
    } else {
      ranges.push({ start: lineNumber, end: lineNumber });
    }
  }

  return ranges;
}

function formatLineReferences(env, filePath, lineNumbers) {
  return compactLineRanges(lineNumbers)
    .map(({ start, end }) => formatLineReference(env, filePath, start, end))
    .join(', ');
}

function buildMetricsTable(config, diffCoverage) {
  return [
    '| Check | Result |',
    '| --- | ---: |',
    `| Diff coverage | ${formatPercentage(diffCoverage.percentage)} |`,
    `| Required | ${config.threshold}% |`,
    `| Covered changed executable lines | ${diffCoverage.coveredLines} / ${diffCoverage.executableLines} |`,
    '| Policy | Source-only diff coverage |',
  ].join('\n');
}

function buildUncalculatedCoverageTable(status, runContext) {
  if (status === COMMENT_STATUSES.FAILED) {
    return [
      '| Check | Result |',
      '| --- | --- |',
      `| Source files selected | ${runContext?.checkedFileCount ?? 'Unknown'} |`,
      '| Coverage validation | Failed |',
      '| Policy | Source-only diff coverage |',
    ].join('\n');
  }

  return [
    '| Check | Result |',
    '| --- | --- |',
    `| Source files changed | ${runContext?.checkedFileCount === 0 ? 'No' : 'Yes'} |`,
    '| Coverage validation | Not required |',
    '| Policy | Source-only diff coverage |',
  ].join('\n');
}

function buildFilesTable(config, diffCoverage) {
  const rows = diffCoverage.files.slice(0, config.comment.maxFiles).map((file) => {
    return `| ${escapeMarkdownTableCell(file.filePath)} | ${file.changedLines.length} | ${file.coveredLines.length} | ${getFileCoverage(file)} |`;
  });

  return ['| File | Changed | Covered | Coverage |', '| --- | ---: | ---: | ---: |', ...rows].join('\n');
}

function getFailingFiles(diffCoverage) {
  return diffCoverage.files.filter((file) => file.uncoveredLines.length > 0);
}

function getUncoveredLineCount(diffCoverage) {
  return getFailingFiles(diffCoverage).reduce((count, file) => count + file.uncoveredLines.length, 0);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function buildFilesNotice(config, diffCoverage) {
  if (diffCoverage.files.length <= config.comment.maxFiles) {
    return null;
  }

  return `Showing first ${config.comment.maxFiles} of ${diffCoverage.files.length} changed files in this summary.`;
}

function buildUncoveredLines(config, diffCoverage, env) {
  const failingFiles = getFailingFiles(diffCoverage);

  if (failingFiles.length === 0) {
    return 'No uncovered changed executable lines.';
  }

  const lines = ['### Uncovered changed lines', ''];
  const shownFiles = failingFiles.slice(0, config.comment.maxFiles);

  for (const file of shownFiles) {
    const shownLines = file.uncoveredLines.slice(0, config.comment.maxLinesPerFile);
    const references = formatLineReferences(env, file.filePath, shownLines);
    const remainingCount = file.uncoveredLines.length - shownLines.length;
    const suffix = remainingCount > 0 ? ` and ${remainingCount} more` : '';

    lines.push(`- \`${escapeInlineCode(file.filePath)}\`: ${references}${suffix}`);
  }

  return lines.join('\n');
}

function hasTruncatedUncoveredLines(config, diffCoverage) {
  const failingFiles = getFailingFiles(diffCoverage);

  return (
    failingFiles.length > config.comment.maxFiles ||
    failingFiles.some((file) => file.uncoveredLines.length > config.comment.maxLinesPerFile)
  );
}

function buildFullUncoveredLines(diffCoverage, env) {
  const lines = ['<details>', '<summary>Show all uncovered changed lines</summary>', ''];

  for (const file of getFailingFiles(diffCoverage)) {
    lines.push(
      `- \`${escapeInlineCode(file.filePath)}\`: ${formatLineReferences(env, file.filePath, file.uncoveredLines)}`
    );
  }

  lines.push('', '</details>');
  return lines.join('\n');
}

function buildCalculatedDetails(status, config, diffCoverage, env) {
  const failingFiles = getFailingFiles(diffCoverage);
  const summary =
    status === COMMENT_STATUSES.FAILED
      ? `View affected files and uncovered lines (${failingFiles.length} failing ${pluralize(failingFiles.length, 'file')})`
      : `View changed files (${diffCoverage.files.length} ${pluralize(diffCoverage.files.length, 'file')})`;
  const lines = [
    '<details>',
    `<summary>${summary}</summary>`,
    '',
    '### Changed files',
    '',
    buildFilesTable(config, diffCoverage),
  ];
  const filesNotice = buildFilesNotice(config, diffCoverage);

  if (filesNotice) {
    lines.push('', filesNotice);
  }

  if (status === COMMENT_STATUSES.FAILED) {
    lines.push('', buildUncoveredLines(config, diffCoverage, env));

    if (hasTruncatedUncoveredLines(config, diffCoverage)) {
      lines.push('', buildFullUncoveredLines(diffCoverage, env));
    }
  }

  lines.push('', '</details>');
  return lines.join('\n');
}

export function buildCommentBody({ status, config, diffCoverage, reason, env, runContext }) {
  const lines = [
    COMMENT_MARKER,
    `## Diff Coverage Guard: ${getStatusTitle(status)}`,
    '',
    getSummary(status, reason, env),
    '',
  ];

  if (!diffCoverage) {
    lines.push(
      getReasonDetail(reason),
      '',
      buildUncalculatedCoverageTable(status, runContext),
      '',
      ...buildRunSummary(runContext),
      ''
    );

    if (buildDiagnostics(runContext).length > 0) {
      lines.push('### Changed files', '', ...buildDiagnostics(runContext));
    }

    return lines.join('\n');
  }

  lines.push(
    '### Coverage summary',
    '',
    buildMetricsTable(config, diffCoverage),
    '',
    ...buildRunSummary(runContext),
    ''
  );

  if (status === COMMENT_STATUSES.FAILED) {
    const failingFileCount = getFailingFiles(diffCoverage).length;
    const uncoveredLineCount = getUncoveredLineCount(diffCoverage);

    lines.push(
      `**Action required:** ${uncoveredLineCount} uncovered changed executable ${pluralize(uncoveredLineCount, 'line')} across ${failingFileCount} ${pluralize(failingFileCount, 'file')}.`,
      '',
      buildCalculatedDetails(status, config, diffCoverage, env)
    );
  } else {
    lines.push('No uncovered changed executable lines.', '', buildCalculatedDetails(status, config, diffCoverage, env));
  }

  return lines.join('\n');
}

function resolveGitHubToken() {
  return process.env.DIFF_COV_GUARD_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
}

function resolveGitLabToken() {
  return process.env.DIFF_COV_GUARD_GITLAB_TOKEN ?? process.env.GITLAB_TOKEN;
}

function assertOk(response, action) {
  if (!response.ok) {
    throw new Error(`${action} failed with HTTP ${response.status}`);
  }
}

async function requestJson(url, options, action) {
  const { timeoutMs, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
  assertOk(response, action);
  return response.json();
}

async function requestEmpty(url, options, action) {
  const { timeoutMs, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
  assertOk(response, action);
}

async function publishGitHubComment(env, config, body) {
  const token = resolveGitHubToken();

  if (!token) {
    throw new Error('GitHub token is missing');
  }

  if (!env.apiUrl || !env.repository || !env.pullRequestNumber) {
    throw new Error('GitHub pull request metadata is missing');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const issueCommentsUrl = `${env.apiUrl}/repos/${env.repository}/issues/${env.pullRequestNumber}/comments`;
  const comments = await requestJson(
    issueCommentsUrl,
    { headers, timeoutMs: config.apiTimeoutMs },
    'List GitHub comments'
  );
  const existingComment = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  const payload = JSON.stringify({ body });

  if (existingComment) {
    await requestEmpty(
      `${env.apiUrl}/repos/${env.repository}/issues/comments/${existingComment.id}`,
      {
        method: 'PATCH',
        headers,
        body: payload,
        timeoutMs: config.apiTimeoutMs,
      },
      'Update GitHub comment'
    );
    return;
  }

  await requestEmpty(
    issueCommentsUrl,
    { method: 'POST', headers, body: payload, timeoutMs: config.apiTimeoutMs },
    'Create GitHub comment'
  );
}

async function publishGitLabComment(env, config, body) {
  const token = resolveGitLabToken();

  if (!token) {
    throw new Error('GitLab token is missing');
  }

  if (!env.apiUrl || !env.projectId || !env.mergeRequestIid) {
    throw new Error('GitLab merge request metadata is missing');
  }

  const headers = {
    'Content-Type': 'application/json',
    'PRIVATE-TOKEN': token,
  };
  const encodedProjectId = encodeURIComponent(env.projectId);
  const notesUrl = `${env.apiUrl}/projects/${encodedProjectId}/merge_requests/${env.mergeRequestIid}/notes`;
  const notes = await requestJson(notesUrl, { headers, timeoutMs: config.apiTimeoutMs }, 'List GitLab notes');
  const existingNote = notes.find((note) => note.body?.includes(COMMENT_MARKER));
  const payload = JSON.stringify({ body });

  if (existingNote) {
    await requestEmpty(
      `${notesUrl}/${existingNote.id}`,
      { method: 'PUT', headers, body: payload, timeoutMs: config.apiTimeoutMs },
      'Update GitLab note'
    );
    return;
  }

  await requestEmpty(
    notesUrl,
    { method: 'POST', headers, body: payload, timeoutMs: config.apiTimeoutMs },
    'Create GitLab note'
  );
}

export async function publishCoverageComment({ env, config, body }) {
  if (!config.comment.enabled) {
    return;
  }

  if (env.type === ENV_TYPES.GITHUB) {
    await publishGitHubComment(env, config, body);
    return;
  }

  if (env.type === ENV_TYPES.GITLAB) {
    await publishGitLabComment(env, config, body);
  }
}
