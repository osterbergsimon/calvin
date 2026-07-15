# Kiosk Updater — Authoritative Install & Decommission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `update-kiosk.sh` the single authoritative manager of kiosk-side bundle state — first-boot install (`--bootstrap`), enabling brand-new units on update, and removing dropped files/units — so a kiosk is provisioned once and never touched again.

**Architecture:** One hardened apply path in `deploy/kiosk-agent/update-kiosk.sh` serves three modes (`--self-check`, `--bootstrap`, default update). A new `enable` manifest field marks boot-enabled units; a device receipt (`/var/lib/calvin/agent-manifest.json`) records the last-applied file set so drops can be detected. `setup-kiosk.sh` keeps host/OS concerns and delegates all bundle install to `--bootstrap`, deleting the duplicate `install_kiosk_bundle`.

**Tech Stack:** Pure `bash` + `python3` (no jq) for the updater/setup scripts; Python (FastAPI service module) for the manifest; shell test harnesses with mocked `curl`/`systemctl`.

## Global Constraints

- Updater is **pure bash + python3, no jq**. Python floor is **3.9** (manifest `min_python`, enforced by the existing precheck).
- **All state-file writes are atomic** (temp file + `os.replace` on the same filesystem): `agent-version.json`, `agent-update-state.json`, and the new `agent-manifest.json` receipt.
- **Version + receipt are seeded strictly last** — after any decommission — and **only on success**. This is the self-heal invariant: an interrupted update leaves the old version, so the backend re-fires and the checksum loop re-syncs.
- **New-unit enable/start and decommission run POST-health only** — never inside the rollback envelope. Rollback reverts changed files only.
- A **missing or unparseable receipt is treated as empty** (→ no drops → nothing decommissioned).
- A manifest file entry with **no `enable` key is treated as `enable=false`** (backward compatible with already-deployed updaters and existing test manifests).
- The **version hash is unchanged** (`name:sha256` only); adding `enable` must not perturb it.
- Bundle is served from the **local backend only**; the kiosk needs no internet and no git checkout.
- Test override env vars the updater already honors and MUST keep honoring: `CALVIN_CURL`, `CALVIN_SYSTEMCTL`, `CALVIN_PYTHON`, `CALVIN_AGENT_STATE_DIR`, `CALVIN_SYSTEMD_DIR`, `CALVIN_AGENT_READY_MARKER`, `CALVIN_KIOSK_ENV_FILE`, `CALVIN_UPDATE_HEALTH_TIMEOUT`.
- LAN-trust is accepted here (integrity via sha256, no authenticity); manifest signing is deferred to **calvin-5vw**. Do not add auth/signing in this plan.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `backend/app/services/kiosk_bundle.py` | Add `enable: bool` to `BundleFile` + manifest | T1 |
| `backend/tests/unit/test_kiosk_bundle.py` | Assert `enable` per file | T1 |
| `deploy/kiosk-agent/update-kiosk.sh` | Atomic writes + receipt, ixk, 0ug, `--bootstrap` | T2–T5 |
| `scripts/tests/test_update_kiosk.sh` | New test blocks for each updater behavior | T2–T5 |
| `scripts/setup-common.sh` | Add `bootstrap_kiosk`, delete `install_kiosk_bundle` | T6 |
| `scripts/setup-kiosk.sh` | Call `bootstrap_kiosk`; drop hardcoded enable list | T6 |
| `scripts/tests/test_setup_kiosk_bundle.sh` | Reframe to test the bootstrap shim | T6 |
| `docs/setup/KIOSK_PROVISIONING.md` | Document bootstrap/ixk/0ug + accepted risks | T7 |

## How to run the shell tests

```bash
bash scripts/tests/test_update_kiosk.sh        # updater behaviors
bash scripts/tests/test_setup_kiosk_bundle.sh  # setup bootstrap shim
```
Each prints `PASS <name>` per block and exits non-zero on the first failure.

## Backend tests

```bash
cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -v
```

---

### Task 1: Backend — `enable` field in the bundle manifest

**Files:**
- Modify: `backend/app/services/kiosk_bundle.py`
- Test: `backend/tests/unit/test_kiosk_bundle.py`

**Interfaces:**
- Produces: each manifest file dict gains `"enable": bool`. `True` only for `calvin-display-agent.service`, `calvin-kiosk-remote.service`, `calvin-x.service`; `False` for `calvin_display_agent.py`, `update-kiosk.sh`, `calvin-kiosk-update.service`. The version hash is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/unit/test_kiosk_bundle.py`:

```python
def test_manifest_enable_flags(tmp_path):
    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    enable = {f["name"]: f["enable"] for f in m["files"]}
    assert enable["calvin-display-agent.service"] is True
    assert enable["calvin-kiosk-remote.service"] is True
    assert enable["calvin-x.service"] is True
    assert enable["calvin_display_agent.py"] is False
    assert enable["update-kiosk.sh"] is False
    assert enable["calvin-kiosk-update.service"] is False


