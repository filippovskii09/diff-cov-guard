# diff-cov-guard

[![npm version](https://img.shields.io/npm/v/diff-cov-guard.svg)](https://www.npmjs.com/package/diff-cov-guard)
[![npm downloads](https://img.shields.io/npm/dw/diff-cov-guard.svg)](https://www.npmjs.com/package/diff-cov-guard)
[![license](https://img.shields.io/npm/l/diff-cov-guard.svg)](https://github.com/filippovskii09/diff-cov-guard)

CLI guard that enforces diff coverage thresholds in pull requests from an existing LCOV report.

`diff-cov-guard` checks only the JS/TS lines changed by the current branch and fails when those changed executable
lines are not covered enough. It is designed for CI pull request checks, but the same command can run locally.

## Before You Use It

`diff-cov-guard` expects your project to already have:

- a Git repository;
- Node.js 20 or newer with `npm`/`npx`;
- a test command that generates an LCOV report, for example `npm run test:cov`;
- an LCOV file, default `./coverage/lcov.info`;
- the pull request base branch available in CI;
- JS/TS source files: `.cjs`, `.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`.

It does not configure your test runner, run tests, or generate coverage by itself. Run your coverage command before
running the guard.

For CI, set `failOnEmpty: true` so a missing or empty LCOV report fails the job instead of being skipped.

## Install

```sh
npm install --save-dev diff-cov-guard
```

You can also run it without installing:

```sh
npx -y diff-cov-guard
```

## Configure

Recommended `.diffcovguardrc`:

```json
{
  "$schema": "https://raw.githubusercontent.com/filippovskii09/diff-cov-guard/main/diff-cov-guard.schema.json",
  "threshold": 90,
  "lcovPath": "./coverage/lcov.info",
  "failOnEmpty": true,
  "gitTimeoutMs": 30000,
  "apiTimeoutMs": 10000,
  "exclude": [
    "**/__test__/**",
    "**/__tests__/**",
    "**/*.test.cjs",
    "**/*.test.js",
    "**/*.test.jsx",
    "**/*.test.mjs",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.cjs",
    "**/*.spec.js",
    "**/*.spec.jsx",
    "**/*.spec.mjs",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "jest.config.cjs",
    "jest.config.js",
    "jest.config.mjs",
    "jest.config.ts"
  ],
  "comment": {
    "maxFiles": 10,
    "maxLinesPerFile": 20,
    "failOnError": false
  }
}
```

`exclude` replaces the default exclusion list when configured. To add project-specific exclusions without repeating the
built-in list, set `extendDefaultExclude: true`:

```json
{
  "extendDefaultExclude": true,
  "exclude": ["frontend/jest.config.ts", "**/*.generated.ts"]
}
```

The defaults shown above exclude `__test__`/`__tests__` directories, `*.test.*` and `*.spec.*` files for the supported
JS/TS extensions, and Jest config entrypoints. Patterns support `*`, `**`, and `?`, not brace expansion. Use explicit
patterns if your repository also excludes other executable config files, for example `vitest.config.ts`.

If your LCOV file uses paths relative to a package directory, add `rootDir`:

```json
{
  "threshold": 90,
  "lcovPath": "packages/app/coverage/lcov.info",
  "rootDir": "packages/app",
  "failOnEmpty": true
}
```

You can also initialize config interactively:

```sh
npx diff-cov-guard init
```

## Coverage Command In CI

The guard reads an LCOV report; it does not need the test runner's regular progress output. For Jest-based projects,
consider keeping an explicit quiet CI coverage command alongside the normal local command:

```json
{
  "scripts": {
    "test:cov": "jest --coverage",
    "test:cov:ci": "jest --coverage --coverageReporters=lcovonly --silent --ci"
  }
}
```

If a package or workspace is intentionally allowed to contain no matching tests, add `--passWithNoTests`:

```json
{
  "scripts": {
    "test:cov:ci": "jest --coverage --coverageReporters=lcovonly --passWithNoTests --silent --ci"
  }
}
```

Use the same flags through your Jest wrapper when applicable, for example `fedx-scripts jest --coverage
--coverageReporters=lcovonly --passWithNoTests --silent --ci`.

- `--coverageReporters=lcovonly` writes the LCOV input required by the guard without printing a separate total-coverage
  table. Omit it when the same job must display total project coverage too.
- `--silent` suppresses `console.*` output emitted by tests so application logging does not bury the guard result.
- `--ci` makes Jest use non-interactive CI behavior and fail on obsolete snapshots instead of updating them.
- `--passWithNoTests` is useful for selective monorepo/package jobs, but should not be added when "no tests found"
  indicates a broken test configuration.

## Use Locally

```sh
npm run test:cov
npx diff-cov-guard
```

With flags:

```sh
npx diff-cov-guard --threshold 90 --lcov ./coverage/lcov.info --fail-on-empty
npx diff-cov-guard --git-timeout-ms 30000 --api-timeout-ms 10000
```

PR/MR comments are enabled automatically in GitHub Actions and GitLab merge request pipelines. Local runs do not publish
comments unless you pass `--comment`.

Comment flags:

```sh
npx diff-cov-guard --comment --comment-max-files 10 --comment-max-lines-per-file 20
npx diff-cov-guard --no-comment
```

## Use In GitHub Actions

```yaml
name: diff coverage

on:
  pull_request:

jobs:
  diff-coverage:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:cov:ci
      - run: npx -y diff-cov-guard
```

`fetch-depth: 0` is important because the guard compares the pull request branch with its base branch. In pull request
workflows, keep the `pull_request` checkout context or pass the comparison branch explicitly:

```yaml
- run: npx -y diff-cov-guard --base "${{ github.base_ref }}"
```

You can also set `DIFF_COVER_COMPARE_BRANCH` when another tool already provides the desired comparison ref:

```yaml
- run: npx -y diff-cov-guard
  env:
    DIFF_COVER_COMPARE_BRANCH: origin/main
```

For GitHub PR comments, the guard uses `DIFF_COV_GUARD_GITHUB_TOKEN` first and falls back to `GITHUB_TOKEN`. The comment
is a single stable issue comment that is updated on each run.

## Use In GitLab CI

```yaml
diff_coverage:
  image: node:20
  stage: test
  variables:
    GIT_DEPTH: 0
  script:
    - npm ci
    - npm run test:cov:ci
    - npx -y diff-cov-guard
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

`GIT_DEPTH: 0` keeps enough history for the three-dot MR diff. If a shallow checkout causes
`fatal: origin/main...HEAD: no merge base`, unshallow the job with `GIT_DEPTH: 0`.

For an explicit target-branch setup, fetch the target into its remote-tracking ref and tell the guard to use that ref:

```yaml
script:
  - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME:refs/remotes/origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
  - DIFF_COVER_COMPARE_BRANCH="origin/${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}" npx -y diff-cov-guard
```

Use the explicit setup when `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` is not otherwise available to the guard or the
checked-out ref does not carry a usable comparison base.

For GitLab MR comments, set `DIFF_COV_GUARD_GITLAB_TOKEN` or `GITLAB_TOKEN` with permission to create and update merge
request notes. This is an MR note created and updated through the Notes API, not a native GitLab coverage widget. Use a
project, group, or personal access token with the `api` scope and access to the project; the guard does not rely on
`CI_JOB_TOKEN` for writing notes. If the token is a protected CI/CD variable, GitLab does not expose it to pipelines on
unprotected source branches, so the comment step will have no token in those MR pipelines.

## PR/MR Comments

When comments are enabled, `diff-cov-guard` publishes a short Markdown summary with:

- pass, fail, or skipped status;
- diff coverage, required threshold, and covered changed executable line count;
- a per-file table capped by `comment.maxFiles`;
- a compact uncovered-line summary capped by `comment.maxLinesPerFile`, with a complete expanded list when truncated;
- compare-ref and LCOV path diagnostics where available.

Comment summary limits support at most `comment.maxFiles: 100` files and `comment.maxLinesPerFile: 500` uncovered lines
per file. Failed comments keep any truncated uncovered-line detail available in a collapsible inline section.

Publishing failures are warnings by default and do not change the coverage exit code. Set `comment.failOnError: true` or
pass `--comment-fail-on-error` if CI should fail when the API call cannot publish the comment.

```sh
npx -y diff-cov-guard --comment --comment-fail-on-error
```

## Output

Passing run:

```text
Starting coverage check...
Environment: GITHUB

File                          Changed Lines  Covered Lines  Percentage
src/example.ts                4              4              100%

Success: Diff Coverage is 100%, minimum required is 90%.
```

Failing run:

```text
Files below diff coverage requirements:
 - src/example.ts: uncovered changed lines 12, 18

Fail: Diff Coverage is 50%, but minimum required is 90%.
```

## Documentation

Full documentation is coming soon. It will cover test runner setup, LCOV path mapping, monorepos, GitHub Actions,
GitLab CI, config precedence, and troubleshooting.

Until then, run:

```sh
npx diff-cov-guard --help
```

## License

ISC
