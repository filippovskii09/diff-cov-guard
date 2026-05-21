---
title: Docusaurus Implementation Brief
sidebar_label: Implementation Brief
sidebar_position: 2
description: Confirmed product, content, technical, and deployment decisions before building the Diff Coverage Guard documentation site.
tags:
  - documentation
  - docusaurus
  - implementation
---

# Docusaurus Implementation Brief

This brief captures the current implementation decisions for building the `Diff Coverage Guard` documentation website
with Docusaurus. It complements `docs/docusaurus-site-plan.md`: the site plan describes the map, while this brief records
the decisions that should guide the AI agent during implementation.

## Product Direction

The site should feel like a small but serious open-source project website, inspired by documentation sites for projects
like Node.js and Jest. The project itself is intentionally smaller, so the implementation should avoid pretending it has a
huge ecosystem. The site still needs a polished first impression, clear value proposition, strong docs navigation, and a
structure that can grow.

The homepage is not just a docs index. It should sell the utility:

- explain the pain: total coverage does not tell reviewers whether new code is covered;
- show the promise: enforce coverage only on changed executable lines;
- show how it fits into PR/MR workflows;
- make installation obvious;
- route users into Quick Start, GitHub Actions, GitLab CI, and Concepts.

The site name is:

```text
Diff Coverage Guard
```

The package/tool name remains:

```text
diff-cov-guard
```

## Audience

Primary audience:

- developers adding coverage gates to frontend projects;
- maintainers who want PR-level quality checks;
- teams using GitHub Actions or GitLab CI;
- users who already have or need to configure LCOV coverage.

The docs should assume users understand Git, CI, and JavaScript package tooling, but should not assume they already
understand LCOV internals or diff coverage semantics.

## Content Style

The site should split learning content from technical reference.

### Learning / Fundamentals

Create a "Fundamentals" or "Concepts" area with a more educational style:

- what diff coverage means;
- how it differs from total coverage;
- how Git changed lines become a coverage requirement;
- what LCOV provides;
- why missing LCOV can be dangerous in CI;
- how `rootDir` fixes path mismatches.

These pages can be more detailed, with diagrams and examples.

### Technical / Reference

Reference pages should be direct and precise:

- CLI flags;
- config keys;
- default values;
- min/max limits;
- exit behavior;
- CI examples;
- troubleshooting tables.

## Site Scope

The first implementation should include:

- a polished homepage that sells the tool;
- the documentation pages from the existing site plan;
- a scalable docs structure;
- GitHub Actions guide;
- GitLab CI guide;
- frontend-oriented monorepo guidance;
- ready-to-copy coverage configs for Jest, Vitest, and nyc;
- search from the first version;
- Mermaid diagrams;
- i18n foundations from the beginning;
- dark theme as the primary visual direction;
- footer links for GitHub, npm, License, and Issues.

Do not include in the first implementation:

- blog;
- changelog page;
- docs versioning;
- PR preview deploys;
- official support pages for CI systems outside GitHub and GitLab.

## Repository Strategy

The documentation site should live in a new repository, not inside the current CLI repository.

Implementation assumptions for the new repository:

- use npm;
- use Docusaurus;
- keep the site repository focused on documentation, content, and website checks;
- do not mix website dependencies into the CLI package repository;
- keep the structure easy for AI-assisted development.

## Docusaurus Setup

Recommended setup:

- Docusaurus latest stable;
- TypeScript-enabled Docusaurus config where practical;
- npm lockfile in the website repository;
- Mermaid enabled;
- search enabled immediately;
- i18n configured from the start, even if only one locale is initially written;
- default Docusaurus theme as the base, with a restrained custom dark visual layer.

Recommended first locale:

```text
en
```

Potential later locale:

```text
uk
```

The initial content can be English-first because open-source package documentation usually needs a global audience. The
i18n structure should make Ukrainian localization possible without rewriting the site.

## Homepage Requirements

The homepage should be more like a product page for a focused open-source utility than a plain docs landing page.

Required sections:

1. Hero section:
   - product name;
   - clear tagline;
   - one install command;
   - primary CTA to Quick Start;
   - secondary CTA to GitHub.
2. Problem section:
   - total coverage can hide uncovered PR changes;
   - missing LCOV or shallow Git history can make CI checks misleading.
3. How it works:
   - Git diff;
   - LCOV;
   - changed executable lines;
   - threshold;
   - PR/MR comment.
4. CI integrations:
   - GitHub Actions;
   - GitLab CI.
5. Example output:
   - passing state;
   - failing uncovered line state.
6. Why teams use it:
   - incremental adoption;
   - strict on new code;
   - no need to immediately raise full-project coverage.
7. Final CTA:
   - Quick Start;
   - Configuration reference.