def test_enable_does_not_change_version(tmp_path):
    # The version hash must depend on file contents only, not the enable field.
    import hashlib

    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    blob = "\n".join(
        f"{f['name']}:{f['sha256']}"
        for f in sorted(m["files"], key=lambda f: f["name"])
    )
    assert m["version"] == hashlib.sha256(blob.encode()).hexdigest()[:16]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -k "enable" -v`
Expected: FAIL — `KeyError: 'enable'`.

- [ ] **Step 3: Add the field and emit it**

In `backend/app/services/kiosk_bundle.py`, add `enable: bool` to the dataclass:

```python
@dataclass(frozen=True)
class BundleFile:
    name: str
    repo_path: str
    target_path: str
    mode: str
    restart_unit: str | None
    enable: bool = False
```

Set `enable=True` on the three always-on service entries in `BUNDLE_FILES` by appending the keyword. For example the display-agent unit becomes:

```python
    BundleFile(
        "calvin-display-agent.service",
        "deploy/systemd/calvin-display-agent.service",
        "/etc/systemd/system/calvin-display-agent.service",
        "0644",
        "calvin-display-agent.service",
        enable=True,
    ),
```

Do the same (`enable=True`) for the `calvin-kiosk-remote.service` and `calvin-x.service` entries. Leave `calvin_display_agent.py`, `update-kiosk.sh`, and `calvin-kiosk-update.service` without the keyword (defaults to `False`).

Then emit it in `build_manifest()` — add one line inside the per-file dict:

```python
        files.append(
            {
                "name": bf.name,
                "sha256": _sha256(r / bf.repo_path),
                "mode": bf.mode,
                "target_path": bf.target_path,
                "restart_unit": bf.restart_unit,
                "enable": bf.enable,
            }
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -v`
Expected: PASS (all, including the pre-existing manifest/version tests).

- [ ] **Step 5: Confirm the OpenAPI snapshot is unaffected**

The `/kiosks/agent/manifest` route returns an untyped `dict`, so the response schema is generic. Verify no snapshot drift:

Run: `cd backend && uv run pytest -k openapi -q`
Expected: PASS with no snapshot update needed. (If it unexpectedly fails on drift, regenerate with `UPDATE_OPENAPI_SNAPSHOT=1 uv run pytest -k openapi` plus `npm run gen:api` in `frontend/`, and note it in the commit.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/kiosk_bundle.py backend/tests/unit/test_kiosk_bundle.py
git commit -m "feat(kiosk): add enable flag to bundle manifest (calvin-ixk)"
```

---

### Task 2: Updater — atomic state writes + device receipt

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Produces:
  - `RECEIPT_FILE="${STATE_DIR}/agent-manifest.json"`.
  - `write_state`, `write_version`, and `write_receipt` all write via a temp file + `os.replace` (no `.tmp` residue).
  - The `files_tsv` line gains a **6th TAB field `enable`** (`"1"` when truthy, else empty). The main read loop signature becomes `while IFS=$'\t' read -r name sha mode target unit enable`.
  - `ALL_NAMES` — a space-padded string of all manifest file names, for membership tests.
  - `read_receipt_tsv` — prints `name\ttarget_path\tenable` per receipt file; prints nothing if the receipt is missing/unparseable.
  - On every successful apply **and** the noop path, the receipt is written alongside the version, strictly last.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/test_update_kiosk.sh` (before the final line):

```bash
# --- receipt + atomic writes: receipt written on success; corrupt prior receipt tolerated;
#     no .tmp residue; all three state files are valid JSON ---
mkdir -p "$tmp/state_rcpt"
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
RCPT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"rcpt000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$RCPT_SHA","mode":"0755",
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
echo 'not json{' > "$tmp/state_rcpt/agent-manifest.json"          # corrupt prior receipt
CALVIN_AGENT_STATE_DIR="$tmp/state_rcpt" bash "$SCRIPT" || { echo "FAIL receipt: exited non-zero"; exit 1; }
python3 - "$tmp/state_rcpt/agent-manifest.json" <<'PY' || { echo "FAIL receipt: not written/invalid"; exit 1; }
import json, sys
m = json.load(open(sys.argv[1]))
assert m["version"] == "rcpt000000000000", m
assert {f["name"] for f in m["files"]} == {"calvin_display_agent.py"}, m
assert all("target_path" in f and "enable" in f for f in m["files"]), m
PY
[ -z "$(find "$tmp/state_rcpt" -name '*.tmp' -print -quit)" ] || { echo "FAIL receipt: left a .tmp file"; exit 1; }
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$tmp/state_rcpt/agent-version.json" || { echo "FAIL receipt: version json invalid"; exit 1; }
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$tmp/state_rcpt/agent-update-state.json" || { echo "FAIL receipt: state json invalid"; exit 1; }
echo "PASS receipt-and-atomic-writes"
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL at `receipt` — `agent-manifest.json` is still the corrupt seed (no receipt writer yet), so the `json.load` assert fails.

- [ ] **Step 3: Implement atomic writers, receipt, and the enable column**

In `deploy/kiosk-agent/update-kiosk.sh`:

1. Add near the other path vars (after `STATE_FILE=...`):

```bash
RECEIPT_FILE="${STATE_DIR}/agent-manifest.json"
```

2. Make `write_state` atomic:

```bash
write_state() {  # status phase message [version]
  mkdir -p "$STATE_DIR"
  "$PYTHON" - "$1" "$2" "$3" "${4:-}" "$STATE_FILE" <<'PY'
import json, os, sys
status, phase, message, version, path = sys.argv[1:6]
d = {"status": status, "phase": phase, "message": message}
if version:
    d["version"] = version
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(d, fh)
os.replace(tmp, path)
PY
}
```

3. Add `write_version`, `write_receipt`, and `read_receipt_tsv` near `write_state`:

```bash
write_version() {  # version
  "$PYTHON" - "$1" "$VERSION_FILE" <<'PY'
import json, os, sys
version, path = sys.argv[1:3]
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump({"version": version}, fh)
os.replace(tmp, path)
PY
}

write_receipt() {  # reads $manifest from the environment
  printf '%s' "$manifest" | "$PYTHON" - "$RECEIPT_FILE" <<'PY'
import json, os, sys
path = sys.argv[1]
m = json.load(sys.stdin)
files = [{"name": f["name"], "target_path": f["target_path"], "enable": bool(f.get("enable"))}
         for f in m["files"]]
out = {"version": m["version"], "files": files}
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(out, fh)
os.replace(tmp, path)
PY
}

read_receipt_tsv() {
  [ -f "$RECEIPT_FILE" ] || return 0
  "$PYTHON" - "$RECEIPT_FILE" <<'PY' 2>/dev/null || true
import json, sys
try:
    m = json.load(open(sys.argv[1]))
    for f in m.get("files", []):
        print("\t".join([f.get("name", ""), f.get("target_path", ""),
                         "1" if f.get("enable") else "0"]))
except Exception:
    pass
PY
}
```

4. Replace **both** existing raw version writes (the noop-path and final-success
`"$PYTHON" -c 'import json,sys;json.dump({"version":sys.argv[1]},open(sys.argv[2],"w"))' "$version" "$VERSION_FILE"`)
with `write_version "$version"` **followed by** `write_receipt` on the same line group:

```bash
  write_version "$version"
  write_receipt
```

5. Add the 6th `enable` field to the `files_tsv` generator:

```bash
files_tsv="$(printf '%s' "$manifest" | "$PYTHON" -c '
import sys, json
for f in json.load(sys.stdin)["files"]:
    print("\t".join([f["name"], f["sha256"], f["mode"], f["target_path"],
                     f.get("restart_unit") or "", "1" if f.get("enable") else ""]))')"
```

6. Build `ALL_NAMES` right after `version=...` is computed:

```bash
ALL_NAMES=" $(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(" ".join(f["name"] for f in json.load(sys.stdin)["files"]))') "
```

7. Change the main read loop signature to capture `enable`:

```bash
while IFS=$'\t' read -r name sha mode target unit enable; do
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all prior blocks PASS, plus `PASS receipt-and-atomic-writes`.

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk-updater): atomic state writes + device receipt (hardening #2, calvin-0ug groundwork)"
```

---

### Task 3: Updater — enable/start brand-new units on update (calvin-ixk)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Consumes: the `enable` column and `installed_sha` from Task 2.
- Produces:
  - `NEW_ENABLE_UNITS` — array of unit basenames that are **newly introduced this run** (their target did not exist before) **and** `enable=1` **and** live under `$SYSTEMD_DIR` ending `.service`.
  - After the loop those units are **removed from `RESTART_UNITS`** (post-filtered), so they are not restarted pre-health.
  - Helpers `enable_units` / `start_units`.
  - **Post-health only**, each `NEW_ENABLE_UNITS` entry is `systemctl enable`d then `systemctl start`ed; failures are logged non-fatally.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/test_update_kiosk.sh`:

```bash
# --- ixk: a brand-new enable:true unit is enabled + started post-health, not restarted ---
mkdir -p "$tmp/state_ixk"
NEWUNIT="$tmp/systemd/calvin-foo.service"
rm -f "$NEWUNIT"                                   # not installed before => "new"
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
IXK_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"   # agent changes => health runs
printf '[Unit]\nDescription=foo\n' > "$tmp/srv/calvin-foo.service"
IXK_UNIT_SHA="$(sha256sum "$tmp/srv/calvin-foo.service" | cut -d' ' -f1)"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"ixk0000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$IXK_AGENT_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service","enable":false},
 {"name":"calvin-foo.service","sha256":"$IXK_UNIT_SHA","mode":"0644",
  "target_path":"$NEWUNIT","restart_unit":"calvin-foo.service","enable":true}]}
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
  */agent/files/calvin-foo.service) cat "$tmp/srv/calvin-foo.service"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
