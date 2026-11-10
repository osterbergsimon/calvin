---
lane_control_template: 1
max_lines: 60
read_by: every agent
---
Project facts for agents run by lane-control. They add to your persona, your brief and AGENTS.md and never relax
them. Where this file and AGENTS.md disagree, AGENTS.md wins: say so in your report.
# Project
Calvin is a self-hosted dashboard for a Raspberry Pi kiosk screen: calendars, photos, web services. Vue 3 frontend, FastAPI backend, plugin system. Households use it on a wall display and on phones. Breaking the admin lock, the plugin loader, backup/restore or the kiosk install and update scripts would hurt most.

## Layout
path | what lives there
--- | ---
backend/app/ | FastAPI: api/routes, plugins (loader, contract), security (auth, keys, share links), services
backend/alembic/, backend/tests/ | DB migrations (SQLite, Ormar); pytest incl. contract snapshot
frontend/src/, frontend/tests/ | Vue app, Pinia stores, typed API in src/api; Vitest and Playwright
scripts/ | kiosk setup/update shell scripts and bats tests
docker/, docs/ | compose files; MkDocs docs, docs/design for design notes

## Branches and issues
Default branch is `main` (release). PRs go into `develop`, never `main`; `main` receives only release-please PRs. Issues: beads (`bd`), local only. Lane key prefix: `calvin-` (for example calvin-6yja). Conventional Commits, scopes backend, frontend, plugins, kiosk, docker, docs, scripts.

## Checks
command | when | where it is written
--- | --- | ---
`cd backend && uv run ruff check .` | backend change | CONTRIBUTING.md "Quality gates"
`cd backend && uv run ruff format --check .` | backend change | CONTRIBUTING.md, ci.yml
`cd backend && uv run mypy app --ignore-missing-imports` | backend change | CONTRIBUTING.md, ci.yml
`cd backend && uv run bandit -r app -ll` | backend change | ci.yml
`cd backend && uv run pytest -q` | backend change | CONTRIBUTING.md
`cd frontend && npm run lint` | frontend change | CONTRIBUTING.md
`cd frontend && npx prettier --check "src/**/*.{js,jsx,vue,json,css}"` | frontend change | ci.yml
`cd frontend && npm run type-check` | frontend change | ci.yml
`cd frontend && npx vitest run` | frontend change | CONTRIBUTING.md
`cd frontend && npm run gen:api` | API schema change; commit src/api/types.ts | ci.yml
`cd frontend && E2E_PORT=5273 npm run test:e2e:a11y` | UI change | CONTRIBUTING.md
`scripts/check-commit-attribution.sh origin/develop..HEAD` | before PR | CONTRIBUTING.md
`cd scripts && bats tests/` | scripts/ change (needs bats) | Makefile `test-scripts`

## Do not run
- `make clean`: deletes dev data, `.venv`, `node_modules`, `dist`.
- `make dev`, `make dev-down`, `make build`: Docker stacks a lane may not have.
- `scripts/setup*.sh`, `update-calvin.sh`, `bake-kiosk-firstrun.sh`, `install-git-hooks.sh`, `reboot-calvin.sh`, `restart-calvin-services.sh`: change or reboot the host. Run only their tests.
- `bd dolt push`, `git push`; `make demo-seed`, `make demo-clear` (writes a data dir).

## Heavy work
Playwright e2e starts a Vite dev server on port 5173. Set `E2E_PORT=<free port>` so lanes do not clash. Run one e2e project at a time. `npm run build` and `uv sync` are slow on first run.

## Private data
`data/`, `backend/data/` (DB, images, plugins, `kiosk-signing.key`, `setup-code.txt`), `docker/.env`, `.env*`, `.beads/`, `.dolt/`.

## Acts on the host
Routes in `backend/app/api/routes/system.py`: `/update`, `/display/power/*`, `/display/timeout/configure`, `/reload-ui`, `/restart-frontend`, `/restart-backend`, `/reboot`. Also `backend/app/services/display_*` and `scripts/`. Workers stub these in tests and in the browser (route interception, as the a11y suite does).

## Exposure
Public repository. Keep out of commits and PR text: secrets, setup codes, signing keys, API keys, real hostnames, IPs, home-directory paths, calendar or photo data, and AI attribution (CI rejects it). Security issues go through SECURITY.md, never a public issue.

## Where decisions live
- `docs/design/` incl. `frontend-doctrine.md`: design decisions. `CLAUDE.md`: conventions and gotchas. Change only when an issue says so.
- `backend/tests/contract/openapi.json` (source of generated `frontend/src/api/types.ts`) and `backend/app/plugins/definitions.py` (plugin contract 1.0, used by `calvin-plugins`).
