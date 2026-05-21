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
  "comment": {
    "maxFiles": 10,
    "maxLinesPerFile": 20,
    "failOnError": false
  }
}
```

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
      - run: npm run test:cov
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
  script:
    - npm ci
    - npm run test:cov
    - npx -y diff-cov-guard
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

Set `DIFF_COVER_COMPARE_BRANCH` if your GitLab pipeline checks out a ref where
`CI_MERGE_REQUEST_TARGET_BRANCH_NAME` is unavailable or not the branch you want to compare against.

For GitLab MR comments, set `DIFF_COV_GUARD_GITLAB_TOKEN` or `GITLAB_TOKEN` with permission to create and update merge
request notes. The guard does not rely on `CI_JOB_TOKEN` for writing notes.

## PR/MR Comments

When comments are enabled, `diff-cov-guard` publishes a short Markdown summary with:

- pass, fail, or skipped status;
- diff coverage, required threshold, and covered executable line count;
- a per-file table capped by `comment.maxFiles`;
- uncovered changed executable lines capped by `comment.maxLinesPerFile`.

Comment output can show at most `comment.maxFiles: 100` files and at most `comment.maxLinesPerFile: 500` uncovered
lines per file.

Publishing failures are warnings by default and do not change the coverage exit code. Set `comment.failOnError: true` or
pass `--comment-fail-on-error` if CI should fail when the API call cannot publish the comment.

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
