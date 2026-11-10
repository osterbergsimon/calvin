---
lane_control_template: 1
max_lines: 30
read_by: coordinator
---
Additions to your persona for this project. They never relax a rule there.

## First turn
- `bd ready` and `bd show <id>`: issues live in beads, not on the git host. Read CLAUDE.md "Gotchas" and "House rules".
- `docs/design/frontend-doctrine.md` before any UI lane.
- `.lane-control/routing.md` for tiers.
- `git log origin/develop..main --oneline`: `develop` is the PR base and may differ from `main`.

## Every lane brief adds
- PR base is `develop`, not `main`.
- Test-first: a bug fix ships with a test that fails without it.
- Backend logging uses loguru; DB writes use `retry_on_db_locked`; writable paths come from `settings`.
- Plugins live in the separate `calvin-plugins` repo. Plugin work does not belong here.
- Changing a renderer kind needs both `rendererRegistry.js` and `SUPPORTED_DISPLAY_KINDS`.
- An API change needs `backend/tests/contract/openapi.json` and `frontend/src/api/types.ts` regenerated.

## Opening lanes here
Base branch `develop`. `orca.yaml`'s setup script does the installs (`uv sync` in backend, `npm ci` in frontend; allow several minutes), and agents wait for `.git/.../orca-setup-done` before starting. Frontend lanes running Playwright must set their own `E2E_PORT`. Worktrees go in `.worktrees/` (gitignored).

## Owner first
The owner's standing word for every lane: the coordinator merges a lane PR into develop when CI is green and the reviewer found no blocker or major (minors fixed or waived by the owner); 'Owner first' paths and main still need the owner.
- Anything in `backend/app/security/`, backup/restore, Alembic migrations, or the `plugin.json` contract (`api_version`).
- Changes to `scripts/` that touch sudoers, systemd units, users or the kiosk update path.
- Any change to the CI workflows, release-please or the promote-develop-to-main flow.
- Renaming or removing public API routes.
