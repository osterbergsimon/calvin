# Kiosk Updater Self-Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `update-kiosk.sh` verify a new copy of itself before adopting it, so a broken updater bundle aborts the whole update atomically and the known-good updater always stays installed.

**Architecture:** Add a read-only `--self-check` mode to the updater. In the existing pre-swap verify loop, `bash -n` any `*.sh` file and run the staged updater's `--self-check`; on failure, `write_state error` + `exit 1` before any swap — upholding the "verify everything before swapping anything" invariant.

**Tech Stack:** Pure bash + python3 (no jq). Tests are bash scripts under `scripts/tests/` with mocked `curl`/`systemctl` and a temp filesystem.

## Global Constraints

- **Pure bash + `python3` only** — no jq, no new dependencies on the Pi.
- **`--self-check` mutates nothing**: no `mkdir` of the state dir, no swap, no restart, no state-file/version-file/backup/ready-marker writes. It triggers no update, so it cannot recurse.
- **Verification is pre-swap and abort-whole-on-fail**: a failed check exits before any file is swapped; the installed updater stays byte-identical.
- **Honor existing env overrides** so tests can mock and production hits the real backend: `CALVIN_CURL`, `CALVIN_PYTHON`, `CALVIN_SYSTEMCTL`, `CALVIN_AGENT_STATE_DIR`, `CALVIN_SYSTEMD_DIR`, `CALVIN_KIOSK_ENV_FILE`, `CALVIN_BACKEND_URL`.
- **Normal invocation is unchanged**: `update-kiosk.sh` with no args runs the full update exactly as today; `--self-check` is only used internally by the verify phase.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `deploy/kiosk-agent/update-kiosk.sh` | The updater | Add `--self-check` mode (Task 1); add verify-phase gating + comment fix (Task 2) |
| `scripts/tests/test_update_kiosk.sh` | Updater tests | Append `--self-check` contract tests (Task 1); append gating tests (Task 2) |
| `docs/setup/KIOSK_PROVISIONING.md` | Kiosk docs | Add an "Updating the updater" note (Task 2) |

---

## Task 1: `--self-check` mode

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh` (top of file: move `log()` up, add the `--self-check` branch before `mkdir -p "$STATE_DIR"`)
- Test: `scripts/tests/test_update_kiosk.sh` (append two blocks at end)

**Interfaces:**
- Produces: `update-kiosk.sh --self-check` — sources env, fetches `$BASE/api/kiosks/agent/manifest` via `$CURL`, parses it with `$PYTHON` (requires a truthy `version` and a `files` list), exits `0` on success / non-zero on any failure. Writes nothing, calls no `systemctl`.

- [ ] **Step 1: Write the failing tests (append to `scripts/tests/test_update_kiosk.sh`)**

Append at the very end of the file (after the `PASS noop` block):
```bash
# --- --self-check contract: exits 0 on a good manifest and mutates nothing ---
mkdir -p "$tmp/state_sc"; rm -f "$tmp/systemctl.log"
cat > "$tmp/srv/sc_manifest.json" <<'MEOF'
{"version":"scv0000000000000","min_python":"3.9","files":[]}
MEOF
cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/sc_manifest.json"; exit 0;;
esac; done
exit 22
CEOF
chmod +x "$tmp/bin/curl"
CALVIN_AGENT_STATE_DIR="$tmp/state_sc" bash "$SCRIPT" --self-check || { echo "FAIL self-check: expected exit 0"; exit 1; }
[ ! -e "$tmp/state_sc/agent-update-state.json" ] || { echo "FAIL self-check: wrote state file"; exit 1; }
[ ! -e "$tmp/state_sc/agent-version.json" ]      || { echo "FAIL self-check: wrote version file"; exit 1; }
[ ! -e "$tmp/systemctl.log" ]                    || { echo "FAIL self-check: called systemctl"; exit 1; }
echo "PASS self-check-ok"

