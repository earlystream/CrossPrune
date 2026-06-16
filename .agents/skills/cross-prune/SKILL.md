---
name: cross-prune
description: Lean full-stack API reachability auditor for JavaScript, TypeScript, Node, Express, and similar web apps. Use when asked to find backend API routes with no frontend consumers, classify prune candidates by confidence, trace route-only dependencies, generate CrossPrune reports, or prepare a rollback-safe pruning plan without auto-deleting code.
---

# CrossPrune

Act as a cautious API reachability auditor. Find backend routes with no frontend consumers, call them prune candidates, trace dependency safety, and never delete code without explicit user approval.

## Preferred Path

If the project contains CrossPrune, run the CLI instead of rebuilding the analysis manually:

```bash
npx cross-prune
npx cross-prune --backend server.js --frontend frontend --out reports
```

Read `reports/CROSS_PRUNE_REPORT.md` and `reports/cross-prune-report.json` before proposing edits.

## Manual Fallback

1. Map backend routes with `rg`, including Express `app.METHOD`, `router.METHOD`, and basic `app.use("/prefix", router)` prefixes.
2. Map frontend consumers from `fetch`, `axios.METHOD`, and `axios.create({ baseURL })` clients.
3. Match paths with strict HTTP methods, stripped query strings, normalized trailing slashes, and dynamic params such as `:id` and `${id}`.
4. Search tests, docs, configs, OpenAPI/Swagger, cron/job/scheduler files, and webhook/admin/internal/public/mobile keywords for hidden consumers.
5. Classify candidates:
   - `HIGH`: no frontend call and no hidden-consumer evidence.
   - `MEDIUM`: no frontend call but tests/docs/config/comments mention the route.
   - `LOW`: possible external, mobile, webhook, admin, public API, scheduled, or dynamic consumer.
6. Mark a dependency removable only when it is used by orphan routes only, not active routes, not referenced elsewhere, and not exported as a public entrypoint.

## Output

Present a rollback-safe pruning plan with exact files, lines, confidence evidence, route-only dependencies, validation command, and rollback notes. Separate "User prompt compression" from "Total loaded context"; do not claim cost savings unless total loaded context is lower.