rm -f "$tmp/systemctl.log"
CALVIN_AGENT_STATE_DIR="$tmp/state_ixk" bash "$SCRIPT" || { echo "FAIL ixk: exited non-zero"; exit 1; }
grep -q 'enable calvin-foo.service' "$tmp/systemctl.log" || { echo "FAIL ixk: new unit not enabled"; exit 1; }
grep -q 'start calvin-foo.service'  "$tmp/systemctl.log" || { echo "FAIL ixk: new unit not started"; exit 1; }
! grep -q 'restart calvin-foo.service' "$tmp/systemctl.log" || { echo "FAIL ixk: new unit should not be restarted"; exit 1; }
grep -q "\[Unit\]" "$NEWUNIT" || { echo "FAIL ixk: new unit file not installed"; exit 1; }
echo "PASS ixk-enable-new-unit"
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL at `ixk` — `enable calvin-foo.service` is absent (no enable logic yet).

- [ ] **Step 3: Implement new-unit detection + post-health enable/start**

In `update-kiosk.sh`:

1. Declare the array with the other `declare` lines:

```bash
declare -a NEW_ENABLE_UNITS=()
```

2. In the main loop, capture the pre-existing hash before the `continue`. Replace the single-line unchanged-skip with:

```bash
  old="$(installed_sha "$target")"
  if [ "$old" = "$sha" ]; then continue; fi   # unchanged
```

