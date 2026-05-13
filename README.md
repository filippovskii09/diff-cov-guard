# diff-cov-guard

[![npm version](https://img.shields.io/npm/v/diff-cov-guard.svg)](https://www.npmjs.com/package/diff-cov-guard)
[![npm downloads](https://img.shields.io/npm/dw/diff-cov-guard.svg)](https://www.npmjs.com/package/diff-cov-guard)
[![license](https://img.shields.io/npm/l/diff-cov-guard.svg)](https://github.com/filippovskii09/diff-cov-guard)

CLI guard that enforces diff coverage thresholds from LCOV reports.

`diff-cov-guard` is designed for pull requests and CI pipelines where overall
project coverage is too broad to be useful. It checks only the lines changed by
the current branch and fails when those changed executable lines are not covered
enough.

## Why use it?

- Keep new code covered without forcing a full-project coverage migration.
- Gate pull requests with a single CLI command and an LCOV report from your test runner.
- See exactly which changed files and lines are uncovered.
- Use the same command locally, in GitHub Actions, or in GitLab CI.
- Avoid hidden passes for newly added files that are missing from LCOV.

## Requirements

- Node.js.
- `npm`/`npx`.
- Git repository.
- Project-level test coverage.
- Coverage command that generates LCOV, recommended: `npm run test:cov`.

`diff-cov-guard` does not run or configure your test framework. It reads an
existing LCOV report and compares it with the Git diff. If your project does not
generate `coverage/lcov.info` yet, configure coverage first.

Your Jest config must include `lcov` in
`coverageReporters` so the guard has a report to analyze:

```ts
// jest.config.ts
export default {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov', 'html'],
};
```

Add this package script if the project does not already have a coverage command.
If a coverage command already exists, make sure it generates `lcov` and use that
command instead of creating a duplicate:

```json
{
  "scripts": {
    "test:cov": "jest --coverage"
  }
}
```

After running `npm run test:cov`, make sure the LCOV file exists. By default,
the guard expects:

```text
coverage/lcov.info
```

The CLI currently checks source files with these extensions:

```text
.cjs, .js, .jsx, .mjs, .ts, .tsx
```

## Quick Start

There are three ways to configure `diff-cov-guard`:

1. `.diffcovguardrc` file. Recommended for CI because the command stays short and the coverage rules live in one dedicated file.
2. `diffCovGuard` field in `package.json`. Good for small projects that keep tool config in `package.json`.
3. CLI flags. Good for quick checks or temporary overrides.

Configuration priority for `threshold`, `lcovPath`, `rootDir`, and
`failOnEmpty` is:

```text
CLI flags > .diffcovguardrc > package.json > defaults
```

For `baseBranch`, CI pull request metadata is used before config because the
target branch can differ per pull request:

```text
--base > CI target branch > .diffcovguardrc > package.json > remote default branch > main
```

Default behavior when no config is provided:

- `threshold`: `90`
- `lcovPath`: `./coverage/lcov.info`
- `baseBranch`: CI target branch, then remote default branch, then `main`
- `rootDir`: current directory
- `failOnEmpty`: `false`

For CI, the recommended setup is a config file plus a short command:

```json
{
  "threshold": 95,
  "lcovPath": "./coverage/lcov.info",
  "failOnEmpty": true
}
```

Then run the guard after coverage generation:

```sh
npm run test:cov
npx -y diff-cov-guard
```

`npx` runs a package binary without adding it to your project dependencies. If
the package is not installed locally, npm downloads it into the npm cache for
that command. `npm install --save-dev diff-cov-guard` adds the package to
`package.json` and `package-lock.json`, so CI gets the locked version during
`npm ci`.

For CI, both options are valid:

- Use `npx -y diff-cov-guard` when you want the smallest setup and do not want to add a dev dependency.
- Install `diff-cov-guard` as a dev dependency when you want a locked version in `package-lock.json`.

If you use `npx` in CI, pin a version when reproducibility matters:

```sh
npx -y diff-cov-guard@1.0.0
```

If you install the package, add a script and run that script in CI:

```sh
npm install --save-dev diff-cov-guard
```

```json
{
  "scripts": {
    "coverage:diff": "diff-cov-guard"
  }
}
```

```sh
npm run test:cov
npm run coverage:diff
```

Use CLI flags only when you intentionally want the CI command to be the source of
truth:

```sh
npx -y diff-cov-guard --threshold 95 --lcov ./coverage/lcov.info --fail-on-empty
```

If you use a config file, do not repeat the same values in CI:

```json
{
  "threshold": 95,
  "lcovPath": "./coverage/lcov.info",
  "failOnEmpty": true
}
```

```sh
npm run test:cov
npx -y diff-cov-guard
```

The order matters: without `npm run test:cov`, the guard has no LCOV data to
read.

## Installation

You do not have to install the package to use it in CI. This works:

```sh
npx -y diff-cov-guard
```

Install it as a development dependency when you want the project lockfile to
control the version:

```sh
npm install --save-dev diff-cov-guard
```

Then add scripts like this:

```json
{
  "scripts": {
    "test:cov": "jest --coverage",
    "coverage:diff": "diff-cov-guard"
  }
}
```

## Initialize Config

Run the interactive setup:

```sh
npx diff-cov-guard init
```

The initializer can:

- Detect common `lcov.info` locations.
- Detect the default Git branch.
- Ask for the coverage threshold.
- Write config to `.diffcovguardrc` or `package.json`.
- Add a package script for running the guard.

## Configuration

Recommended CI config in `.diffcovguardrc`:

```json
{
  "threshold": 95,
  "lcovPath": "./coverage/lcov.info",
  "failOnEmpty": true
}
```

Or in `package.json` under `diffCovGuard`:

```json
{
  "diffCovGuard": {
    "threshold": 95,
    "lcovPath": "./coverage/lcov.info",
    "failOnEmpty": true
  }
}
```

CLI options override config file values.

Config fields:

| Field | Default | Description |
| --- | --- | --- |
| `threshold` | `90` | Minimum required diff coverage percentage. |
| `lcovPath` | `./coverage/lcov.info` | LCOV report generated before the guard runs. |
| `baseBranch` | auto-detected | Branch used for local diff checks when CI does not provide a target branch. |
| `rootDir` | current directory | Directory that LCOV paths are relative to. Useful when tests run from a package directory in a monorepo. |
| `failOnEmpty` | `false` | When `true`, missing or empty LCOV fails the command. Recommended for CI. |

`rootDir` is only needed when LCOV paths do not match Git paths. For example,
Git may report `packages/app/src/Button.tsx`, while LCOV may report
`src/Button.tsx` because Jest ran inside `packages/app`. In that case, set:

```json
{
  "lcovPath": "packages/app/coverage/lcov.info",
  "rootDir": "packages/app"
}
```

`failOnEmpty` controls what happens when `lcovPath` is missing or empty. The
default is lenient for local adoption, but CI should usually set it to `true` so
a missing coverage report fails instead of silently skipping the guard.

## CLI Options

| Option | Alias | Default | Description |
| --- | --- | --- | --- |
| `--threshold <number>` | `-t` | `90` | Minimum required diff coverage percentage. |
| `--lcov <path>` | `-l` | `./coverage/lcov.info` | Path to the LCOV report generated by your test runner. |
| `--base <branch>` | `-b` | remote default branch or `main` | Branch or ref used as the diff base. |
| `--root-dir <path>` | | current directory | Directory that relative LCOV `SF:` paths are based on. |
| `--fail-on-empty` | | `false` | Fail instead of skipping when the LCOV file is missing or empty. |
| `--help` | `-h` | | Show help. |
| `--version` | `-v` | | Show version. |

Example:

```sh
npx diff-cov-guard \
  --threshold 95 \
  --lcov ./coverage/lcov.info \
  --base origin/main \
  --root-dir .
```

## How It Works

1. Resolves the base branch from `--base`, CI environment variables, config, or the default branch.
2. In CI, fetches the base branch from `origin` inside the CLI process.
3. Uses `git diff --name-only base...HEAD` to find changed files.
4. Keeps only supported JS/TS source files.
5. Uses `git diff --unified=0 base...HEAD` to map changed line numbers.
6. Parses LCOV `SF:` and `DA:` records and normalizes file paths to repository-relative paths.
7. Counts executable changed lines that appear in LCOV.
8. Calculates `covered changed executable lines / changed executable lines * 100`.
9. Prints a per-file table and exits successfully or with failure.

CI environment variables are values provided by the CI system. GitHub Actions
sets values such as `GITHUB_BASE_REF`; GitLab merge request pipelines provide
`CI_MERGE_REQUEST_TARGET_BRANCH_NAME`. The guard reads those values to choose
the comparison branch automatically in pull request or merge request pipelines.

The calculation returns a diff coverage result with:

- total executable changed lines;
- covered executable changed lines;
- percentage;
- per-file changed, covered, and uncovered line numbers.

That result is printed as a table. If the percentage is below `threshold`, the
command exits with code `1`; otherwise it exits with code `0`.

If a changed source file is missing from LCOV entirely, its changed lines are
treated as uncovered. That prevents newly added files from passing just because
the coverage report did not include them.

If changed lines exist but none of them are executable according to LCOV, the
diff coverage result is treated as `100%`. This usually happens for changes such
as comments, type-only declarations, interfaces, formatting, or other lines that
the coverage tool does not mark as executable.

## Output

Successful run:

```text
Starting coverage check...
Environment: LOCAL

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

## GitHub Actions

Use one job by default. `diff-cov-guard` reads the LCOV file from disk, so the
simplest setup is to generate coverage and run the guard in the same job. Split
jobs only make sense when your existing coverage job already uploads
`coverage/lcov.info` as an artifact and the diff coverage job downloads it.

Recommended: config file plus `npx`.

```yaml
name: diff coverage

on:
  pull_request:

jobs:
  diff-coverage:
    runs-on: ubuntu-latest
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

`fetch-depth: 0` is important because the guard compares the pull request branch
against the base branch.

Alternative: installed package plus npm script.

```yaml
name: diff coverage

on:
  pull_request:

jobs:
  diff-coverage:
    runs-on: ubuntu-latest
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
      - run: npm run coverage:diff
```

## GitLab CI

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

In GitLab CI, the guard reads `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` when it is
available.

## LCOV Path Mapping

LCOV reports can contain absolute paths, repository-relative paths, or paths
relative to the directory where tests were run. Use `--root-dir` when LCOV `SF:`
records are relative to a package directory instead of the repository root.

Example for a monorepo package:

```sh
npx diff-cov-guard \
  --lcov packages/app/coverage/lcov.info \
  --root-dir packages/app
```

## npm Metadata

Current package metadata:

- npm package: [`diff-cov-guard`](https://www.npmjs.com/package/diff-cov-guard)
- source: [`filippovskii09/diff-cov-guard`](https://github.com/filippovskii09/diff-cov-guard)
- version: `1.0.0`
- dist tag: `latest`
- license: `ISC`
- keywords: `coverage`, `diff-coverage`, `lcov`, `ci`, `cli`
- dependencies: none

These keywords help npm and package search tools classify the project as a
coverage-focused CI CLI for LCOV-based diff coverage checks.

## License

ISC