# --- --self-check fails when the backend is unreachable ---
cat > "$tmp/bin/curl" <<'CEOF'
#!/usr/bin/env bash
exit 7
CEOF
chmod +x "$tmp/bin/curl"
if CALVIN_AGENT_STATE_DIR="$tmp/state_sc" bash "$SCRIPT" --self-check; then echo "FAIL self-check: expected non-zero on unreachable backend"; exit 1; fi
echo "PASS self-check-unreachable"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: the earlier blocks still `PASS`, then FAIL — `update-kiosk.sh --self-check` currently runs the full update (no `--self-check` handling), so it will try to `mkdir` the state dir / fetch and either write files or behave unexpectedly, tripping one of the `FAIL self-check:` assertions.

- [ ] **Step 3: Implement `--self-check` in `deploy/kiosk-agent/update-kiosk.sh`**

Change the top of the script. The current lines are:
```bash
BASE="${CALVIN_BACKEND_URL%/}"

mkdir -p "$STATE_DIR"
log() { printf '[update-kiosk] %s\n' "$*"; }
```
Replace them with (move `log()` above the state-dir mkdir, and insert the `--self-check` branch before it so it mutates nothing):
```bash
BASE="${CALVIN_BACKEND_URL%/}"

log() { printf '[update-kiosk] %s\n' "$*"; }

# --self-check: read-only validation of THIS updater's startup + fetch/parse path.
# A running updater invokes this on a STAGED new updater before adopting it, so a
# dead-on-arrival updater is never installed. Mutates nothing (no state-dir mkdir,
# no swap/restart/state/version/backup/marker writes) and triggers no update, so it
# cannot recurse.
if [ "${1:-}" = "--self-check" ]; then
  _m="$("$CURL" -fsSL "$BASE/api/kiosks/agent/manifest")" || { log "self-check: manifest fetch failed"; exit 1; }
  printf '%s' "$_m" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("version") and isinstance(d.get("files"), list) else 1)' || {
    log "self-check: manifest invalid"; exit 1; }
  log "self-check: ok"; exit 0
fi

mkdir -p "$STATE_DIR"
```
(`write_state()` and everything after it stay exactly as they are.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all prior blocks plus `PASS self-check-ok` and `PASS self-check-unreachable`.

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk): add read-only --self-check mode to update-kiosk.sh"
```

---

## Task 2: Verify-phase gating (bash -n + staged self-check)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh` (verify loop: add `*.sh` `bash -n` + updater `--self-check`; fix the swap comment)
- Test: `scripts/tests/test_update_kiosk.sh` (append three gating blocks)
- Modify: `docs/setup/KIOSK_PROVISIONING.md` (add an "Updating the updater" note)

**Interfaces:**
- Consumes: `update-kiosk.sh --self-check` (Task 1).
- Produces: the verify loop now rejects a staged `update-kiosk.sh` that fails `bash -n` or `--self-check`, aborting the whole update with `write_state error verify ... "$version"` before any swap.

- [ ] **Step 1: Write the failing gating tests (append to `scripts/tests/test_update_kiosk.sh`)**

