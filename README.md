# CrossPrune

CrossPrune maps frontend API calls to backend routes and reports evidence-backed prune candidates without deleting code.

It is a lean MVP reachability auditor for JavaScript/Node projects. It scans backend route definitions, frontend network calls, hidden consumer hints, and route dependencies, then writes Markdown and JSON reports.

## Install

```bash
npm install
```

## Run

```bash
npx cross-prune
npx cross-prune --backend server.js --frontend frontend --out reports
```

From this repository, the default command falls back to the sanitized fixture under `fixtures/` so a fresh clone can run immediately.

## Codex Skill Usage

The repo includes `.agents/skills/cross-prune/SKILL.md`.

Open Codex from the repo root and invoke:

```text
Use $cross-prune to scan this project for backend API routes with no frontend consumers.
```

The skill should run or reference the CLI, inspect the generated reports, and present prune candidates without deleting code.

## Safety

CrossPrune does not delete code. It only reports prune candidates.

Treat every candidate as a review item. Confirm ownership, external consumers, and deployment behavior before pruning.

## Reports

By default CrossPrune writes:

- `reports/CROSS_PRUNE_REPORT.md`
- `reports/cross-prune-report.json`

Generated reports are ignored by git. A sanitized example is available at `examples/sample-report.md`.

## Limitations

Routes may be used by mobile apps, external clients, webhooks, cron jobs, admin panels, or dynamic calls.

CrossPrune is regex-based and intentionally small. It handles common Express, `fetch`, and `axios` patterns, but complex URL builders, cross-file router composition, generated API clients, and framework-specific route systems may need manual review.

## Pre-Publish Check

```bash
npm run prepublish-check
```

This runs tests, validates the package contents, checks git status, and scans for local paths or common secret names.
