---
lane_control_template: 1
max_lines: 30
read_by: reviewer
---
Additions to your persona for this project. They never relax a rule there, and they never lower a finding's level.

## Look at first
- Auth bypass: new routes missing from the policy in `backend/app/security/route_policy.py`; guest and share-link gates in `guest_gate.py`, `share_links.py`.
- Host-acting routes in `backend/app/api/routes/system.py` reachable without admin auth or run unstubbed in tests.
- Plugin loading and install (`backend/app/plugins/loader.py`, `backend/app/services/validation/package_validator.py`): untrusted packages, path traversal, pip deps.
- Backup and restore (`backend/app/services/backup/`): secrets leaking into exports, data loss on restore.
- DB writes without `retry_on_db_locked`; relative `Path("data/...")` instead of `settings`.
- Frontend: `ref` not unref'd in URLs, raw `axios` in stores, mismatched renderer kinds, UI changes without light/dark and phone (390x844) checks.

## How to exercise a change
- Backend: `cd backend && uv run pytest <path>` for the touched tests.
- Frontend unit: `cd frontend && npx vitest run <path>`.
- UI: Playwright with `E2E_PORT=<free port>`; the a11y and phone projects mock the backend by route interception, so no server is needed.
- Scripts under `scripts/`: read only for the script; run only its `scripts/tests/` counterpart. The scripts change the host.
- Migrations and security code: read only, plus the tests; do not run against a real data dir.

## Also blockers here
- A host-acting route or script run for real instead of stubbed.
- A bug fix without a test that fails without it.
- AI attribution or a `Co-Authored-By` trailer in commits or PR text.
- A PR aimed at `main` instead of `develop`.
- `openapi.json` and `src/api/types.ts` out of sync after an API change.
