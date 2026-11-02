# Kiosk updater path allowlist (calvin-a0c) + signing follow-up nits (calvin-9ks)

> **For agentic workers:** TDD each task — failing test first, then minimal code. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Harden the kiosk updater so remote-manifest data can only drive root writes/removals under a fixed prefix allowlist (calvin-a0c), and clear four cosmetic/diagnostic nits from the calvin-5vw final review (calvin-9ks).

**Architecture:** `update-kiosk.sh` currently writes each manifest file to its `target_path` as root, and `rm -f`s dropped receipt targets as root, trusting whatever path the backend returns. Add a client-side `path_allowed()` guard checked at two chokepoints: the manifest parse loop (fail-closed abort) and `decommission_drops` (skip-and-log). The allowlist derives from env-overridable dir vars so production is locked to `/usr/local/bin/` + `/etc/systemd/system/` while tests can retarget temp dirs.

**Tech Stack:** Pure bash + python3 (no jq) on the kiosk; Python stdlib on the backend; bash integration tests under `scripts/tests/`.

## Global Constraints

- Kiosk side stays **pure bash + python3 stdlib** — no new deps, no jq.
- Production allowlist prefixes are exactly `/usr/local/bin/` and `/etc/systemd/system/`.
- No behavior change when targets are already in-allowlist (all real bundle files are) — existing tests' semantics must still hold once retargeted.
- Backward compatible: no new required env var in production (`CALVIN_BIN_DIR` defaults to `/usr/local/bin`).

---

### Task 1: Path-prefix allowlist for root writes and decommission (calvin-a0c)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Produces: `path_allowed <abs-path>` → returns 0 iff the path contains no `..`
  and begins with `$BIN_DIR/` or `$SYSTEMD_DIR/`. `BIN_DIR="${CALVIN_BIN_DIR:-/usr/local/bin}"`.

**Design:**
- Define `BIN_DIR` next to `SYSTEMD_DIR` (the "dir vars" block near the top).
- `path_allowed()`:
  ```bash
  path_allowed() {  # $1 = absolute target path
    case "$1" in
      *..*) return 1 ;;                         # no traversal
      "$BIN_DIR"/*|"$SYSTEMD_DIR"/*) return 0 ;;
      *) return 1 ;;
    esac
  }
  ```
- Enforcement A (install, fail-closed): in the `while … read -r name sha mode target unit enable`
  loop, immediately after `[ -n "$name" ] || continue`, add:
  ```bash
  if ! path_allowed "$target"; then
    write_state error verify "target path not allowed: $target" "$version"
    log "target path not allowed: $target"; exit 1
  fi
  ```
  (`$version` is already set before the loop; `exit` inside a `<<<` here-string loop exits the script — matches the existing `exit 1`s in this loop.)
- Enforcement B (decommission, skip-and-log): at the top of the `for t in "${DROPPED_TARGETS[@]:-}"` body in `decommission_drops`, after `[ -n "$t" ] || continue`, add:
  ```bash
  if ! path_allowed "$t"; then
    log "refusing to decommission out-of-allowlist path: $t"; continue
  fi
  ```

**Test harness change:** existing blocks target `$tmp/local/*` and `$tmp/systemd/*`.
Export a global `CALVIN_BIN_DIR="$tmp/local"` alongside the other exports so those
targets are in-allowlist, and prepend `CALVIN_BIN_DIR="$tmp/boot_local"` to the two
`--bootstrap` invocations (whose bin targets live under `$tmp/boot_local`).

- [ ] **Step 1: Add the global `CALVIN_BIN_DIR` export + bootstrap overrides**, then run the suite to confirm all existing PASS lines still pass (proves the retargeting is correct before adding the guard).

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: every existing `PASS …` line prints; exit 0.

- [ ] **Step 2: Write the failing tests** — append two blocks after the signing block:

```bash
# ===== calvin-a0c: target-path allowlist =====
# --- install target outside the allowlist -> abort, nothing written ---
mkdir -p "$tmp/state_al1" "$tmp/evil"
EVIL_TARGET="$tmp/evil/pwned"
printf 'PWNED\n' > "$tmp/srv/pwned"
EVIL_SHA="$(sha256sum "$tmp/srv/pwned" | cut -d' ' -f1)"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"al10000000000000","min_python":"3.9","files":[
 {"name":"pwned","sha256":"$EVIL_SHA","mode":"0644",
  "target_path":"$EVIL_TARGET","restart_unit":"","enable":false}]}
EOF
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/pwned) cat "$tmp/srv/pwned"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
if CALVIN_AGENT_STATE_DIR="$tmp/state_al1" bash "$SCRIPT"; then echo "FAIL a0c-install: should abort on out-of-allowlist target"; exit 1; fi
[ ! -e "$EVIL_TARGET" ] || { echo "FAIL a0c-install: wrote out-of-allowlist target"; exit 1; }
grep -q 'not allowed' "$tmp/state_al1/agent-update-state.json" || { echo "FAIL a0c-install: no 'not allowed' state"; exit 1; }
echo "PASS a0c-install-target-rejected"

# --- traversal via .. under an allowed prefix -> also rejected ---
mkdir -p "$tmp/state_al1b"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"al1b000000000000","min_python":"3.9","files":[
 {"name":"pwned","sha256":"$EVIL_SHA","mode":"0644",
  "target_path":"$tmp/local/../evil/pwned2","restart_unit":"","enable":false}]}
EOF
if CALVIN_AGENT_STATE_DIR="$tmp/state_al1b" bash "$SCRIPT"; then echo "FAIL a0c-traversal: should abort on .. path"; exit 1; fi
[ ! -e "$tmp/evil/pwned2" ] || { echo "FAIL a0c-traversal: wrote traversal target"; exit 1; }
echo "PASS a0c-traversal-rejected"

# --- decommission target outside allowlist -> skipped, file kept ---
mkdir -p "$tmp/state_al2"
KEEP="$tmp/evil/keepme"; printf 'KEEP\n' > "$KEEP"
cat > "$tmp/state_al2/agent-manifest.json" <<EOF
{"version":"prevalt00000000","files":[
 {"name":"calvin_display_agent.py","target_path":"$tmp/local/calvin_display_agent.py","enable":false},
 {"name":"rogue","target_path":"$KEEP","enable":false}]}
EOF
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
AL2_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"al20000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$AL2_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service","enable":false}]}
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) & fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4
CALVIN_AGENT_STATE_DIR="$tmp/state_al2" bash "$SCRIPT" || { echo "FAIL a0c-decommission: exited non-zero"; exit 1; }
[ -f "$KEEP" ] || { echo "FAIL a0c-decommission: removed out-of-allowlist path"; exit 1; }
echo "PASS a0c-decommission-skipped"
```

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL at `a0c-install-target-rejected` (updater currently writes the evil target).

