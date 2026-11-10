---
lane_control_template: 1
max_lines: 30
read_by: design lead
---
Additions to your persona for this project. They never relax a rule there.

## First turn
- `docs/design/frontend-doctrine.md`: the owner's design decisions. Read it before any design call.
- Other notes in `docs/design/` and CLAUDE.md "Gotchas" and "House rules".
- `.lane-control/routing.md` for tiers: `docs/design/**` and `frontend/**` are standard, review B.

## Project facts that shape design
- Calvin runs on a wall display and on phones: check both, light and dark, phone at 390x844.
- Renderer kinds need both `frontend/src/.../rendererRegistry.js` and `SUPPORTED_DISPLAY_KINDS`.
- Plugins live in the separate `calvin-plugins` repo; plugin work does not belong here.
- PR base is `develop`, not `main`.

## Boundaries
- Change `docs/design/` only when an issue says so; an open design question goes to the owner.
- UI checks: Playwright a11y and phone projects with `E2E_PORT=<free port>`.