Append at the end of the file (after the Task 1 blocks):
```bash
# ===== Updater self-verification: verify the new updater before adopting it =====
UPD_TARGET="$tmp/local/update-kiosk.sh"

# healthy systemctl for these blocks (agent restart recreates the readiness marker)
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) & fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# Build a manifest with a CHANGED agent + the updater entry, and a curl mock that
# serves the given "new updater" content. $1 = path to the new-updater file to serve.
make_updater_manifest() {
  cp "$1" "$tmp/srv/update-kiosk.sh"
  local upd_sha agent_sha
  upd_sha="$(sha256sum "$tmp/srv/update-kiosk.sh" | cut -d' ' -f1)"
  printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
  echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"          # installed agent differs => "changed"
  agent_sha="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
  cat > "$tmp/srv/manifest.json" <<MEOF
{"version":"upd0000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$agent_sha","mode":"0755","target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service"},
 {"name":"update-kiosk.sh","sha256":"$upd_sha","mode":"0755","target_path":"$UPD_TARGET","restart_unit":""}]}
MEOF
  cat > "$tmp/bin/curl" <<'CEOF'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in
  */agent/manifest) cat "SRVDIR/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "SRVDIR/calvin_display_agent.py"; exit 0;;
  */agent/files/update-kiosk.sh) cat "SRVDIR/update-kiosk.sh"; exit 0;;
esac; done
exit 22
CEOF
  sed -i "s#SRVDIR#$tmp/srv#g" "$tmp/bin/curl"
  chmod +x "$tmp/bin/curl"
}
reset_updater() { printf '#!/usr/bin/env bash\necho OLD-UPDATER\n' > "$UPD_TARGET"; }

# --- valid new updater: passes bash -n and --self-check -> adopted ---
cat > "$tmp/newupd_ok.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--self-check" ] && exit 0
exit 0
UEOF
make_updater_manifest "$tmp/newupd_ok.sh"; reset_updater
rm -f "$tmp/state/agent-update-state.json"
bash "$SCRIPT" || { echo "FAIL updater-valid: script exited non-zero"; exit 1; }
{ grep -q -- '--self-check' "$UPD_TARGET" && ! grep -q 'OLD-UPDATER' "$UPD_TARGET"; } || { echo "FAIL updater-valid: new updater not adopted"; exit 1; }
echo "PASS updater-valid-adopted"

# --- broken-syntax new updater: bash -n fails -> whole update aborts atomically ---
printf '#!/usr/bin/env bash\nif [ ; then echo broken\n' > "$tmp/newupd_bad.sh"
make_updater_manifest "$tmp/newupd_bad.sh"; reset_updater
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
rm -f "$tmp/state/agent-update-state.json"
if bash "$SCRIPT"; then echo "FAIL updater-broken: should abort"; exit 1; fi
grep -q 'OLD-UPDATER' "$UPD_TARGET" || { echo "FAIL updater-broken: updater changed despite abort"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL updater-broken: agent swapped despite abort (not atomic)"; exit 1; }
grep -q 'verify' "$tmp/state/agent-update-state.json" || { echo "FAIL updater-broken: no verify error state"; exit 1; }
echo "PASS updater-broken-syntax-aborts"

# --- self-check-failing new updater: parses but --self-check exits 1 -> aborts atomically ---
cat > "$tmp/newupd_sc.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--self-check" ] && exit 1
exit 0
UEOF
make_updater_manifest "$tmp/newupd_sc.sh"; reset_updater
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
rm -f "$tmp/state/agent-update-state.json"
if bash "$SCRIPT"; then echo "FAIL updater-selfcheck: should abort"; exit 1; fi
grep -q 'OLD-UPDATER' "$UPD_TARGET" || { echo "FAIL updater-selfcheck: updater changed despite abort"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL updater-selfcheck: agent swapped despite abort"; exit 1; }
grep -q 'verify' "$tmp/state/agent-update-state.json" || { echo "FAIL updater-selfcheck: no verify error state"; exit 1; }
echo "PASS updater-selfcheck-fails-aborts"
```

- [ ] **Step 2: Run the tests to verify the gating tests fail**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: earlier blocks pass; the new gating blocks FAIL — with no verification, the broken/self-check-failing updaters are swapped in (or the update proceeds), so `FAIL updater-broken:` / `FAIL updater-selfcheck:` trips.

- [ ] **Step 3: Add the verify-phase gating in `deploy/kiosk-agent/update-kiosk.sh`**