Then, after the existing `CHANGED_NAME+=(...)` / `RESTART_UNITS[...]=1` / `unit_changed` lines, add new-unit detection:

```bash
  if [ -z "$old" ] && [ "$enable" = "1" ]; then
    case "$target" in "$SYSTEMD_DIR"/*.service) NEW_ENABLE_UNITS+=("$(basename "$target")");; esac
  fi
```

3. After the loop (`done <<< "$files_tsv"`), post-filter the restart set:

```bash
for u in "${NEW_ENABLE_UNITS[@]:-}"; do [ -n "$u" ] && unset 'RESTART_UNITS[$u]'; done
```

4. Add helpers near `restart_all`:

```bash
enable_units() { for u in "$@"; do "$SYSTEMCTL" enable "$u" || log "enable failed: $u"; done; }
start_units()  { for u in "$@"; do "$SYSTEMCTL" start  "$u" || log "start failed: $u";  done; }
```

5. In the success path, **after** the health-check block (the `if [ "$agent_restarted" = 1 ]; then ... fi`) and **before** `write_version`, enable+start the new units:

```bash
if [ "${#NEW_ENABLE_UNITS[@]}" -gt 0 ]; then
  enable_units "${NEW_ENABLE_UNITS[@]}"
  start_units "${NEW_ENABLE_UNITS[@]}"
fi
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all prior blocks PASS, plus `PASS ixk-enable-new-unit`.

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk-updater): enable+start brand-new units on update (calvin-ixk)"
```

---

### Task 4: Updater — decommission dropped files/units (calvin-0ug)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Consumes: `read_receipt_tsv`, `ALL_NAMES`, `$SYSTEMD_DIR` from Task 2.
- Produces:
  - `DROPPED_TARGETS` — array of target paths present in the receipt but whose name is absent from `ALL_NAMES`.
  - The **noop guard** now also considers drops: a run is a noop only when there are no changed files **and** no drops.
  - `decommission_drops` — post-health, for each drop: if it is a unit (`$SYSTEMD_DIR/*.service`) `systemctl stop` + `disable`, then `rm -f` the target; one `daemon-reload` if any unit was removed. Runs **only after** the health check passes.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/test_update_kiosk.sh`:

```bash
# --- 0ug: a unit dropped from the manifest is decommissioned post-health ---
mkdir -p "$tmp/state_0ug"
DROP_UNIT="$tmp/systemd/calvin-old.service"
printf '[Unit]\nDescription=old\n' > "$DROP_UNIT"          # currently installed
cat > "$tmp/state_0ug/agent-manifest.json" <<EOF
{"version":"prev000000000000","files":[
 {"name":"calvin_display_agent.py","target_path":"$tmp/local/calvin_display_agent.py","enable":false},
 {"name":"calvin-old.service","target_path":"$DROP_UNIT","enable":true}]}
EOF
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
D_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"0ug0000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$D_AGENT_SHA","mode":"0755",
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
rm -f "$tmp/systemctl.log"
CALVIN_AGENT_STATE_DIR="$tmp/state_0ug" bash "$SCRIPT" || { echo "FAIL 0ug: exited non-zero"; exit 1; }
grep -q 'stop calvin-old.service'    "$tmp/systemctl.log" || { echo "FAIL 0ug: dropped unit not stopped"; exit 1; }
grep -q 'disable calvin-old.service' "$tmp/systemctl.log" || { echo "FAIL 0ug: dropped unit not disabled"; exit 1; }
[ ! -f "$DROP_UNIT" ] || { echo "FAIL 0ug: dropped unit file not removed"; exit 1; }
echo "PASS 0ug-decommission-dropped-unit"

