import { COMMENT_MARKER, COMMENT_STATUSES, ENV_TYPES } from './constants.js';

const COMMENT_STATUS_TITLES = {
  [COMMENT_STATUSES.PASSED]: '✅ Passed',
  [COMMENT_STATUSES.FAILED]: '❌ Failed',
  [COMMENT_STATUSES.SKIPPED]: '⏭️ Skipped',
};

function formatPercentage(percentage) {
  return `${Number(percentage.toFixed(2))}%`;
}

function getStatusTitle(status) {
  return COMMENT_STATUS_TITLES[status] ?? COMMENT_STATUS_TITLES[COMMENT_STATUSES.SKIPPED];
}

function getFileCoverage(file) {
  if (file.executableLines.length === 0) {
    return '100%';
  }

  return formatPercentage((file.coveredLines.length / file.executableLines.length) * 100);
}

function createLineUrl(env, filePath, lineNumber) {
  if (env.type === ENV_TYPES.GITHUB && env.serverUrl && env.repository && env.commitSha) {
    return `${env.serverUrl}/${env.repository}/blob/${env.commitSha}/${filePath}#L${lineNumber}`;
  }

  if (env.type === ENV_TYPES.GITLAB && env.projectUrl && env.commitSha) {
    return `${env.projectUrl}/-/blob/${env.commitSha}/${filePath}#L${lineNumber}`;
  }

  return null;
}

function formatLineReference(env, filePath, lineNumber) {
  const lineUrl = createLineUrl(env, filePath, lineNumber);

  if (!lineUrl) {
    return `\`${filePath}:${lineNumber}\``;
  }

  return `[${lineNumber}](${lineUrl})`;
}

function buildMetricsTable(config, diffCoverage) {
  return [
    '| Metric | Value |',
    '| --- | ---: |',
    `| Diff coverage | ${formatPercentage(diffCoverage.percentage)} |`,
    `| Required | ${config.threshold}% |`,
    `| Covered executable lines | ${diffCoverage.coveredLines} / ${diffCoverage.executableLines} |`,
  ].join('\n');
}

function buildFilesTable(config, diffCoverage) {
  const rows = diffCoverage.files.slice(0, config.comment.maxFiles).map((file) => {
    return `| ${file.filePath} | ${file.changedLines.length} | ${file.coveredLines.length} | ${getFileCoverage(file)} |`;
  });

  return ['| File | Changed | Covered | Coverage |', '| --- | ---: | ---: | ---: |', ...rows].join('\n');
}

function buildUncoveredLines(config, diffCoverage, env) {
  const failingFiles = diffCoverage.files.filter((file) => file.uncoveredLines.length > 0);

  if (failingFiles.length === 0) {
    return 'No uncovered changed executable lines.';
  }

  const lines = ['### Uncovered changed lines', ''];
  const shownFiles = failingFiles.slice(0, config.comment.maxFiles);

  for (const file of shownFiles) {
    const shownLines = file.uncoveredLines.slice(0, config.comment.maxLinesPerFile);
    const references = shownLines.map((lineNumber) => formatLineReference(env, file.filePath, lineNumber)).join(', ');
    const remainingCount = file.uncoveredLines.length - shownLines.length;
    const suffix = remainingCount > 0 ? ` and ${remainingCount} more` : '';

    lines.push(`- \`${file.filePath}\`: ${references}${suffix}`);
  }

  lines.push(
    '',
    `Showing first ${config.comment.maxFiles} files and first ${config.comment.maxLinesPerFile} lines per file. See CI logs for the full list.`
  );

  return lines.join('\n');
}

export function buildCommentBody({ status, config, diffCoverage, reason, env }) {
  const lines = [COMMENT_MARKER, `## Diff Coverage Guard: ${getStatusTitle(status)}`, ''];

  if (!diffCoverage) {
    lines.push(reason);
    return lines.join('\n');
  }

  lines.push(buildMetricsTable(config, diffCoverage), '', buildFilesTable(config, diffCoverage), '');

  if (status === COMMENT_STATUSES.FAILED) {
    lines.push(buildUncoveredLines(config, diffCoverage, env));
  } else {
    lines.push('No uncovered changed executable lines.');
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