In the verify loop, the current code is:
```bash
  if [ "$name" = "calvin_display_agent.py" ]; then
    "$PYTHON" -m py_compile "$STAGE/$name" || { write_state error verify "py_compile failed" "$version"; exit 1; }
  fi
  CHANGED_NAME+=("$name"); CHANGED_TARGET+=("$target"); CHANGED_MODE+=("$mode")
```
Insert the two checks between the `py_compile` `fi` and the `CHANGED_NAME+=(...)` line, so it reads:
```bash
  if [ "$name" = "calvin_display_agent.py" ]; then
    "$PYTHON" -m py_compile "$STAGE/$name" || { write_state error verify "py_compile failed" "$version"; exit 1; }
  fi
  case "$name" in
    *.sh) bash -n "$STAGE/$name" || { write_state error verify "syntax check failed: $name" "$version"; exit 1; } ;;
  esac
  if [ "$name" = "update-kiosk.sh" ]; then
    bash "$STAGE/update-kiosk.sh" --self-check || { write_state error verify "updater self-check failed" "$version"; exit 1; }
  fi
  CHANGED_NAME+=("$name"); CHANGED_TARGET+=("$target"); CHANGED_MODE+=("$mode")
```

- [ ] **Step 4: Fix the imprecise swap comment**

The current swap line:
```bash
  install -m "${CHANGED_MODE[$i]}" "$s" "$t"    # atomic replace + mode
```
Change the comment to describe the real behavior:
```bash
  install -m "${CHANGED_MODE[$i]}" "$s" "$t"    # replace via new inode (safe over a running script) + mode
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: every block passes — `PASS happy-path`, `PASS python-too-old`, `PASS rollback`, `PASS noop`, `PASS self-check-ok`, `PASS self-check-unreachable`, `PASS updater-valid-adopted`, `PASS updater-broken-syntax-aborts`, `PASS updater-selfcheck-fails-aborts`.

- [ ] **Step 6: Add the docs note to `docs/setup/KIOSK_PROVISIONING.md`**

Under the existing "Kiosk agent self-update" section (after the "Bundle source" / "Python version floor" subsections), add:
```markdown
### Updating the updater itself

`update-kiosk.sh` is part of the bundle, so it updates itself like any other file. Before a
new copy is adopted it is verified up front — `bash -n` for syntax and a read-only
`--self-check` run (which fetches and parses the manifest but changes nothing). If either
fails, the whole update aborts before anything is swapped and the current, known-good updater
stays installed. This is what makes it safe to evolve the updater remotely: a dead-on-arrival
updater is never installed. A new updater that starts cleanly but misbehaves only mid-apply is
not caught by this check; the durable no-retry guard (`agent-update-state.json`) prevents such
a version from re-triggering in a loop.
```

- [ ] **Step 7: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh docs/setup/KIOSK_PROVISIONING.md
git commit -m "feat(kiosk): verify a new updater (bash -n + self-check) before adopting it"
```

---

## Self-Review

**Spec coverage:** `--self-check` mode (Task 1) ✓; verify-phase `bash -n` for `*.sh` + updater `--self-check`, pre-swap abort-whole (Task 2 Step 3) ✓; `# atomic replace` comment fix (Task 2 Step 4) ✓; four test cases — valid adopted, broken-syntax aborts, self-check-failing aborts, `--self-check` contract incl. mutates-nothing (Task 1 + Task 2 tests) ✓; documented residual risk (Task 2 Step 6) ✓. Deferred items (enable/remove/bootstrap) are non-goals — no task, tracked as calvin-ixk/0ug/5ti. ✓

**Placeholder scan:** every step has complete bash; every run step has an expected result. No TBD/TODO. ✓

**Type/name consistency:** `--self-check` flag, `write_state error verify ... "$version"`, `$STAGE`/`$UPD_TARGET`/`make_updater_manifest`/`reset_updater`, env override names, and the `*.sh`/`update-kiosk.sh` name checks are used identically across both tasks and match the current script (`log`, `write_state`, `CHANGED_*`, `install -m`, `$CURL`/`$PYTHON`/`$BASE`). ✓