# --- 0ug: an unhealthy update does NOT decommission ---
mkdir -p "$tmp/state_0ug2"
DROP_UNIT2="$tmp/systemd/calvin-old2.service"
printf '[Unit]\nDescription=old2\n' > "$DROP_UNIT2"
cat > "$tmp/state_0ug2/agent-manifest.json" <<EOF
{"version":"prev200000000000","files":[
 {"name":"calvin_display_agent.py","target_path":"$tmp/local/calvin_display_agent.py","enable":false},
 {"name":"calvin-old2.service","target_path":"$DROP_UNIT2","enable":true}]}
EOF
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
D2_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"0ug2000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$D2_AGENT_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service","enable":false}]}
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
[ "\$1" = "is-active" ] && exit 3    # never healthy => rollback path
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=2
rm -f "$tmp/systemctl.log"
if CALVIN_AGENT_STATE_DIR="$tmp/state_0ug2" bash "$SCRIPT"; then echo "FAIL 0ug2: should exit non-zero (rollback)"; exit 1; fi
[ -f "$DROP_UNIT2" ] || { echo "FAIL 0ug2: dropped unit removed despite unhealthy (decommission must be post-health)"; exit 1; }
! grep -q 'disable calvin-old2.service' "$tmp/systemctl.log" || { echo "FAIL 0ug2: disabled dropped unit despite unhealthy"; exit 1; }
echo "PASS 0ug-no-decommission-on-unhealthy"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL at `0ug` — the dropped unit is neither stopped/disabled nor removed.

- [ ] **Step 3: Implement drop detection + post-health decommission**

In `update-kiosk.sh`:

1. Declare the array with the others:

```bash
declare -a DROPPED_TARGETS=()
```

2. After `ALL_NAMES` is built and before the noop guard, compute drops from the receipt:

```bash
while IFS=$'\t' read -r rname rtarget renable; do
  [ -n "$rname" ] || continue
  case "$ALL_NAMES" in *" $rname "*) : ;; *) DROPPED_TARGETS+=("$rtarget") ;; esac
done < <(read_receipt_tsv)
```

3. Extend the noop guard to also require no drops. Change:

```bash
if [ "${#CHANGED_NAME[@]}" -eq 0 ]; then
```

to:

```bash
if [ "${#CHANGED_NAME[@]}" -eq 0 ] && [ "${#DROPPED_TARGETS[@]}" -eq 0 ]; then
```

4. Add the decommission helper near `restart_all`:

```bash
decommission_drops() {
  local removed_unit=0 t base
  for t in "${DROPPED_TARGETS[@]:-}"; do
    [ -n "$t" ] || continue
    case "$t" in
      "$SYSTEMD_DIR"/*.service)
        base="$(basename "$t")"
        "$SYSTEMCTL" stop "$base" 2>/dev/null || true
        "$SYSTEMCTL" disable "$base" 2>/dev/null || true
        removed_unit=1
        ;;
    esac
    rm -f "$t"
    log "decommissioned ${t}"
  done
  [ "$removed_unit" = 1 ] && "$SYSTEMCTL" daemon-reload || true
}
```

5. Call `decommission_drops` in the success path **after** the health check and **after** the new-unit enable/start (Task 3), **before** `write_version`:

```bash
if [ "${#DROPPED_TARGETS[@]}" -gt 0 ]; then
  decommission_drops
fi
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all prior blocks PASS, plus `PASS 0ug-decommission-dropped-unit` and `PASS 0ug-no-decommission-on-unhealthy`.

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk-updater): decommission dropped files/units post-health (calvin-0ug)"
```

---

### Task 5: Updater — `--bootstrap` mode (calvin-5ti)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Consumes: the full apply loop, `NEW_ENABLE_UNITS` (Task 3), `write_version`/`write_receipt` (Task 2), `enable_units` (Task 3).
- Produces: `update-kiosk.sh --bootstrap` — runs fetch/verify/swap, `daemon-reload`, `enable` every `enable:true` unit, seeds version + receipt, `write_state success bootstrap`, exit 0. **No restart, no health check, no rollback, no decommission.** A re-run with nothing changed is a `noop` that still seeds version + receipt.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/test_update_kiosk.sh`:

```bash
# --- 5ti: --bootstrap installs fresh, enables units, no restart/health, idempotent ---
mkdir -p "$tmp/state_boot" "$tmp/boot_local" "$tmp/boot_systemd"
BOOT_AGENT="$tmp/boot_local/calvin_display_agent.py"
BOOT_UNIT="$tmp/boot_systemd/calvin-display-agent.service"
rm -f "$BOOT_AGENT" "$BOOT_UNIT"                       # nothing installed yet
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
B_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
printf '[Unit]\nDescription=agent\n' > "$tmp/srv/calvin-display-agent.service"
B_UNIT_SHA="$(sha256sum "$tmp/srv/calvin-display-agent.service" | cut -d' ' -f1)"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"boot000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$B_AGENT_SHA","mode":"0755",
  "target_path":"$BOOT_AGENT","restart_unit":"calvin-display-agent.service","enable":false},
 {"name":"calvin-display-agent.service","sha256":"$B_UNIT_SHA","mode":"0644",
  "target_path":"$BOOT_UNIT","restart_unit":"calvin-display-agent.service","enable":true}]}
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
  */agent/files/calvin-display-agent.service) cat "$tmp/srv/calvin-display-agent.service"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"
