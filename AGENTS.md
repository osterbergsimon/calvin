# Calvin — Developer Guide

The canonical agent/developer guide for this repo lives in **[CLAUDE.md](CLAUDE.md)**.

This file is intentionally a pointer, not a copy — a previous full duplicate here
drifted out of sync with `CLAUDE.md` (it still described a retired plugin
architecture). To avoid that, all guidance is maintained in one place.

👉 **Read [CLAUDE.md](CLAUDE.md).** It covers the stack, the plugin system, conventions,
gotchas, a file map, and links to the deeper docs under [docs/](docs/).

## Project facts for agents

Facts that [CLAUDE.md](CLAUDE.md) does not cover. Where they disagree, CLAUDE.md wins.

**Branches.** Open every PR into `develop`. `main` only receives the promote PR
(develop to main) and release-please PRs. Use Conventional Commits with scopes
`backend`, `frontend`, `plugins`, `kiosk`, `docker`, `docs`, `scripts`.

**Checks.** Run the ones for the side you touched; [CONTRIBUTING.md](CONTRIBUTING.md)
"Quality gates" and `.github/workflows/ci.yml` are the source of truth.

- Backend: `uv run ruff check .`, `uv run ruff format --check .`,
  `uv run mypy app --ignore-missing-imports`, `uv run bandit -r app -ll` (CI only), `uv run pytest -q`.
  The plugin contract test needs a calvin-plugins checkout: it finds `../calvin-plugins`
  or `CALVIN_PLUGINS_DIR`, and skips without one. A skipped contract test is not a pass; say so.
- Frontend: `npm run lint`, `npx prettier --check "src/**/*.{js,jsx,vue,json,css}"`,
  `npm run type-check`, `npx vitest run`, `npm run build` (its postbuild step enforces the bundle budget).
- After an API schema change, run `npm run gen:api` and commit `frontend/src/api/types.ts`
  (CI fails if it is stale). The generated file is not hand-edited.
- UI change: `npm run test:e2e:a11y`. Docs change: `mkdocs build --strict` (command in CONTRIBUTING.md).
  `scripts/` change: `cd scripts && bats tests/` (needs bats).
- Before opening a PR: `scripts/check-commit-attribution.sh origin/develop..HEAD`.

**Do not run.**

- `make clean` deletes dev data, `.venv`, `node_modules` and `dist`.
- `make dev`, `make dev-down` and `make build` need Docker.
- `make demo-seed` and `make demo-clear` write to a data dir.
- `scripts/setup*.sh`, `update-calvin.sh`, `bake-kiosk-firstrun.sh`, `install-git-hooks.sh`,
  `reboot-calvin.sh` and `restart-calvin-services.sh` change or reboot the host.
  Run their bats tests only.

**Playwright.** The e2e suite starts a Vite dev server on port 5173. Set
`E2E_PORT=<free port>` so parallel runs do not clash, and run one e2e project at a time.

**Private data.** Never read, print or commit `data/`, `backend/data/` (DB, images, plugins,
`kiosk-signing.key`, `setup-code.txt`), `docker/.env`, `.env*`, `.beads/` or `.dolt/`.

**Host-acting routes.** In `backend/app/api/routes/system.py`: `/update`, `/display/power/*`,
`/display/timeout/configure`, `/reload-ui`, `/restart-frontend`, `/restart-backend`, `/reboot`.
The same goes for `backend/app/services/display_*` and `scripts/`. Tests stub these, in the
browser by route interception as the a11y suite does. Never call them for real.

**Public repo.** Keep these out of commits and PR text: secrets, setup codes, signing keys,
API keys, real hostnames, IPs, home-directory paths, calendar or photo data, and AI attribution
(CI rejects it). Security issues go through [SECURITY.md](SECURITY.md), never a public issue.

**Highest-risk paths** (a mistake here hurts most; take extra care and add tests):
`backend/app/security/`, `api/routes/{auth,system,backup,security,kiosks}.py`,
`services/backup/`, `services/kiosk_*.py`, `services/plugin_installer.py`,
`services/theme_installer.py`, `services/validation/`, `backend/alembic/`, `scripts/*.sh`
(run as root on the Pi) and `.gitignore` (it keeps the signing key, setup code and `.env` out of git).
The same goes for anything that changes the plugin contract (`api_version`, `PluginMetadata`,
`SUPPORTED_DISPLAY_KINDS`), since calvin-plugins depends on it.

**Where decisions live.** Design decisions are in `docs/design/` (including `frontend-doctrine.md`);
change them only when an issue says so. The plugin contract is in
`backend/app/plugins/definitions.py`, and the API contract snapshot is
`backend/tests/contract/openapi.json`, the source of `frontend/src/api/types.ts`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
