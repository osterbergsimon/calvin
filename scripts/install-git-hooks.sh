#!/usr/bin/env sh
# Install Calvin's pre-commit checks (ruff, eslint, prettier) as a git hook.
#
# Plain clone: runs `pre-commit install`.
# core.hooksPath set (e.g. beads points it at .beads/hooks): `pre-commit
# install` refuses to touch that ("Cowardly refusing..."), so instead this
# appends a block to that directory's pre-commit hook which chains to
# `pre-commit run`. Safe to re-run: the block is added once.
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

hooks_path=$(git config --get core.hooksPath || true)

if [ -z "$hooks_path" ]; then
  if [ -x backend/.venv/bin/pre-commit ]; then
    exec backend/.venv/bin/pre-commit install
  fi
  exec uv run --directory backend pre-commit install --config "$repo_root/.pre-commit-config.yaml"
fi

case "$hooks_path" in
  /*) ;;
  *) hooks_path="$repo_root/$hooks_path" ;;
esac
hook="$hooks_path/pre-commit"
marker="# --- BEGIN CALVIN PRE-COMMIT ---"

if [ -f "$hook" ] && grep -qF "$marker" "$hook"; then
  echo "pre-commit is already chained from $hook"
  exit 0
fi

mkdir -p "$hooks_path"
if [ ! -f "$hook" ]; then
  printf '#!/usr/bin/env sh\n' >"$hook"
fi

cat >>"$hook" <<'EOF'
# --- BEGIN CALVIN PRE-COMMIT ---
# Added by scripts/install-git-hooks.sh: run the repo's pre-commit checks.
if [ -f .pre-commit-config.yaml ]; then
  if [ -x backend/.venv/bin/pre-commit ]; then
    backend/.venv/bin/pre-commit run --hook-stage pre-commit || exit $?
  elif command -v pre-commit >/dev/null 2>&1; then
    pre-commit run --hook-stage pre-commit || exit $?
  else
    echo >&2 "calvin: pre-commit not found (run 'cd backend && uv sync --extra dev'); skipping checks"
  fi
fi
# --- END CALVIN PRE-COMMIT ---
EOF
chmod +x "$hook"
echo "Chained pre-commit from $hook"
