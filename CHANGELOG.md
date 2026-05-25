# Changelog

All notable changes to this project will be documented in this file.

This project follows Semantic Versioning.

## [Unreleased]

## [1.1.4] - 2026-05-25

### Added

- Add GitLab merge request note publishing with stable note updates, uncovered-line links, and token lookup through `DIFF_COV_GUARD_GITLAB_TOKEN` or `GITLAB_TOKEN`.
- Add strict PR/MR comment publication handling through `comment.failOnError` and `--comment-fail-on-error`.

### Changed

- Improve skipped PR comments with compare branch context, changed-file counts, clearer no-executable-lines wording, and collapsible diagnostics for changed files, filtered source files, and LCOV path.
- Enable automatic comments only when GitHub pull request or GitLab merge request metadata is available.
- Extend default exclusions to cover supported JS/TS test and spec extensions plus Jest config entrypoints.
- Document GitLab MR note permissions, protected variable behavior, shallow clone recovery, explicit target-branch fetching, exclusions, and quieter Jest CI coverage scripts.

### Fixed

- Report a targeted `GIT_DEPTH: 0` troubleshooting hint when Git cannot find a merge base in shallow CI history.
