#!/usr/bin/env bash
# calvin-26c: plugin pip dependencies must live on the data volume, keyed by the
# interpreter's major.minor, and the entrypoint must only restore them when the
# target is missing/corrupt/stale — not on every start.
#
# Runs docker/entrypoint.sh with a fake `uv` (records its argv, creates the
# dist-info the "target is current" check looks for) and a fake `python` that
# only lies about its version; everything else execs the real interpreter.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

ENTRY="$HERE/../../docker/entrypoint.sh"
REAL_PYTHON="$(command -v python3 || command -v python)"
B="$tmp/bin"
D="$tmp/data"
PLUGIN="$D/plugins/demo"
mkdir -p "$B" "$PLUGIN"

write_manifest() {  # packages-json-array
    cat >"$PLUGIN/plugin.json" <<JSON
{"id": "demo", "name": "Demo", "version": "1.0.0", "type": "service",
 "api_version": 1, "dependencies": {"packages": $1}}
JSON
}

cat >"$B/python" <<SH
#!/bin/sh
case "\$*" in
    *version_info*) echo "\${FAKE_PYTHON_VERSION:-3.12}"; exit 0 ;;
esac
exec "$REAL_PYTHON" "\$@"
SH
chmod +x "$B/python"

cat >"$B/uv" <<SH
#!/bin/sh
echo "uv \$*" >>"$tmp/uv.log"
target=
while [ \$# -gt 0 ]; do
    case "\$1" in
        --target) target="\$2"; shift 2 ;;
        *) shift ;;
    esac
done
[ -n "\$target" ] || { echo "uv: missing --target" >&2; exit 2; }
[ -z "\${FAKE_UV_FAIL:-}" ] || { echo "uv: simulated network failure" >&2; exit 1; }
mkdir -p "\$target" && touch "\$target/six-1.17.0.dist-info"
SH
chmod +x "$B/uv"

run_entrypoint() {  # [extra env...]
    PATH="$B:$PATH" CALVIN_DATA_DIR="$D" sh "$ENTRY" true 2>&1
}

uv_calls() { cat "$tmp/uv.log" 2>/dev/null || true; }

TARGET_312="$D/python/3.12/site-packages"
STAMP_312="$D/python/3.12/.plugin-deps"
TARGET_313="$D/python/3.13/site-packages"
write_manifest '["six==1.17.0", "packaging"]'

# 1. Fresh volume: packages go into the per-version target, not the venv.
out="$(run_entrypoint)"
assert_contains "$tmp/uv.log" --target.*"$TARGET_312" "uv did not target $TARGET_312"
assert_contains "$tmp/uv.log" "six==1.17.0 packaging" "packages were not passed through"
# CLAUDE.md gotcha: --python goes after `install`.
assert_contains "$tmp/uv.log" "install --quiet --target $TARGET_312 --python /app/.venv/bin/python" \
    "install/--target/--python flag order regressed"
[ -s "$STAMP_312" ] || fail "expected a dependency stamp at $STAMP_312"
assert_contains "$STAMP_312" '^[0-9a-f]{64}$' "stamp is not a sha256 digest"

# 2. Second start with an unchanged volume: no network work at all.
calls_before="$(uv_calls)"
out="$(run_entrypoint)"
assert_eq "$calls_before" "$(uv_calls)" "the entrypoint reinstalled packages on a current target"
case "$out" in
    *"are current"*) ;;
    *) fail "expected the entrypoint to report the target as current, got: $out" ;;
esac

# 3. A base image with another Python minor version gets its own target.
out="$(FAKE_PYTHON_VERSION=3.13 run_entrypoint)"
assert_contains "$tmp/uv.log" --target.*"$TARGET_313" "a new Python version did not rebuild its own target"
[ -d "$TARGET_313" ] || fail "expected $TARGET_313 to be created"

# 4. Changed dependencies invalidate the stamp.
write_manifest '["six==1.15.0"]'
out="$(FAKE_PYTHON_VERSION=3.13 run_entrypoint)"
assert_contains "$tmp/uv.log" "six==1.15.0" "a changed dependency set was not reinstalled"

# 5. A corrupt target (metadata gone) is rebuilt instead of trusted.
rm -rf "$TARGET_313"/*.dist-info
before="$(uv_calls)"
out="$(FAKE_PYTHON_VERSION=3.13 run_entrypoint)"
[ "$before" != "$(uv_calls)" ] || fail "a target without metadata was trusted"

# 6. A failed install must not stamp the target as current.
rm -rf "$TARGET_313" "$D/python/3.13/.plugin-deps"
out="$(FAKE_UV_FAIL=1 FAKE_PYTHON_VERSION=3.13 run_entrypoint || true)"
case "$out" in
    *"WARNING: could not restore packages"*) ;;
    *) fail "expected a warning when uv fails, got: $out" ;;
esac
[ -s "$D/python/3.13/.plugin-deps" ] && fail "a failed install must not write the stamp"

# 7. No declared packages: nothing to restore.
write_manifest '[]'
before="$(uv_calls)"
out="$(FAKE_PYTHON_VERSION=3.13 run_entrypoint)"
assert_eq "$before" "$(uv_calls)" "plugin packages were installed although none are declared"
case "$out" in
    *"nothing to restore"*) ;;
    *) fail "expected 'nothing to restore', got: $out" ;;
esac

# 8. The stamp is keyed by Python version: 3.12 stays current while 3.13 rebuilt.
[ -s "$STAMP_312" ] || fail "the 3.12 stamp disappeared"

pass "entrypoint installs plugin deps into the persistent target"