- [ ] **Step 3: Implement** `BIN_DIR`, `path_allowed()`, and the two enforcement points as above.

- [ ] **Step 4: Run tests** — `bash scripts/tests/test_update_kiosk.sh`; expected all PASS incl. the three new ones. Also `bash -n deploy/kiosk-agent/update-kiosk.sh`.

- [ ] **Step 5: Commit** — `feat(kiosk): restrict updater root writes + decommission to a path allowlist (calvin-a0c)`

---

### Task 2: calvin-5vw follow-up nits (calvin-9ks)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh` (self-check reason)
- Modify: `backend/app/services/kiosk_signing.py` (name path in corrupt-key error)
- Modify: `scripts/bake-kiosk-firstrun.sh` (usage)
- Modify: `scripts/setup-kiosk.sh` (usage)
- Test: `scripts/tests/test_bake_kiosk_firstrun_emit.sh` (anchor grep)
- Test: `backend/tests/unit/test_kiosk_signing.py` (corrupt-key error names path)

**Changes:**

1. **`--self-check` swallows the signature reason.** Replace the `>/dev/null` block:
   ```bash
   _sc_reason="$(verify_manifest_sig "$_m")" || {
     log "self-check: manifest ${_sc_reason:-signature verification failed}"; exit 1; }
   ```
   (mirrors the main path's `_sig_reason` capture; no test asserts the current silent form, so no test breaks — add none, it's diagnostic-only.)

2. **`kiosk_signing.load_or_create_key` corrupt-key error names the path.** Wrap the read:
   ```python
   except FileExistsError:
       raw = path.read_text().strip()
       try:
           return bytes.fromhex(raw)
       except ValueError as exc:
           raise ValueError(f"kiosk signing key at {path} is not valid hex") from exc
   ```
   - [ ] Failing test first in `test_kiosk_signing.py`:
     ```python
     def test_corrupt_key_file_names_path(tmp_path):
         p = tmp_path / "k.key"
         p.write_text("not-hex-zzzz")
         with pytest.raises(ValueError, match=str(p)):
             kiosk_signing.load_or_create_key(p)
     ```
   - Run: `uv run pytest backend/tests/unit/test_kiosk_signing.py -q` (from `backend/`) → FAIL, then PASS after the change.

3. **Add `--signing-key` / `--signing-key-file` to `usage()`** in `bake-kiosk-firstrun.sh`
   (both flags) and `--signing-key` to `usage()` in `setup-kiosk.sh`, describing them as the
   out-of-band 0600 manifest signing secret. Insert into the existing Options block; keep style.

4. **Anchor the bake-emit `chmod 600` grep** to the signing block in
   `test_bake_kiosk_firstrun_emit.sh` line ~41:
   ```bash
   echo "$out3" | grep -q 'chmod 600 "${SIGNING_ENV_FILE}"' || { echo "FAIL: signing file not chmod 600"; exit 1; }
   ```

- [ ] **Step 1: kiosk_signing failing test + fix** (item 2), run backend test → PASS.
- [ ] **Step 2: anchor bake-emit grep** (item 4), run `bash scripts/tests/test_bake_kiosk_firstrun_emit.sh` → PASS.
- [ ] **Step 3: self-check reason + both usage() blocks** (items 1, 3); `bash -n` the two shell scripts; run `bash scripts/tests/test_update_kiosk.sh` (self-check blocks still PASS).
- [ ] **Step 4: Commit** — `chore(kiosk): signing follow-up nits — self-check reason, keyfile error path, usage() + test anchor (calvin-9ks)`

---

## Self-Review notes
- a0c: fail-closed on install (before any download/write), skip-and-log on decommission — asymmetry is intentional (a hostile install target is an attack; a stale-receipt rogue path is already-past and non-destructive to refuse).
- No production env change required; `CALVIN_BIN_DIR` is test-only in practice.
- 9ks is cosmetic/diagnostic; only the corrupt-key path gets a new unit test (observable behavior); the self-check reason and usage text are not worth brittle assertions.
