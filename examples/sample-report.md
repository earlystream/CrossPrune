# CrossPrune Report

Generated: 2026-01-01T00:00:00.000Z

## Backend Manifest
- GET /api/example-users (fixtures/server.js)
- GET /api/example-users/:id/status (fixtures/server.js)
- POST /api/example-billing (fixtures/server.js)
- DELETE /api/example-orphan (fixtures/server.js)

## Frontend Calls
- GET /api/example-users via fetch
- GET /api/example-users/*/status via fetch
- POST /api/example-billing via fetch

## Prune Candidates
- DELETE /api/example-orphan confidence=HIGH evidence=0

## Route-Only Dependencies
- cleanOldDatabaseRecords for DELETE /api/example-orphan: removable=true

## Warnings
- This is a sanitized example report. Real reports may include additional evidence and candidates.

## User Prompt Compression
- Report user prompt compression separately from total loaded context.

## Total Loaded Context
- Do not claim cost savings unless total loaded context is lower.

## Rollback-Safe Prune Plan
- Do not auto-delete.
- Review candidates and dependencies.
- Patch one route at a time.
- Run validation after each prune.