rm -f "$tmp/systemctl.log"
CALVIN_AGENT_STATE_DIR="$tmp/state_boot" CALVIN_SYSTEMD_DIR="$tmp/boot_systemd" bash "$SCRIPT" --bootstrap \
  || { echo "FAIL bootstrap: exited non-zero"; exit 1; }
grep -q 'sys.exit(0)' "$BOOT_AGENT" || { echo "FAIL bootstrap: agent not installed"; exit 1; }
grep -q "\[Unit\]" "$BOOT_UNIT"      || { echo "FAIL bootstrap: unit not installed"; exit 1; }
grep -q 'enable calvin-display-agent.service' "$tmp/systemctl.log" || { echo "FAIL bootstrap: unit not enabled"; exit 1; }
! grep -q 'restart' "$tmp/systemctl.log" || { echo "FAIL bootstrap: must not restart during bootstrap"; exit 1; }
! grep -q 'is-active' "$tmp/systemctl.log" || { echo "FAIL bootstrap: must not health-check during bootstrap"; exit 1; }
grep -q 'boot000000000000' "$tmp/state_boot/agent-version.json"  || { echo "FAIL bootstrap: version not seeded"; exit 1; }
grep -q 'boot000000000000' "$tmp/state_boot/agent-manifest.json" || { echo "FAIL bootstrap: receipt not seeded"; exit 1; }
grep -q 'bootstrap' "$tmp/state_boot/agent-update-state.json" || { echo "FAIL bootstrap: state not bootstrap"; exit 1; }
# Idempotent: a second bootstrap changes nothing.
rm -f "$tmp/systemctl.log"
CALVIN_AGENT_STATE_DIR="$tmp/state_boot" CALVIN_SYSTEMD_DIR="$tmp/boot_systemd" bash "$SCRIPT" --bootstrap \
  || { echo "FAIL bootstrap-idempotent: exited non-zero"; exit 1; }
grep -q 'noop\|success' "$tmp/state_boot/agent-update-state.json" || { echo "FAIL bootstrap-idempotent: not noop/success"; exit 1; }
echo "PASS bootstrap-install-and-idempotent"
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL at `bootstrap` — `--bootstrap` is an unknown arg today; the script runs a normal update (restart/health), so the `! restart` / `enable` assertions fail.

- [ ] **Step 3: Implement `--bootstrap`**

In `update-kiosk.sh`:

1. Set a mode flag right after the `--self-check` block (near the top, before `mkdir -p "$STATE_DIR"`):

```bash
BOOTSTRAP=0
if [ "${1:-}" = "--bootstrap" ]; then BOOTSTRAP=1; fi
```

2. Branch **after** the swap + `daemon-reload` and **before** `restart_all`. Locate the line
`[ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true` and insert the bootstrap
short-circuit immediately after it (before `restart_all` / the `restart_all` helper call):

```bash
if [ "$BOOTSTRAP" = 1 ]; then
  # First-boot install: enable boot units; no restart, health, rollback, or decommission.
  if [ "${#NEW_ENABLE_UNITS[@]}" -gt 0 ]; then
    enable_units "${NEW_ENABLE_UNITS[@]}"
  fi
  write_version "$version"
  write_receipt
  write_state success bootstrap "installed ${version}" "$version"
  log "bootstrap: installed ${version}"
  exit 0
fi
```

At bootstrap every `enable:true` unit is newly introduced (nothing installed), so
`NEW_ENABLE_UNITS` already holds exactly the units to enable. The `noop` guard already covers
the idempotent re-run (no changed files, no drops → seeds version + receipt, exits 0).

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all prior blocks PASS, plus `PASS bootstrap-install-and-idempotent`.

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk-updater): --bootstrap install mode (calvin-5ti)"
```

---

### Task 6: Setup — `bootstrap_kiosk` shim; delete `install_kiosk_bundle`

**Files:**
- Modify: `scripts/setup-common.sh` (add `bootstrap_kiosk`, delete `install_kiosk_bundle`)
- Modify: `scripts/setup-kiosk.sh` (call `bootstrap_kiosk`; drop hardcoded enable list)
- Test: `scripts/tests/test_setup_kiosk_bundle.sh` (reframe)

**Interfaces:**
- Consumes: `update-kiosk.sh --bootstrap` (Task 5), served from the backend bundle.
- Produces: `bootstrap_kiosk <backend_url>` — fetches the manifest, extracts `update-kiosk.sh`'s sha, fetches that one file, **verifies its sha against the manifest**, and runs `bash <tmp> --bootstrap` with `CALVIN_BACKEND_URL` set. `install_kiosk_bundle` no longer exists.

- [ ] **Step 1: Rewrite the test to drive the shim**

Replace the entire body of `scripts/tests/test_setup_kiosk_bundle.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
export MARKER="$tmp/bootstrapped"