The homepage should avoid being visually empty. It can use a custom simple logo/icon and a dark technical aesthetic.

## Branding

Confirmed:

- site name: `Diff Coverage Guard`;
- use a custom logo/icon for now;
- final logo can be replaced later;
- dark theme first;
- default Docusaurus theme is acceptable as the foundation;
- no changelog in navbar.

Navbar:

- Docs;
- GitHub;
- npm.

Footer:

- GitHub;
- npm;
- License;
- Issues.

## Technical Checks

The site repository should include only checks that keep AI-assisted development reliable and prevent formatting or type
drift.

Recommended scripts:

```json
{
  "start": "docusaurus start",
  "build": "docusaurus build",
  "serve": "docusaurus serve",
  "clear": "docusaurus clear",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "lint": "eslint . --max-warnings=0",
  "typecheck": "tsc --noEmit"
}
```

Stylelint is optional. Add it only if custom CSS becomes large enough to justify a separate CSS linting layer. For a
small Docusaurus site, Prettier plus a small amount of reviewed CSS is likely enough at first.

CI should be basic and clean:

- install dependencies with `npm ci`;
- run `npm run format:check`;
- run `npm run lint`;
- run `npm run typecheck`;
- run `npm run build`.

## Deployment

Preferred hosting:

```text
Netlify
```

Reasoning:

- simple static hosting for Docusaurus;
- clean automatic deploys from `main`;
- less GitHub Pages `baseUrl` complexity;
- good fit for a standalone docs repository;
- preview deploys can be ignored for now.

Deployment decisions:

- deploy from `main`;
- no PR preview deploys in the first version;
- use Netlify auto-deploy;
- Netlify CLI can be used for initial setup if needed;
- production URL should be intentionally chosen after the Netlify project exists.

Preferred URL direction:

```text
https://diff-coverage-guard.netlify.app
```

or, if available:

```text
https://diffcovguard.netlify.app
```

A custom domain can be considered later.

## Documentation Content Decisions

Confirmed:

- provide ready-to-copy Jest coverage config;
- provide ready-to-copy Vitest coverage config;
- provide ready-to-copy nyc/Istanbul coverage config;
- document GitHub Actions and GitLab CI first;
- recommend `failOnEmpty: true` in CI;
- recommend running total coverage and diff coverage together unless the project intentionally uses only diff coverage;
- do not spend time explaining why CSS, JSON, or docs files are ignored in the first version;
- for monorepos, start with frontend-oriented scenarios only;
- after the full docs site exists, simplify this repository's README to a Quick Start plus links.

## Source Of Truth For Docs

The implementation agent should treat these files in the CLI repository as canonical behavior references:

- `bin/cli.js` for commands, flags, help text;
- `src/index.js` for runtime workflow, skip/pass/fail behavior;
- `src/config.js` for config precedence and parsing;
- `src/constants.js` for defaults and limits;
- `src/environment.js` for GitHub/GitLab/local detection;
- `src/git.js` for base branch fetching and changed-line discovery;
- `src/lcov.js` and `src/lcov-stream.js` for LCOV parsing and path normalization;
- `src/coverage.js` for diff coverage math;
- `src/comment.js` for GitHub/GitLab comment behavior;
- `diff-cov-guard.schema.json` for public config schema;
- `README.md` for the current public quick-start baseline.

## Finalized Open Questions

These questions were clarified before implementation and should be treated as decisions for the first website build.

### Tagline

Answer:

```text
Protect pull requests with diff-based coverage checks.
```

### GitHub Fork PR Permissions

Answer:

```text
Yes. The GitHub Actions guide should explain that pull requests from forks can have restricted GITHUB_TOKEN permissions,
so the coverage check may run while PR comment publishing is unavailable.
```

### GitLab Token Permissions

Answer:

```text
Yes. The GitLab CI guide should recommend the token permissions needed for creating and updating merge request notes.
The exact current GitLab scopes must be verified from official GitLab documentation during implementation.
```

### Exit Code Matrix

Answer:

```text
Yes. Create a dedicated reference table for success, failure, and skipped outcomes so users can reason about CI behavior.
```

### Admonitions / Callouts

Answer:

```text
Yes. Use Docusaurus callouts for important notes, especially failOnEmpty, shallow Git history, fork PR comment
permissions, token permissions, and LCOV path mismatches.
```

### Search Provider

Answer:

```text
Use a local search plugin in v1.
```

### Netlify Production URL

Answer:

```text
https://diffcovguard.netlify.app
```

### Initial Locale Content

Answer:

```text
Build English and Ukrainian content in v1.
```

### Logo Direction

Answer:

```text
Use a simple custom SVG mark in the style of shield + diff lines + check.
```
