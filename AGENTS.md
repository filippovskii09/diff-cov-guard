# AGENTS.md

## 1. Project Overview

- `diff-cov-guard` is an ESM Node.js CLI that enforces diff coverage thresholds from LCOV reports.
- CLI entrypoint: `bin/cli.js`.
- Public module entrypoint: `src/index.js`.
- Core modules:
  - `src/config.js`: config loading from CLI args, `.diffcovguardrc`, and `package.json`.
  - `src/environment.js`: local/GitHub/GitLab environment detection.
  - `src/git.js`: changed file/line discovery and CI branch fetch logic.
  - `src/lcov.js`: LCOV parsing and path normalization.
  - `src/coverage.js`: diff coverage calculation.
  - `src/init.js`: interactive config initializer.
- Tests live under `src/specs/**/*.test.js`.

## 2. Setup Commands

- Install dependencies: `npm ci`.
- Package manager: npm, based on `package-lock.json`.
- Node version: Unknown.

## 3. Development Commands

- Run tests without coverage: `npm test`.
- Run tests with coverage: `npm run test:cov`.
- Lint: `npm run lint`.
- Auto-fix lint issues: `npm run lint:fix`.
- Format files: `npm run format`.
- Check formatting: `npm run format:check`.
- Run CLI locally: `node bin/cli.js --help`.

## 4. Verification Commands

- For code changes, run the narrowest useful Jest target first, for example:
  - `npm test -- src/specs/config.test.js`
  - `npm test -- src/specs/lcov.test.js`
  - `npm test -- src/specs/index.test.js`
- Before done, prefer:
  - `npm run lint`
  - `npm run format:check`
  - `npm test`
- Use `npm run test:cov` only when coverage behavior or LCOV output is relevant.
- Do not run full test suites during exploration.
- Run full tests only before final verification, for broad refactors, or when explicitly requested.
- Prefer targeted Jest commands while iterating.
- No separate typecheck command exists.

## 5. Architecture Rules

- Keep the project ESM-only; use `import`/`export`, not CommonJS.
- Keep CLI parsing and process exit behavior in `bin/cli.js`; keep reusable workflow logic in `src/index.js`.
- Keep Git shell interactions isolated in `src/git.js`.
- Keep LCOV parsing/path normalization isolated in `src/lcov.js`.
- Keep configuration precedence compatible with existing behavior:
  - CLI flags override `.diffcovguardrc`.
  - `.diffcovguardrc` overrides `package.json` `diffCovGuard`.
  - Defaults come from `src/constants.js`.
- Preserve CI behavior for GitHub Actions and GitLab CI.
- Treat files missing from LCOV as uncovered when they have changed executable lines.

## 6. Code Style Rules

- Follow `.prettierrc`: semicolons, single quotes, trailing commas where valid in ES5, `printWidth: 120`, `tabWidth: 2`.
- Follow `eslint.config.js`; lint is strict and uses `--max-warnings=0`.
- Prefer function declarations unless ESLint/local patterns allow arrows.
- Avoid magic numbers outside tests unless covered by existing constants or ESLint exceptions.
- Do not add unnecessary dependencies.
- Keep comments useful and brief; many modules already use JSDoc for exported or complex helpers.

## 7. Testing Rules

- Jest runs in Node with ESM support through `node --experimental-vm-modules node_modules/jest/bin/jest.js`.
- Tests use `@jest/globals`.
- Use `jest.unstable_mockModule` for ESM module mocking.
- Keep unit tests close to the existing `src/specs/*.test.js` pattern.
- Add or update tests when changing config resolution, CLI behavior, Git diff parsing, LCOV parsing, or coverage math.
- Do not rely on generated `coverage/` output in tests unless explicitly testing coverage artifacts.

## 8. RTK/Token-Efficient Inspection Policy

All read-only repository inspection shell commands MUST be prefixed with `rtk`.

Use RTK for:

- `rtk git status --short --branch`
- `rtk git diff --stat`
- `rtk git diff --name-only`
- `rtk git log --oneline -n 20`
- `rtk rg "<query>" <path>`
- `rtk rg --files <path>`
- `rtk sed -n '<start>,<end>p' <file>`

Inspection workflow:

1. Inspect compressed summaries first.
2. Identify relevant files.
3. Read only exact files or line ranges.
4. Run targeted tests before full verification.
5. Avoid dumping broad output into context.

Forbidden unless explicitly requested:

- Raw `git status`.
- Raw full `git diff`.
- Raw recursive `find`.
- Raw `ls -la` on large folders.
- Full test logs.
- Reading `node_modules/`.
- Reading `coverage/`.
- Reading generated output.
- Reading lockfiles for implementation context.

Lockfiles may only be used to identify the package manager or verify dependency changes.

If RTK is unavailable or fails:

1. Say so.
2. Use compact native alternatives:
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff --name-only`
   - `git log --oneline -n 20`
3. Do not fall back to verbose raw output.

## 9. Forbidden Actions

- Do not modify files outside the requested scope.
- Do not edit generated output, dependency directories, coverage reports, or lockfiles unless explicitly requested.
- Do not read lockfiles for implementation context.
- Do not run full test suites during exploration.
- Do not change package manager or module system.
- Do not fetch branches, pull, push, publish, or create releases unless explicitly requested.
- Do not rewrite unrelated code while making a focused change.

## 10. Done Criteria

- The requested behavior is implemented with the smallest practical change.
- Relevant tests are added or updated when behavior changes.
- `npm run lint`, `npm run format:check`, and the relevant Jest command pass, or any skipped/failed checks are reported.
- Public CLI behavior and documented config precedence remain compatible unless intentionally changed.
- The final response summarizes changed files and verification results.