# Stub updater the shim will fetch + run. On --bootstrap it records the backend url.
cat > "$tmp/updater.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--bootstrap" ] && { echo "BOOTSTRAPPED $CALVIN_BACKEND_URL" > "$MARKER"; exit 0; }
exit 1
UEOF
UPD_SHA="$(sha256sum "$tmp/updater.sh" | cut -d' ' -f1)"
cat > "$tmp/manifest.json" <<EOF
{"version":"setup00000000000","min_python":"3.9","files":[
 {"name":"update-kiosk.sh","sha256":"${UPD_SHA}","mode":"0755","target_path":"/usr/local/bin/update-kiosk.sh","restart_unit":"","enable":false}]}
EOF
sed 's/'"${UPD_SHA}"'/0000000000000000000000000000000000000000000000000000000000000000/' \
    "$tmp/manifest.json" > "$tmp/manifest-bad.json"

cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
outfile=""; url=""
args=("\$@"); i=0
while [ \$i -lt \${#args[@]} ]; do
  case "\${args[\$i]}" in
    -o) i=\$((i+1)); outfile="\${args[\$i]}";;
    http*) url="\${args[\$i]}";;
  esac; i=\$((i+1))
done
body=""
case "\$url" in
  */agent/manifest) body="\$(cat "\${MOCK_MANIFEST}")";;
  */agent/files/update-kiosk.sh) body="\$(cat "$tmp/updater.sh")";;
  *) exit 22;;
esac
if [ -n "\$outfile" ]; then printf '%s' "\$body" > "\$outfile"; else printf '%s' "\$body"; fi
CEOF
chmod +x "$tmp/bin/curl"; export PATH="$tmp/bin:$PATH"

# shellcheck disable=SC1090
. "$here/../setup-common.sh"

# --- Happy path: shim fetches + verifies + runs --bootstrap ---
export MOCK_MANIFEST="$tmp/manifest.json"
bootstrap_kiosk "http://server.local:8000"
grep -q 'BOOTSTRAPPED http://server.local:8000' "$MARKER" || { echo "FAIL: --bootstrap not invoked with backend url"; exit 1; }
echo "PASS bootstrap-shim-runs-updater"

# --- Negative: wrong updater sha in manifest aborts before running it ---
rm -f "$MARKER"
if ( export MOCK_MANIFEST="$tmp/manifest-bad.json"
     . "$here/../setup-common.sh"
     bootstrap_kiosk "http://server.local:8000" ) 2>/dev/null; then
  echo "FAIL: bootstrap_kiosk should reject a bad updater checksum"; exit 1
fi
[ ! -f "$MARKER" ] || { echo "FAIL: updater ran despite checksum mismatch"; exit 1; }
echo "PASS bootstrap-shim-rejects-bad-sha"
```

Note: the mock `curl` here writes the fetched updater with `printf '%s'` (no trailing newline), so the served bytes exactly match `sha256sum "$tmp/updater.sh"` only if that file has no trailing newline either — the heredoc above ends the file with a newline, so the sha is computed over those exact bytes. The mock therefore serves the file verbatim via `cat`, preserving the newline; the happy-path sha matches. (Do not "optimize" the mock to strip newlines.)

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh`
Expected: FAIL — `bootstrap_kiosk: command not found`.

- [ ] **Step 3: Add `bootstrap_kiosk`, delete `install_kiosk_bundle`**

In `scripts/setup-common.sh`, delete the entire `install_kiosk_bundle() { ... }` function (the last function in the file) and replace it with:

```bash
# Fetch the updater from the local backend, verify it against the manifest, and
# run it in --bootstrap mode to install the whole bundle (agent, units, updater,
# version, receipt). The updater is the single authoritative install path.
bootstrap_kiosk() {
    local backend_url="${1%/}"
    local manifest sha tmp got
    manifest="$(curl -fsSL "${backend_url}/api/kiosks/agent/manifest")" \
        || error_exit "Failed to fetch kiosk bundle manifest from ${backend_url}" 1
    sha="$(printf '%s' "$manifest" | python3 -c 'import sys, json
m = json.load(sys.stdin)
print(next((f["sha256"] for f in m["files"] if f["name"] == "update-kiosk.sh"), ""))')"
    [ -n "$sha" ] || error_exit "manifest has no update-kiosk.sh entry" 1
    tmp="$(mktemp)"
    curl -fsSL "${backend_url}/api/kiosks/agent/files/update-kiosk.sh" -o "$tmp" \
        || error_exit "Failed to fetch update-kiosk.sh" 1
    got="$(sha256sum "$tmp" | cut -d' ' -f1)"
    [ "$got" = "$sha" ] || error_exit "update-kiosk.sh failed checksum verification" 1
    chmod +x "$tmp"
    CALVIN_BACKEND_URL="$backend_url" bash "$tmp" --bootstrap \
        || error_exit "kiosk bootstrap (update-kiosk.sh --bootstrap) failed" 1
    rm -f "$tmp"
}
```

- [ ] **Step 4: Rewire `setup-kiosk.sh`**

In `scripts/setup-kiosk.sh`:

Change the install lines in `main()` from:

```bash
    log "Installing kiosk bundle (agent + units + updater) from ${BACKEND_URL}..."
    install_kiosk_bundle "${BACKEND_URL}" "${CALVIN_USER}"
```

to:

```bash
    log "Bootstrapping kiosk bundle via update-kiosk.sh --bootstrap from ${BACKEND_URL}..."
    bootstrap_kiosk "${BACKEND_URL}"
```

The updater now enables the boot units during `--bootstrap`, so drop the hardcoded `enable`
calls. Change `install_kiosk_services` to only reload:

```bash
install_kiosk_services() {
    log "Reloading systemd (units enabled by --bootstrap)..."
    if systemd_available; then
        systemctl daemon-reload
    else
        log_warn "systemd is not running; skipped daemon-reload"
    fi
}
```

Leave `start_kiosk_services` unchanged (it still starts the three services for the immediate,
manual-operator "up now" experience; on reboot they come up because bootstrap enabled them).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh`
Expected: `PASS bootstrap-shim-runs-updater` and `PASS bootstrap-shim-rejects-bad-sha`.

Confirm no other script references the deleted function:

Run: `grep -rn "install_kiosk_bundle" scripts/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-common.sh scripts/setup-kiosk.sh scripts/tests/test_setup_kiosk_bundle.sh
git commit -m "feat(setup): bootstrap kiosk via update-kiosk.sh --bootstrap; drop install_kiosk_bundle (calvin-5ti)"
```

---

### Task 7: Docs — provisioning guide

**Files:**
- Modify: `docs/setup/KIOSK_PROVISIONING.md`

**Interfaces:**
- Consumes: behavior finalized in Tasks 1–6.

- [ ] **Step 1: Update the Initial install subsection**

In `docs/setup/KIOSK_PROVISIONING.md`, replace the "Initial install" subsection body with:

```markdown
### Initial install

`setup-kiosk.sh` calls `bootstrap_kiosk` (in `scripts/setup-common.sh`), which fetches
`update-kiosk.sh` from the backend, verifies it against the manifest, and runs it with
`--bootstrap`. `--bootstrap` installs the whole bundle (agent, units, updater), enables the
boot units, and seeds both `/var/lib/calvin/agent-version.json` and the device receipt
`/var/lib/calvin/agent-manifest.json`. It performs no restart, health check, or rollback —
first boot has nothing running and reboots afterward. The updater is now the single install
path; there is no separate bundle-install routine.
```

- [ ] **Step 2: Add the new-behavior + self-heal + trust subsections**

Add after the "Updating the updater itself" subsection:

```markdown
### New units and removed components

The updater is authoritative over kiosk-side bundle state. When a bundle release adds a new
always-on service (a unit marked `enable` in the manifest), the update enables and starts it
after the agent health check passes. When a release drops a file or unit, the updater compares
the manifest against the device receipt (`agent-manifest.json`) and, again only after the agent
is confirmed healthy, stops + disables the unit and removes the file. Both actions happen only
post-health, so an unhealthy update rolls back the changed agent files and reconciles nothing.

### Interrupted updates self-heal

The version file and receipt are written last, only on success. If power is lost mid-update the
version is not advanced, so the backend still sees the old version, the update stays pending, and
the next poll re-runs the updater; the checksum loop re-syncs any half-written file. Combined
with the durable no-retry guard (`agent-update-state.json`), a kiosk cannot get stuck in a
half-updated state.

### Trust model (accepted risk)

The updater verifies file **integrity** (sha256 from the manifest) but not **authenticity**: the
manifest and files come from the same plain-HTTP backend over the LAN, and the updater runs as
root. A LAN attacker who can MITM the backend could serve matching-sha malicious files. This is
the existing LAN-trust posture (same as `/api/config`) and is acceptable on a trusted home
network. Closing it — signed manifests pinned to a key baked at provisioning, so there is no
trust-on-first-use window — is tracked as **calvin-5vw**. The bundle version is a content hash
(a change marker, not a monotonic counter), so there is no anti-rollback protection: a server
rolled back to an older bundle will be adopted.
```

- [ ] **Step 3: Verify the additions landed**

Run: `grep -n "agent-manifest.json\|--bootstrap\|calvin-5vw\|self-heal" docs/setup/KIOSK_PROVISIONING.md`
Expected: matches present for `agent-manifest.json`, `--bootstrap`, and `calvin-5vw`.

- [ ] **Step 4: Commit**

```bash
git add docs/setup/KIOSK_PROVISIONING.md
git commit -m "docs(kiosk): document --bootstrap, ixk/0ug, self-heal, and LAN-trust risk"
```

---

## Final verification (after all tasks)

```bash
bash scripts/tests/test_update_kiosk.sh          # every updater block PASSes
bash scripts/tests/test_setup_kiosk_bundle.sh    # bootstrap shim PASSes
cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -v
```

Then run the repo's lint/format gates for touched backend files:

```bash
uvx ruff@0.14.11 check backend/ && uvx ruff@0.14.11 format --check backend/
```
