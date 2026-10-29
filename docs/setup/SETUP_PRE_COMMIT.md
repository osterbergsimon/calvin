# Setting Up Pre-commit Hooks

Pre-commit hooks run linting and formatting before each commit, preventing
code with errors from being committed. Calvin's hook config lives in
`.pre-commit-config.yaml` at the repository root and runs:

1. **Backend (Ruff)** — `ruff check --fix` and `ruff format` on `backend/**/*.py`
2. **Frontend (ESLint)** — `eslint --fix` on `frontend/**/*.{js,vue}`
3. **Frontend (Prettier)** — `prettier` on `frontend/**/*.{js,jsx,vue,json,css}`

## Installation

### One-time setup

From the project root:

```bash
./scripts/install-git-hooks.sh
```

The script picks the right install path for your checkout:

- **Plain clone** (`core.hooksPath` unset): runs `pre-commit install`, which
  writes `.git/hooks/pre-commit` as usual.
- **`core.hooksPath` set** (the beads setup points it at `.beads/hooks`):
  `pre-commit install` refuses to touch that path ("Cowardly refusing to
  install hooks with `core.hooksPath` set"), so the script appends a
  marked block to that directory's `pre-commit` hook. The block runs
  `pre-commit run` **after** the beads hook, so both run on every commit. It
  is added once and re-running the script is safe.

The script does not reinstall or modify the beads hook itself; it only adds
the chained block.

### If you have the backend venv

The script prefers `backend/.venv/bin/pre-commit` when it exists and falls
back to `uv run --directory backend pre-commit …`, so you do not need
`pre-commit` on your global PATH. Make sure the dev tools are installed:

```bash
cd backend && uv sync --extra dev
```

## Running hooks manually

Run the full hook set over every file, without committing:

```bash
# From the project root
backend/.venv/bin/pre-commit run --all-files
# or, without the venv:
uv run --directory backend pre-commit run --all-files
```

## Updating hooks

There is no separate update command: `pre-commit install` only writes the
hook shim, not the hook versions. To pick up a changed config or new hook
revisions, run the hooks again (they update their environments on demand):

```bash
backend/.venv/bin/pre-commit run --all-files
```

If you move or recreate `.git/hooks` or change `core.hooksPath`, re-run
`./scripts/install-git-hooks.sh`.

## Bypassing hooks (if needed)

For a specific commit (not recommended):

```bash
git commit --no-verify -m "your message"
```

## Troubleshooting

### Hooks not running

- Re-run `./scripts/install-git-hooks.sh`.
- With beads, check the chained block exists in the hook that
  `git config core.hooksPath` points at:

  ```bash
  git config --get core.hooksPath
  grep -n "CALVIN PRE-COMMIT" "$(git rev-parse --show-toplevel)/.beads/hooks/pre-commit"
  ```

### `pre-commit: command not found`

- The chained block uses `backend/.venv/bin/pre-commit` if present, so run
  `cd backend && uv sync --extra dev`.
- Or run `uv run --directory backend pre-commit run --all-files` manually.

### Commits hang or the beads hook times out

The beads hook runs first and honours `BEADS_HOOK_TIMEOUT` (default 300 s).
If it times out, it logs a warning and continues; the pre-commit block then
runs as usual.
