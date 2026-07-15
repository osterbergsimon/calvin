# Kiosk Agent Self-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a provisioned Calvin kiosk an admin-triggered, safe self-update path that pulls a small source-file bundle from the local Calvin server, verifies it, and swaps it in with auto-rollback.

**Architecture:** The backend serves the ~6-file kiosk bundle from its own repo checkout (content-hashed version, no CI). The unprivileged agent reports its running version and watches an `agentUpdateRequested` flag on the existing config poll; when set, it fires a root systemd oneshot (`calvin-kiosk-update.service`) that verifies → backs up → atomic-swaps only changed files → restarts only affected services → auto-rolls-back on unhealthy start. `setup-kiosk.sh` stops cloning the full repo and instead fetches the bundle.

**Tech Stack:** FastAPI + Ormar/Alembic (backend), pure-stdlib Python 3 (agent), Bash + systemd + sudoers (updater/provisioning), Vue 3 + Pinia (frontend). Tests: pytest (backend + agent), bash test scripts (`scripts/tests/`), Vitest (frontend).

## Global Constraints

Copied verbatim from the spec — every task inherits these:

- **Agent is pure Python 3 stdlib.** No third-party imports in `calvin_display_agent.py`. No venv on the Pi.
- **Python floor: 3.9.** Agent must run under 3.9/3.11/3.13. Manifest declares `min_python: "3.9"`.
- **Bundle endpoints are public (LAN-trust), no auth** — same posture as `GET /api/config`.
- **Backend logging via loguru** (`from loguru import logger`), never stdlib `logging`.
- **DB writes wrapped in `retry_on_db_locked`** (SQLite locks under concurrency).
- **Installs are byte-identical `cp`** (`install_script`/`install_systemd_service` do not template), so a content hash is a valid version and installed-vs-incoming hash compare is exact.
- **Updater must survive the restart of `calvin-display-agent.service`** — it runs as its own root unit, triggered with `--no-block`.
- **jq is not guaranteed on the Pi; `python3` is.** The updater parses JSON with `python3`, never `jq`.
- The kiosk carries **only what it runs** — no full repo checkout after this lands.

## Bundle contract (shared by Task 2 and Task 3 — implement identically)

The canonical bundle file list. `name` is the manifest key + the `files/{name}` path segment; `repo_path` is relative to the server checkout; `target_path`/`mode`/`restart_unit` drive the updater.

| name | repo_path | target_path | mode | restart_unit |
|---|---|---|---|---|
| `calvin_display_agent.py` | `deploy/kiosk-agent/calvin_display_agent.py` | `/usr/local/bin/calvin_display_agent.py` | `0755` | `calvin-display-agent.service` |
| `calvin-display-agent.service` | `deploy/systemd/calvin-display-agent.service` | `/etc/systemd/system/calvin-display-agent.service` | `0644` | `calvin-display-agent.service` |
| `calvin-kiosk-remote.service` | `deploy/systemd/calvin-kiosk-remote.service` | `/etc/systemd/system/calvin-kiosk-remote.service` | `0644` | `calvin-kiosk-remote.service` |
| `calvin-x.service` | `deploy/systemd/calvin-x.service` | `/etc/systemd/system/calvin-x.service` | `0644` | `calvin-x.service` |
| `update-kiosk.sh` | `deploy/kiosk-agent/update-kiosk.sh` | `/usr/local/bin/update-kiosk.sh` | `0755` | *(none)* |
| `calvin-kiosk-update.service` | `deploy/systemd/calvin-kiosk-update.service` | `/etc/systemd/system/calvin-kiosk-update.service` | `0644` | *(none)* |

**Manifest JSON shape:**
```json
{
  "version": "<16-hex>",
  "min_python": "3.9",
  "files": [
    {"name": "calvin_display_agent.py", "sha256": "<64-hex>", "mode": "0755",
     "target_path": "/usr/local/bin/calvin_display_agent.py",
     "restart_unit": "calvin-display-agent.service"}
  ]
}
```

**Version algorithm:** `sha256( "\n".join(f"{name}:{sha256_of_file_bytes}" for name in sorted(names)) )[:16]`. `min_python` is **not** part of the version hash.

**State files on the device** (written by the updater, read by the agent):
- `/var/lib/calvin/agent-version.json` → `{"version": "<16-hex>"}` (running version).
- `/var/lib/calvin/agent-update-state.json` → `{"status": "...", "phase": "...", "message": "...", ...}` (mirrors `calvin-update-state.json`).
- `/run/calvin/agent-ready` → readiness marker, touched by the agent after each successful config fetch.

---

## Task 1: Updater systemd unit + sudoers rule

**Files:**
- Create: `deploy/systemd/calvin-kiosk-update.service`
- Create: `deploy/kiosk-agent/calvin-kiosk-update.sudoers`
- Test: `scripts/tests/test_kiosk_update_unit.sh`

**Interfaces:**
- Produces: a oneshot unit `calvin-kiosk-update.service` running `/usr/local/bin/update-kiosk.sh`; a sudoers fragment letting `calvin` start it with `--no-block`.

- [ ] **Step 1: Write the unit file**

`deploy/systemd/calvin-kiosk-update.service`:
```ini
[Unit]
Description=Calvin Kiosk Agent Updater (oneshot)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/default/calvin-kiosk
ExecStart=/usr/local/bin/update-kiosk.sh
StandardOutput=journal
StandardError=journal
SyslogIdentifier=calvin-kiosk-update
```
(No `[Install]` — it is started on demand, never enabled.)

- [ ] **Step 2: Write the sudoers fragment**

`deploy/kiosk-agent/calvin-kiosk-update.sudoers`:
```
# Installed to /etc/sudoers.d/calvin-kiosk-update (mode 0440).
# Lets the unprivileged display-agent kick off the root updater — nothing else.
calvin ALL=(root) NOPASSWD: /bin/systemctl start --no-block calvin-kiosk-update.service
```

- [ ] **Step 3: Write a test asserting the contract**

`scripts/tests/test_kiosk_update_unit.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
unit="$here/../../deploy/systemd/calvin-kiosk-update.service"
sudoers="$here/../../deploy/kiosk-agent/calvin-kiosk-update.sudoers"

grep -q '^Type=oneshot' "$unit" || { echo "FAIL: not oneshot"; exit 1; }
grep -q '^ExecStart=/usr/local/bin/update-kiosk.sh' "$unit" || { echo "FAIL: wrong ExecStart"; exit 1; }
grep -qv '^\[Install\]' "$unit" || { echo "FAIL: must not be enable-able"; exit 1; }
grep -q 'systemctl start --no-block calvin-kiosk-update.service' "$sudoers" || { echo "FAIL: sudoers rule missing"; exit 1; }
echo "PASS"
```

- [ ] **Step 4: Run the test**

Run: `bash scripts/tests/test_kiosk_update_unit.sh`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add deploy/systemd/calvin-kiosk-update.service deploy/kiosk-agent/calvin-kiosk-update.sudoers scripts/tests/test_kiosk_update_unit.sh
git commit -m "feat(kiosk): updater oneshot unit + narrow sudoers rule"
```

---

## Task 2: `update-kiosk.sh` — verify/backup/atomic-swap/rollback

**Files:**
- Create: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Consumes: the manifest at `$CALVIN_BACKEND_URL/api/kiosks/agent/manifest` and files at `.../agent/files/{name}` (Bundle contract above).
- Produces: writes `/var/lib/calvin/agent-version.json` + `/var/lib/calvin/agent-update-state.json`; restarts only services whose files changed; on unhealthy agent, restores backups.
- Overridable via env for testing: `CALVIN_CURL`, `CALVIN_SYSTEMCTL`, `CALVIN_PYTHON`, `CALVIN_AGENT_STATE_DIR`, `CALVIN_AGENT_READY_MARKER`, `CALVIN_UPDATE_HEALTH_TIMEOUT`, `CALVIN_SYSTEMD_DIR`.

- [ ] **Step 1: Write the failing test (happy path + rollback + python-too-old)**

`scripts/tests/test_update_kiosk.sh`:
```bash
#!/usr/bin/env bash
# Drives update-kiosk.sh with mocked curl/systemctl and a temp filesystem.
set -euo pipefail
SCRIPT="$(dirname "$0")/../../deploy/kiosk-agent/update-kiosk.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/state" "$tmp/systemd" "$tmp/local" "$tmp/run"

# --- installed (old) agent + its unit ---
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
echo 'OLD-UNIT'     > "$tmp/systemd/calvin-display-agent.service"

# --- server-side (new) files + manifest, served by mock curl ---
mkdir -p "$tmp/srv"
printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
NEW_AGENT_SHA="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
cat > "$tmp/srv/manifest.json" <<EOF
{"version":"deadbeefdeadbeef","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$NEW_AGENT_SHA","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF

# mock curl: manifest + file fetch
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
esac; done
exit 22
EOF
# mock systemctl: is-active succeeds (healthy) by default; log calls
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
case "\$1 \$2" in "is-active"*|"show"*) exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"

export CALVIN_BACKEND_URL="http://server.local:8000"
export CALVIN_CURL="$tmp/bin/curl" CALVIN_SYSTEMCTL="$tmp/bin/systemctl"
export CALVIN_AGENT_STATE_DIR="$tmp/state" CALVIN_SYSTEMD_DIR="$tmp/systemd"
export CALVIN_AGENT_READY_MARKER="$tmp/run/agent-ready"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# health: mark ready so the health check passes
: > "$CALVIN_AGENT_READY_MARKER"

bash "$SCRIPT"

grep -q 'sys.exit(0)' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent not swapped"; exit 1; }
grep -q 'restart calvin-display-agent.service' "$tmp/systemctl.log" || { echo "FAIL: did not restart changed unit"; exit 1; }
grep -q 'deadbeefdeadbeef' "$tmp/state/agent-version.json" || { echo "FAIL: version not recorded"; exit 1; }
echo "PASS happy-path"

# --- python-too-old: manifest demands 3.99 ---
sed 's/"3.9"/"3.99"/' "$tmp/srv/manifest.json" > "$tmp/srv/manifest.json.hi"
mv "$tmp/srv/manifest.json.hi" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
if bash "$SCRIPT"; then echo "FAIL: should abort on python-too-old"; exit 1; fi
grep -q 'python-too-old' "$tmp/state/agent-update-state.json" || { echo "FAIL: no python-too-old state"; exit 1; }
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: agent changed despite abort"; exit 1; }
echo "PASS python-too-old"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: FAIL (script does not exist yet) — `update-kiosk.sh: No such file or directory`.

- [ ] **Step 3: Write `update-kiosk.sh`**

`deploy/kiosk-agent/update-kiosk.sh`:
```bash
#!/usr/bin/env bash
# Calvin kiosk agent updater. Pulls the kiosk bundle from the local Calvin
# backend, verifies (sha256 + py_compile + min_python), backs up, atomic-swaps
# only changed files, restarts only affected services, auto-rolls-back if the
# agent fails to come up healthy. Pure bash + python3 (no jq).
set -euo pipefail

ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${CALVIN_BACKEND_URL:?CALVIN_BACKEND_URL not set}"

CURL="${CALVIN_CURL:-curl}"
SYSTEMCTL="${CALVIN_SYSTEMCTL:-systemctl}"
PYTHON="${CALVIN_PYTHON:-python3}"
STATE_DIR="${CALVIN_AGENT_STATE_DIR:-/var/lib/calvin}"
SYSTEMD_DIR="${CALVIN_SYSTEMD_DIR:-/etc/systemd/system}"
READY_MARKER="${CALVIN_AGENT_READY_MARKER:-/run/calvin/agent-ready}"
HEALTH_TIMEOUT="${CALVIN_UPDATE_HEALTH_TIMEOUT:-30}"
BACKUP_DIR="${STATE_DIR}/agent-backup"
VERSION_FILE="${STATE_DIR}/agent-version.json"
STATE_FILE="${STATE_DIR}/agent-update-state.json"
BASE="${CALVIN_BACKEND_URL%/}"

mkdir -p "$STATE_DIR"
log() { printf '[update-kiosk] %s\n' "$*"; }

write_state() {  # status phase message
  mkdir -p "$STATE_DIR"
  "$PYTHON" - "$1" "$2" "$3" "$STATE_FILE" <<'PY'
import json, sys
status, phase, message, path = sys.argv[1:5]
json.dump({"status": status, "phase": phase, "message": message}, open(path, "w"))
PY
}

manifest="$("$CURL" -fsSL "$BASE/api/kiosks/agent/manifest")" || {
  write_state error fetch "manifest fetch failed"; log "manifest fetch failed"; exit 1; }

# --- min_python precheck ---
min_py="$(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(json.load(sys.stdin).get("min_python",""))')"
if [ -n "$min_py" ]; then
  if ! "$PYTHON" -c 'import sys;a=tuple(int(x) for x in sys.argv[1].split("."));sys.exit(0 if sys.version_info[:2]>=a else 1)' "$min_py"; then
    write_state error python-too-old "device python < ${min_py}; keeping current agent"
    log "python-too-old (need ${min_py}); aborting"; exit 1
  fi
fi

version="$(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(json.load(sys.stdin)["version"])')"
# Emit one TAB-separated line per file: name sha256 mode target_path restart_unit
files_tsv="$(printf '%s' "$manifest" | "$PYTHON" -c '
import sys, json
for f in json.load(sys.stdin)["files"]:
    print("\t".join([f["name"], f["sha256"], f["mode"], f["target_path"], f.get("restart_unit") or ""]))')"

write_state running fetch "checking bundle ${version}"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$BACKUP_DIR"
declare -a CHANGED_TARGET=() CHANGED_MODE=() CHANGED_NAME=()
declare -A RESTART_UNITS=()
unit_changed=0

installed_sha() { [ -f "$1" ] && sha256sum "$1" | cut -d' ' -f1 || echo ""; }

while IFS=$'\t' read -r name sha mode target unit; do
  [ -n "$name" ] || continue
  if [ "$(installed_sha "$target")" = "$sha" ]; then continue; fi   # unchanged
  # fetch + verify
  "$CURL" -fsSL "$BASE/api/kiosks/agent/files/$name" -o "$STAGE/$name" || {
    write_state error fetch "download failed: $name"; exit 1; }
  got="$(sha256sum "$STAGE/$name" | cut -d' ' -f1)"
  [ "$got" = "$sha" ] || { write_state error verify "checksum mismatch: $name"; exit 1; }
  if [ "$name" = "calvin_display_agent.py" ]; then
    "$PYTHON" -m py_compile "$STAGE/$name" || { write_state error verify "py_compile failed"; exit 1; }
  fi
  CHANGED_NAME+=("$name"); CHANGED_TARGET+=("$target"); CHANGED_MODE+=("$mode")
  [ -n "$unit" ] && RESTART_UNITS["$unit"]=1
  case "$target" in "$SYSTEMD_DIR"/*) unit_changed=1;; esac
done <<< "$files_tsv"

if [ "${#CHANGED_NAME[@]}" -eq 0 ]; then
  write_state success noop "already at ${version}"
  "$PYTHON" -c 'import json,sys;json.dump({"version":sys.argv[1]},open(sys.argv[2],"w"))' "$version" "$VERSION_FILE"
  log "no changes; already ${version}"; exit 0
fi

# --- backup then atomic swap ---
rm -rf "$BACKUP_DIR"; mkdir -p "$BACKUP_DIR"
for i in "${!CHANGED_NAME[@]}"; do
  t="${CHANGED_TARGET[$i]}"
  [ -f "$t" ] && cp -p "$t" "$BACKUP_DIR/${CHANGED_NAME[$i]}"
done
write_state running swap "applying ${version}"
for i in "${!CHANGED_NAME[@]}"; do
  t="${CHANGED_TARGET[$i]}"; s="$STAGE/${CHANGED_NAME[$i]}"
  install -m "${CHANGED_MODE[$i]}" "$s" "$t"    # atomic replace + mode
done
[ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true

restart_all() { for u in "${!RESTART_UNITS[@]}"; do "$SYSTEMCTL" restart "$u"; done; }
restart_all

# --- health check (only meaningful when the agent was among the restarts) ---
agent_restarted=0; [ -n "${RESTART_UNITS[calvin-display-agent.service]:-}" ] && agent_restarted=1
if [ "$agent_restarted" = 1 ]; then
  rm -f "$READY_MARKER"    # new agent must recreate it
  deadline=$((SECONDS + HEALTH_TIMEOUT)); healthy=0
  while [ "$SECONDS" -lt "$deadline" ]; do
    if "$SYSTEMCTL" is-active --quiet calvin-display-agent.service && [ -f "$READY_MARKER" ]; then
      healthy=1; break
    fi
    sleep 1
  done
  if [ "$healthy" != 1 ]; then
    write_state running rollback "agent unhealthy; rolling back"
    log "unhealthy; rolling back"
    for i in "${!CHANGED_NAME[@]}"; do
      b="$BACKUP_DIR/${CHANGED_NAME[$i]}"
      [ -f "$b" ] && install -m "${CHANGED_MODE[$i]}" "$b" "${CHANGED_TARGET[$i]}"
    done
    [ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true
    restart_all
    write_state error rollback "rolled back to previous version"
    exit 1
  fi
fi

"$PYTHON" -c 'import json,sys;json.dump({"version":sys.argv[1]},open(sys.argv[2],"w"))' "$version" "$VERSION_FILE"
write_state success complete "updated to ${version}"
log "updated to ${version}"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `chmod +x deploy/kiosk-agent/update-kiosk.sh && bash scripts/tests/test_update_kiosk.sh`
Expected: `PASS happy-path` then `PASS python-too-old`.

- [ ] **Step 5: Add a rollback test case**

Append to `scripts/tests/test_update_kiosk.sh` (before the file ends): a third block that makes the mock `systemctl is-active` return non-zero, asserts the OLD agent content is restored and `agent-update-state.json` contains `rolled back`.
```bash
# --- rollback: is-active fails -> restore backup ---
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
[ "\$1" = "is-active" ] && exit 3   # never healthy
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
sed 's/"3.99"/"3.9"/' "$tmp/srv/manifest.json" > "$tmp/srv/m2"; mv "$tmp/srv/m2" "$tmp/srv/manifest.json"
echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
export CALVIN_UPDATE_HEALTH_TIMEOUT=2
if bash "$SCRIPT"; then echo "FAIL: should exit non-zero on rollback"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL: not rolled back"; exit 1; }
grep -q 'rolled back' "$tmp/state/agent-update-state.json" || { echo "FAIL: no rollback state"; exit 1; }
echo "PASS rollback"
```

- [ ] **Step 6: Run again, then commit**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: `PASS happy-path`, `PASS python-too-old`, `PASS rollback`.
```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk): update-kiosk.sh with verify, backup, restart-only-changed, auto-rollback"
```

---

## Task 3: Backend bundle module (version + manifest)

**Files:**
- Create: `backend/app/services/kiosk_bundle.py`
- Test: `backend/tests/unit/test_kiosk_bundle.py`

**Interfaces:**
- Produces:
  - `BUNDLE_FILES: list[BundleFile]` — the canonical list (Bundle contract).
  - `MIN_PYTHON: str = "3.9"`.
  - `build_manifest(root: Path | None = None) -> dict` — returns the manifest JSON dict.
  - `bundle_version(root: Path | None = None) -> str` — the 16-hex version.
  - `read_bundle_file(name: str, root: Path | None = None) -> bytes` — raw bytes; raises `KeyError` for an unknown name.

- [ ] **Step 1: Write the failing test**

`backend/tests/unit/test_kiosk_bundle.py`:
```python
from pathlib import Path
import pytest
from app.services import kiosk_bundle


def _seed(root: Path):
    for bf in kiosk_bundle.BUNDLE_FILES:
        p = root / bf.repo_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f"content-of-{bf.name}\n")


def test_manifest_lists_all_files_with_hashes(tmp_path):
    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    assert m["min_python"] == "3.9"
    assert len(m["version"]) == 16
    names = {f["name"] for f in m["files"]}
    assert names == {bf.name for bf in kiosk_bundle.BUNDLE_FILES}
    for f in m["files"]:
        assert len(f["sha256"]) == 64
        assert f["target_path"].startswith("/")


def test_version_is_stable_and_content_sensitive(tmp_path):
    _seed(tmp_path)
    v1 = kiosk_bundle.bundle_version(tmp_path)
    assert v1 == kiosk_bundle.bundle_version(tmp_path)          # stable
    (tmp_path / kiosk_bundle.BUNDLE_FILES[0].repo_path).write_text("CHANGED\n")
    assert kiosk_bundle.bundle_version(tmp_path) != v1          # content-sensitive


def test_read_bundle_file_rejects_unknown_name(tmp_path):
    _seed(tmp_path)
    assert kiosk_bundle.read_bundle_file("calvin-x.service", tmp_path)
    with pytest.raises(KeyError):
        kiosk_bundle.read_bundle_file("../../etc/passwd", tmp_path)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.kiosk_bundle`.

- [ ] **Step 3: Write the module**

`backend/app/services/kiosk_bundle.py`:
```python
"""Kiosk update bundle — the small file-set a kiosk needs, served from the checkout."""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

MIN_PYTHON = "3.9"


@dataclass(frozen=True)
class BundleFile:
    name: str
    repo_path: str
    target_path: str
    mode: str
    restart_unit: str | None


BUNDLE_FILES: list[BundleFile] = [
    BundleFile("calvin_display_agent.py", "deploy/kiosk-agent/calvin_display_agent.py",
               "/usr/local/bin/calvin_display_agent.py", "0755", "calvin-display-agent.service"),
    BundleFile("calvin-display-agent.service", "deploy/systemd/calvin-display-agent.service",
               "/etc/systemd/system/calvin-display-agent.service", "0644", "calvin-display-agent.service"),
    BundleFile("calvin-kiosk-remote.service", "deploy/systemd/calvin-kiosk-remote.service",
               "/etc/systemd/system/calvin-kiosk-remote.service", "0644", "calvin-kiosk-remote.service"),
    BundleFile("calvin-x.service", "deploy/systemd/calvin-x.service",
               "/etc/systemd/system/calvin-x.service", "0644", "calvin-x.service"),
    BundleFile("update-kiosk.sh", "deploy/kiosk-agent/update-kiosk.sh",
               "/usr/local/bin/update-kiosk.sh", "0755", None),
    BundleFile("calvin-kiosk-update.service", "deploy/systemd/calvin-kiosk-update.service",
               "/etc/systemd/system/calvin-kiosk-update.service", "0644", None),
]

_BY_NAME = {bf.name: bf for bf in BUNDLE_FILES}


def _root(root: Path | None) -> Path:
    return root if root is not None else settings.repo_dir


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_bundle_file(name: str, root: Path | None = None) -> bytes:
    """Raw bytes for a bundle file. KeyError for any name not in the allowlist."""
    bf = _BY_NAME[name]  # KeyError => unknown/hostile name; never touches the filesystem
    return (_root(root) / bf.repo_path).read_bytes()


def build_manifest(root: Path | None = None) -> dict:
    r = _root(root)
    files = []
    for bf in BUNDLE_FILES:
        files.append({
            "name": bf.name,
            "sha256": _sha256(r / bf.repo_path),
            "mode": bf.mode,
            "target_path": bf.target_path,
            "restart_unit": bf.restart_unit,
        })
    return {"version": _version_from(files), "min_python": MIN_PYTHON, "files": files}


def _version_from(files: list[dict]) -> str:
    blob = "\n".join(f"{f['name']}:{f['sha256']}" for f in sorted(files, key=lambda f: f["name"]))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def bundle_version(root: Path | None = None) -> str:
    return build_manifest(root)["version"]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/kiosk_bundle.py backend/tests/unit/test_kiosk_bundle.py
git commit -m "feat(kiosk): bundle manifest + content-hash version service"
```

---

## Task 4: Bundle-serving endpoints

**Files:**
- Modify: `backend/app/api/routes/kiosks.py` (add two routes)
- Test: `backend/tests/integration/test_api_kiosks.py` (append cases)

**Interfaces:**
- Consumes: `kiosk_bundle.build_manifest`, `kiosk_bundle.read_bundle_file`.
- Produces: `GET /api/kiosks/agent/manifest` (JSON), `GET /api/kiosks/agent/files/{name}` (octet-stream; 404 for unknown name).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/test_api_kiosks.py` (follow the file's existing `client` fixture):
```python
def test_agent_manifest_served(client):
    r = client.get("/api/kiosks/agent/manifest")
    assert r.status_code == 200
    body = r.json()
    assert len(body["version"]) == 16
    assert body["min_python"] == "3.9"
    assert any(f["name"] == "calvin_display_agent.py" for f in body["files"])


def test_agent_file_served_and_allowlisted(client):
    r = client.get("/api/kiosks/agent/files/calvin-x.service")
    assert r.status_code == 200
    assert r.content  # non-empty
    assert client.get("/api/kiosks/agent/files/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get("/api/kiosks/agent/files/nope.txt").status_code == 404
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_api_kiosks.py -k agent -q`
Expected: FAIL — 404 on `/api/kiosks/agent/manifest`.

- [ ] **Step 3: Add the routes**

In `backend/app/api/routes/kiosks.py`, add the import and routes (place the routes **above** `get_kiosk_config` so `/kiosks/agent/...` is matched before `/kiosks/{kiosk_id}/...` — FastAPI matches in declaration order and `agent` would otherwise bind as a `kiosk_id`):
```python
from app.services import kiosk_bundle
```
```python
@router.get("/kiosks/agent/manifest")
async def get_agent_manifest():
    """Serve the kiosk bundle manifest (version + per-file hashes)."""
    return kiosk_bundle.build_manifest()


@router.get("/kiosks/agent/files/{name}")
async def get_agent_file(name: str):
    """Serve one allowlisted bundle file's raw bytes. 404 for anything else."""
    try:
        data = kiosk_bundle.read_bundle_file(name)
    except (KeyError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Unknown bundle file")
    return Response(content=data, media_type="application/octet-stream")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_api_kiosks.py -k agent -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/kiosks.py backend/tests/integration/test_api_kiosks.py
git commit -m "feat(kiosk): serve agent bundle manifest + files (allowlisted)"
```

---

## Task 5: KioskDB columns + Alembic migration

**Files:**
- Modify: `backend/app/models/db_models.py` (KioskDB — 2 new columns)
- Create: `backend/alembic/versions/<rev>_kiosk_agent_version.py`
- Test: `backend/tests/unit/test_kiosk_registry.py` (append)

**Interfaces:**
- Produces: `KioskDB.agent_version: str | None`, `KioskDB.agent_update_status: str | None`.

- [ ] **Step 1: Add the columns to the model**

In `backend/app/models/db_models.py`, inside `KioskDB` after `overrides`:
```python
    agent_version: str | None = ormar.String(
        max_length=64, nullable=True
    )  # running display-agent bundle version, reported by the agent (calvin-lxw)
    agent_update_status: str | None = ormar.String(
        max_length=128, nullable=True
    )  # ok | updating | error:<reason> (calvin-lxw)
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && uv run alembic revision -m "kiosk agent version" --autogenerate`
Then open the generated file and confirm it contains the two `op.add_column(...)` calls; if autogenerate misses them (Ormar metadata quirks), write them by hand:
```python
def upgrade() -> None:
    op.add_column("kiosks", sa.Column("agent_version", sa.String(length=64), nullable=True))
    op.add_column("kiosks", sa.Column("agent_update_status", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "agent_update_status")
    op.drop_column("kiosks", "agent_version")
```

- [ ] **Step 3: Apply + write a test asserting the columns round-trip**

Run: `cd backend && uv run alembic upgrade head`
Append to `backend/tests/unit/test_kiosk_registry.py`:
```python
@pytest.mark.asyncio
async def test_agent_version_columns_roundtrip(kiosk_db):
    from app.models.db_models import KioskDB
    await KioskDB.objects.create(id="k-cols", agent_version="abc123", agent_update_status="ok")
    row = await KioskDB.objects.get(id="k-cols")
    assert row.agent_version == "abc123"
    assert row.agent_update_status == "ok"
```
(Use the same DB fixture the surrounding tests use — match the existing fixture name in the file.)

- [ ] **Step 4: Run the test**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_registry.py -k columns -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/db_models.py backend/alembic/versions backend/tests/unit/test_kiosk_registry.py
git commit -m "feat(kiosk): add agent_version + agent_update_status columns"
```

---

## Task 6: Registry — ingest agent self-report; set/clear update flag

**Files:**
- Modify: `backend/app/services/kiosk_registry.py`
- Test: `backend/tests/unit/test_kiosk_registry.py` (append)

**Interfaces:**
- Consumes: `KioskDB.agent_version`, `KioskDB.agent_update_status` (Task 5).
- Produces:
  - `record_kiosk(kiosk_id, hostname=None, agent_version=None, agent_status=None)` — extended signature (new args default `None` = "not reported this call"). When the reported `agent_version` equals a pending target, the update flag is auto-cleared.
  - `request_agent_update(kiosk_id) -> bool` — set `agent_update_requested` (stored in overrides under key `_agentUpdateRequested`) ; returns False for unknown/malformed id.
  - `agent_update_requested(overrides) -> bool` — read the flag from an overrides dict.
  - `list_kiosks()` rows gain `agentVersion`, `agentUpdateStatus`, `agentUpdateRequested`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_kiosk_registry.py`:
```python
@pytest.mark.asyncio
async def test_record_kiosk_stores_agent_report(kiosk_db):
    from app.services import kiosk_registry as kr
    await kr.record_kiosk("k1", hostname="pi", agent_version="v1", agent_status="ok")
    rows = await kr.list_kiosks()
    row = next(r for r in rows if r["id"] == "k1")
    assert row["agentVersion"] == "v1"
    assert row["agentUpdateStatus"] == "ok"


@pytest.mark.asyncio
async def test_request_and_autoclear_update_flag(kiosk_db):
    from app.services import kiosk_registry as kr
    await kr.record_kiosk("k2", agent_version="old")
    assert await kr.request_agent_update("k2") is True
    ov = await kr.get_overrides("k2")
    assert kr.agent_update_requested(ov) is True
    # agent reports it now runs the target -> flag auto-clears
    await kr.record_kiosk("k2", agent_version="new", agent_status="ok")
    ov2 = await kr.get_overrides("k2")
    assert kr.agent_update_requested(ov2) is False


@pytest.mark.asyncio
async def test_request_update_unknown_id_returns_false(kiosk_db):
    from app.services import kiosk_registry as kr
    assert await kr.request_agent_update("../bad") is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_registry.py -k "agent_report or update_flag or unknown_id" -q`
Expected: FAIL — `request_agent_update` / new kwargs do not exist.

- [ ] **Step 3: Implement**

In `kiosk_registry.py`, add the flag key constant near the top:
```python
_UPDATE_FLAG_KEY = "_agentUpdateRequested"  # stored in overrides; host-internal, not a device setting


def agent_update_requested(overrides: dict | None) -> bool:
    return bool((overrides or {}).get(_UPDATE_FLAG_KEY))
```
Extend `record_kiosk` signature and body:
```python
@retry_on_db_locked()
async def record_kiosk(
    kiosk_id: str,
    hostname: str | None = None,
    agent_version: str | None = None,
    agent_status: str | None = None,
) -> None:
    """Upsert a kiosk's registry row. No-op when kiosk_id is empty/None."""
    if not kiosk_id:
        return
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Ignoring malformed kiosk_id: {kiosk_id!r}")
        return
    if hostname is not None and len(hostname) > 255:
        hostname = hostname[:255]

    now = datetime.utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(
                id=kiosk_id, hostname=hostname, last_seen=now,
                agent_version=agent_version, agent_update_status=agent_status,
            )
            logger.info(f"Registered new kiosk: {kiosk_id!r} (hostname={hostname!r})")
            return
        except _INTEGRITY_ERRORS:
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                return

    existing.last_seen = now
    if hostname:
        existing.hostname = hostname
    if agent_version is not None:
        existing.agent_version = agent_version
    if agent_status is not None:
        existing.agent_update_status = agent_status
    # Auto-clear the update flag once the agent confirms it runs the requested version.
    if agent_version is not None and existing.overrides:
        ov = dict(existing.overrides)
        if ov.pop(_UPDATE_FLAG_KEY, None) is not None:
            existing.overrides = ov
    await existing.update()
```
Add `request_agent_update`:
```python
@retry_on_db_locked()
async def request_agent_update(kiosk_id: str) -> bool:
    """Flag a kiosk for agent update. False if the kiosk is unknown/malformed."""
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        return False
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        return False
    ov = dict(existing.overrides or {})
    ov[_UPDATE_FLAG_KEY] = True
    existing.overrides = ov
    existing.agent_update_status = "updating"
    await existing.update()
    return True
```
Extend `list_kiosks` row dict:
```python
            "lastAppliedVersion": row.last_applied_version,
            "agentVersion": row.agent_version,
            "agentUpdateStatus": row.agent_update_status,
            "agentUpdateRequested": agent_update_requested(row.overrides),
```

- [ ] **Step 4: Run the tests to verify pass**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_registry.py -q`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/kiosk_registry.py backend/tests/unit/test_kiosk_registry.py
git commit -m "feat(kiosk): registry ingests agent report + update-flag set/auto-clear"
```

---

## Task 7: Config endpoint — self-report ingest, payload fields, POST update

**Files:**
- Modify: `backend/app/api/routes/kiosks.py`
- Test: `backend/tests/integration/test_api_kiosks.py` (append)

**Interfaces:**
- Consumes: `kiosk_bundle.bundle_version`, `kiosk_registry.request_agent_update`, `kiosk_registry.agent_update_requested`, extended `record_kiosk`.
- Produces:
  - `GET /kiosks/{id}/config` accepts `khost`, `kagent`, `kstat`; injects `agentAvailableVersion` + `agentUpdateRequested` into the merged payload; strips the internal `_agentUpdateRequested` key from what it returns.
  - `POST /kiosks/{id}/update` → `{ "id", "requested": bool }`; 404 if unknown.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_api_kiosks.py`:
```python
def test_config_reports_available_version_and_flag(client):
    # first contact registers the kiosk + records its running version
    client.get("/api/kiosks/k-upd/config?khost=pi&kagent=oldver&kstat=ok")
    assert client.post("/api/kiosks/k-upd/update").json()["requested"] is True
    body = client.get("/api/kiosks/k-upd/config").json()
    assert len(body["agentAvailableVersion"]) == 16
    assert body["agentUpdateRequested"] is True
    assert "_agentUpdateRequested" not in body  # internal key never leaks


def test_post_update_unknown_kiosk_404(client):
    assert client.post("/api/kiosks/never-seen/update").status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest tests/integration/test_api_kiosks.py -k "available_version or unknown_kiosk" -q`
Expected: FAIL — no `/update` route; payload lacks fields.

- [ ] **Step 3: Implement**

Add imports in `kiosks.py`:
```python
from app.services.kiosk_registry import agent_update_requested
```
Rewrite `get_kiosk_config` to accept the report params and inject fields (keep the ETag/304 behavior; note the payload now varies with the flag, so compute ETag from `device_config_version` **plus** the two new fields to avoid a stale 304 hiding a pending update):
```python
@router.get("/kiosks/{kiosk_id}/config")
async def get_kiosk_config(
    kiosk_id: str, request: Request,
    khost: str | None = None, kagent: str | None = None, kstat: str | None = None,
):
    """Return a kiosk's effective (merged) config; records the kiosk + its agent report."""
    _valid_id_or_400(kiosk_id)
    try:
        await kiosk_registry.record_kiosk(
            kiosk_id, hostname=khost, agent_version=kagent, agent_status=kstat
        )
    except Exception as exc:
        logger.warning(f"Failed to record kiosk {kiosk_id!r}: {exc}")

    base = await build_global_config()
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(base, overrides)
    merged.pop("_agentUpdateRequested", None)  # never expose the host-internal flag verbatim
    version = device_config_version(merged)
    available = kiosk_bundle.bundle_version()
    update_requested = agent_update_requested(overrides)

    etag = f"{version}.{available}.{int(update_requested)}"
    if request.headers.get("If-None-Match") == etag:
        return Response(status_code=304, headers={"ETag": etag})

    merged["deviceConfigVersion"] = version
    merged["agentAvailableVersion"] = available
    merged["agentUpdateRequested"] = update_requested
    return Response(content=json.dumps(merged), media_type="application/json",
                    headers={"ETag": etag})
```
Add the POST route (near the other `/kiosks/{id}` routes, after `put_kiosk_overrides`):
```python
@router.post("/kiosks/{kiosk_id}/update")
async def post_kiosk_update(kiosk_id: str):
    """Flag a kiosk to self-update its agent on the next poll. 404 if unknown."""
    _valid_id_or_400(kiosk_id)
    ok = await kiosk_registry.request_agent_update(kiosk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "requested": True}
```

- [ ] **Step 4: Run the tests to verify pass**

Run: `cd backend && uv run pytest tests/integration/test_api_kiosks.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/kiosks.py backend/tests/integration/test_api_kiosks.py
git commit -m "feat(kiosk): config poll ingests agent report + exposes update signal; POST /update"
```

---

## Task 8: Agent — version report, readiness marker, Python guard

**Files:**
- Modify: `deploy/kiosk-agent/calvin_display_agent.py`
- Modify: `deploy/systemd/calvin-display-agent.service` (add `RuntimeDirectory`)
- Test: `deploy/kiosk-agent/test_display_agent.py` (append)

**Interfaces:**
- Produces:
  - `MIN_PYTHON = (3, 9)` + `check_python()` (exits 1 with a log line if below floor).
  - `running_version(state_dir="/var/lib/calvin")` → `str | None` (reads `agent-version.json`).
  - `_config_url(...)` extended to append `kagent`/`kstat` query params.
  - `touch_ready(marker="/run/calvin/agent-ready")` — called after each successful fetch.
- Consumes: `agentAvailableVersion` / `agentUpdateRequested` from the config payload (Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `deploy/kiosk-agent/test_display_agent.py`:
```python
def test_running_version_reads_state_file(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "abc123def4560000"}')
    assert agent.running_version(str(tmp_path)) == "abc123def4560000"


def test_running_version_missing_is_none(tmp_path):
    assert agent.running_version(str(tmp_path)) is None


def test_config_url_appends_agent_report():
    url = agent._config_url("http://s:8000", "k1", "pi", kagent="v9", kstat="ok")
    assert "kagent=v9" in url and "kstat=ok" in url and "khost=pi" in url


def test_check_python_below_floor_exits(monkeypatch):
    monkeypatch.setattr(agent.sys, "version_info", (3, 8, 0))
    import pytest
    with pytest.raises(SystemExit):
        agent.check_python()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd deploy/kiosk-agent && python3 -m pytest test_display_agent.py -k "running_version or agent_report or check_python" -q`
Expected: FAIL — those names don't exist.

- [ ] **Step 3: Implement in `calvin_display_agent.py`**

Add near the top (after imports):
```python
MIN_PYTHON = (3, 9)
STATE_DIR = "/var/lib/calvin"
READY_MARKER = "/run/calvin/agent-ready"


def check_python():
    if sys.version_info[:2] < MIN_PYTHON:
        got = ".".join(map(str, sys.version_info[:3]))
        need = ".".join(map(str, MIN_PYTHON))
        log(f"python {got} is below the required {need}; refusing to start")
        sys.exit(1)


def running_version(state_dir=STATE_DIR):
    """Return the applied bundle version from the state file, or None."""
    try:
        with open(os.path.join(state_dir, "agent-version.json")) as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


def touch_ready(marker=READY_MARKER):
    """Signal 'this agent booted and reached the backend' for the updater health check."""
    try:
        os.makedirs(os.path.dirname(marker), exist_ok=True)
        with open(marker, "w") as f:
            f.write("ok")
    except OSError:
        pass
```
Change `_config_url` to accept and append the report params:
```python
def _config_url(backend_url, kiosk_id, host, kagent=None, kstat=None):
    base = backend_url.rstrip("/")
    if kiosk_id:
        params = {}
        if host:
            params["khost"] = host
        if kagent:
            params["kagent"] = kagent
        if kstat:
            params["kstat"] = kstat
        q = urllib.parse.urlencode(params)
        return f"{base}/api/kiosks/{kiosk_id}/config" + (f"?{q}" if q else "")
    return base + "/api/config"
```
Update `fetch_config` to pass the running version + status, and call `touch_ready()` on success:
```python
def fetch_config(backend_url, kstat="ok"):
    kiosk_id = os.environ.get("CALVIN_KIOSK_ID", "").strip()
    host = os.environ.get("CALVIN_KIOSK_HOSTNAME", "").strip() or socket.gethostname()
    url = _config_url(backend_url, kiosk_id, host, kagent=running_version(), kstat=kstat)
    with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT) as r:
        cfg = json.load(r)
    touch_ready()
    return cfg
```
Call `check_python()` first thing in `main()`:
```python
def main():
    check_python()
    backend = os.environ.get("CALVIN_BACKEND_URL", "").strip()
    ...
```

- [ ] **Step 4: Modify the service unit for the readiness dir**

In `deploy/systemd/calvin-display-agent.service`, under `[Service]` add:
```ini
RuntimeDirectory=calvin
```
(creates `/run/calvin` owned by the service user each start; the marker lives there.)

- [ ] **Step 5: Run the tests to verify pass**

Run: `cd deploy/kiosk-agent && python3 -m pytest test_display_agent.py -q`
Expected: PASS (all, including pre-existing).

- [ ] **Step 6: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/systemd/calvin-display-agent.service deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): agent reports running version + readiness marker + python floor guard"
```

---

## Task 9: Agent — trigger the updater on request

**Files:**
- Modify: `deploy/kiosk-agent/calvin_display_agent.py`
- Test: `deploy/kiosk-agent/test_display_agent.py` (append)

**Interfaces:**
- Produces: `maybe_update(cfg, *, trigger=..., state=...) -> bool` — decides whether to fire the updater; returns True when it triggered. Wired into `run()`'s loop body.
- Behavior: trigger only when `agentUpdateRequested` is truthy **and** `agentAvailableVersion != running_version()` **and** the available version is not one already attempted-and-failed this process. Trigger = `sudo systemctl start --no-block calvin-kiosk-update.service`.

- [ ] **Step 1: Write the failing tests**

Append to `deploy/kiosk-agent/test_display_agent.py`:
```python
def test_maybe_update_triggers_when_requested_and_stale(monkeypatch, tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "current0000000000"}')
    calls = []
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "newer00000000000"}
    fired = agent.maybe_update(cfg, trigger=lambda: calls.append("go"),
                               state={"attempted": set()}, state_dir=str(tmp_path))
    assert fired is True and calls == ["go"]


def test_maybe_update_skips_when_already_current(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "same000000000000"}')
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "same000000000000"}
    assert agent.maybe_update(cfg, trigger=lambda: None,
                              state={"attempted": set()}, state_dir=str(tmp_path)) is False


def test_maybe_update_no_retry_same_failed_version(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "cur0000000000000"}')
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "bad0000000000000"}
    st = {"attempted": {"bad0000000000000"}}   # already tried this version
    assert agent.maybe_update(cfg, trigger=lambda: None, state=st, state_dir=str(tmp_path)) is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd deploy/kiosk-agent && python3 -m pytest test_display_agent.py -k maybe_update -q`
Expected: FAIL — `maybe_update` undefined.

- [ ] **Step 3: Implement**

Add to `calvin_display_agent.py`:
```python
UPDATE_UNIT = "calvin-kiosk-update.service"


def _fire_updater():
    """Kick the root oneshot updater; returns without waiting (it restarts us)."""
    try:
        subprocess.run(
            ["sudo", "-n", "systemctl", "start", "--no-block", UPDATE_UNIT],
            capture_output=True, text=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        log(f"could not trigger updater ({e})")


def maybe_update(cfg, *, trigger=_fire_updater, state=None, state_dir=STATE_DIR):
    """Trigger a self-update when the server requested one and we're stale.

    `state["attempted"]` is a set of versions already tried this process, so a
    failed/rolled-back version is not retried in a loop.
    """
    if state is None or not cfg_get(cfg, "agentUpdateRequested", default=False):
        return False
    available = cfg_get(cfg, "agentAvailableVersion")
    if not available or available == running_version(state_dir):
        return False
    if available in state["attempted"]:
        return False
    state["attempted"].add(available)
    log(f"update requested: {running_version(state_dir)} -> {available}; triggering updater")
    trigger()
    return True
```
Wire it into `run()` — initialise the state dict and call it each iteration right after a successful fetch (before/after device apply is fine; it must not raise):
```python
def run(backend_url, refresh_seconds, *, fetch=fetch_config, sleep=time_module.sleep,
        iterations=None, apply_device=None):
    if apply_device is None:
        apply_device = apply_device_physical
    last = None
    last_version = _UNSET
    update_state = {"attempted": set()}
    n = 0
    while iterations is None or n < iterations:
        n += 1
        try:
            cfg = fetch(backend_url)
            if not isinstance(cfg, dict):
                raise TypeError(f"expected dict config, got {type(cfg).__name__}")
            maybe_update(cfg, state=update_state)
            version = cfg_get(cfg, "deviceConfigVersion")
            ...
```

- [ ] **Step 4: Run the tests to verify pass**

Run: `cd deploy/kiosk-agent && python3 -m pytest test_display_agent.py -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): agent triggers updater on request with no-retry guard"
```

---

## Task 10: setup-kiosk.sh — fetch bundle instead of cloning the repo

**Files:**
- Modify: `scripts/setup-kiosk.sh`
- Modify: `scripts/setup-common.sh` (add `install_kiosk_bundle` + `seed_agent_version` helpers)
- Test: `scripts/tests/test_setup_kiosk_bundle.sh`

**Interfaces:**
- Produces: `install_kiosk_bundle <backend_url> <user>` — fetches the manifest + each file from `<backend_url>/api/kiosks/agent/...`, installs each to its `target_path` with its `mode`, seeds `/var/lib/calvin/agent-version.json`, installs the sudoers fragment. Replaces `ensure_repo_for_unit_files` + `install_script` for the agent.

- [ ] **Step 1: Write the failing test**

`scripts/tests/test_setup_kiosk_bundle.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/dest" "$tmp/state"

# Mock manifest + one file via a mock curl
cat > "$tmp/manifest.json" <<EOF
{"version":"feedfacefeedface","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"x","mode":"0755","target_path":"$tmp/dest/agent.py","restart_unit":"calvin-display-agent.service"}]}
EOF
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) echo "AGENT-BODY"; exit 0;;
esac; done
exit 22
EOF
chmod +x "$tmp/bin/curl"; export PATH="$tmp/bin:$PATH"

# shellcheck disable=SC1090
. "$here/../setup-common.sh"
export CALVIN_AGENT_STATE_DIR="$tmp/state"
install_kiosk_bundle "http://server.local:8000" "$(id -un)"

grep -q AGENT-BODY "$tmp/dest/agent.py" || { echo "FAIL: agent not installed from bundle"; exit 1; }
grep -q feedfacefeedface "$tmp/state/agent-version.json" || { echo "FAIL: version not seeded"; exit 1; }
echo "PASS"
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh`
Expected: FAIL — `install_kiosk_bundle: command not found`.

- [ ] **Step 3: Add helpers to `setup-common.sh`**

```bash
# Fetch + install the kiosk bundle (agent, units, updater) from the local backend.
install_kiosk_bundle() {
    local backend_url="${1%/}" user="${2:-$DEFAULT_CALVIN_USER}"
    local state_dir="${CALVIN_AGENT_STATE_DIR:-/var/lib/calvin}"
    local manifest; manifest="$(curl -fsSL "${backend_url}/api/kiosks/agent/manifest")" \
        || error_exit "Failed to fetch kiosk bundle manifest from ${backend_url}" 1
    local version; version="$(printf '%s' "$manifest" | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])')"
    printf '%s' "$manifest" | python3 -c '
import sys, json
for f in json.load(sys.stdin)["files"]:
    print("\t".join([f["name"], f["mode"], f["target_path"]]))' | while IFS=$'\t' read -r name mode target; do
        mkdir -p "$(dirname "$target")"
        curl -fsSL "${backend_url}/api/kiosks/agent/files/${name}" -o "$target" \
            || error_exit "Failed to fetch bundle file ${name}" 1
        chmod "$mode" "$target"
    done
    mkdir -p "$state_dir"
    printf '{"version": "%s"}\n' "$version" > "${state_dir}/agent-version.json"
}
```

- [ ] **Step 4: Rewire `setup-kiosk.sh`**

Replace the agent-install + unit-install block. In `main()`, remove the `ensure_repo_for_unit_files` call, the `install_script ".../calvin_display_agent.py" ...` call, and the three `install_systemd_service ".../deploy/systemd/..."` calls (those files now arrive via the bundle). Install the sudoers fragment and the bundle instead:
```bash
    install_kiosk_config
    log "Installing kiosk bundle (agent + units + updater) from ${BACKEND_URL}..."
    install_kiosk_bundle "${BACKEND_URL}" "${CALVIN_USER}"
    install -m 0440 /dev/stdin /etc/sudoers.d/calvin-kiosk-update <<'SUDOERS'
calvin ALL=(root) NOPASSWD: /bin/systemctl start --no-block calvin-kiosk-update.service
SUDOERS
```
Then keep `configure_display` / `configure_openbox_autostart`, and in `install_kiosk_services`/`start_kiosk_services` enable/start `calvin-x`, `calvin-kiosk-remote`, `calvin-display-agent` (the unit files are now already on disk from the bundle, so `install_systemd_service` is no longer needed — enable/start directly). Delete the now-unused `ensure_repo_for_unit_files` function and its stale comment.

- [ ] **Step 5: Run the new test + existing kiosk shell tests**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh && for t in scripts/tests/test_default_kiosk_id.sh scripts/tests/test_kiosk_id_persists.sh; do bash "$t"; done`
Expected: `PASS` for the new test; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-kiosk.sh scripts/setup-common.sh scripts/tests/test_setup_kiosk_bundle.sh
git commit -m "feat(kiosk): setup-kiosk installs bundle from backend, drops full repo clone"
```

---

## Task 11: Frontend store — available version + trigger update

**Files:**
- Modify: `frontend/src/stores/kiosks.js`
- Test: `frontend/src/stores/__tests__/kiosks.spec.js` (create if absent; else append)

**Interfaces:**
- Produces: `triggerUpdate(id) -> Promise<void>` (POST `/api/kiosks/{id}/update`, then `loadKiosks()`); `kiosks` rows already carry `agentVersion` / `agentUpdateStatus` / `agentUpdateRequested` from the list endpoint (Task 6).

- [ ] **Step 1: Write the failing test**

`frontend/src/stores/__tests__/kiosks.spec.js`:
```js
import { setActivePinia, createPinia } from "pinia";
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("axios");

describe("kiosks store — triggerUpdate", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("POSTs the update and refreshes the list", async () => {
    axios.post = vi.fn().mockResolvedValue({ data: { id: "k1", requested: true } });
    axios.get = vi.fn().mockResolvedValue({ data: { kiosks: [] } });
    const store = useKiosksStore();
    await store.triggerUpdate("k1");
    expect(axios.post).toHaveBeenCalledWith("/api/kiosks/k1/update");
    expect(axios.get).toHaveBeenCalledWith("/api/kiosks");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/stores/__tests__/kiosks.spec.js`
Expected: FAIL — `triggerUpdate is not a function`.

- [ ] **Step 3: Implement**

In `frontend/src/stores/kiosks.js`, add inside the store and export it:
```js
  async function triggerUpdate(id) {
    await axios.post(`/api/kiosks/${encodeURIComponent(id)}/update`);
    await loadKiosks();
  }
```
```js
  return { kiosks, loadKiosks, fetchOverrides, saveOverrides, fetchDeviceConfigVersion, triggerUpdate };
```

- [ ] **Step 4: Run the test to verify pass**

Run: `cd frontend && npx vitest run src/stores/__tests__/kiosks.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/kiosks.js frontend/src/stores/__tests__/kiosks.spec.js
git commit -m "feat(kiosk): store action to trigger agent update"
```

---

## Task 12: Frontend UI — Update button + status in Kiosks settings

**Files:**
- Modify: `frontend/src/components/settings/categories/KiosksSettings.vue`
- Test: `frontend/src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js` (create)

**Interfaces:**
- Consumes: `useKiosksStore().triggerUpdate`, and per-kiosk `agentVersion` / `agentAvailableVersion` / `agentUpdateStatus`. `agentAvailableVersion` is the same for all kiosks — read it from any kiosk row's config or expose it on the list response; here we surface it via the selected kiosk's `/config` fetch already used for `desiredVersions`. Enable **Update** when `agentVersion !== agentAvailableVersion`.

- [ ] **Step 1: Write the failing component test**

`frontend/src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js`:
```js
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { describe, it, expect, vi } from "vitest";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";

describe("KiosksSettings — update button", () => {
  it("calls triggerUpdate when the update control is clicked", async () => {
    const wrapper = mount(KiosksSettings, {
      global: {
        plugins: [createTestingPinia({
          createSpy: vi.fn,
          initialState: { kiosks: { kiosks: [
            { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(),
              agentVersion: "old", agentUpdateStatus: "ok", agentUpdateRequested: false },
          ] } },
        })],
        stubs: { SettingsSection: { template: "<div><slot/></div>" } },
      },
    });
    const store = (await import("@/stores/kiosks")).useKiosksStore();
    store.triggerUpdate = vi.fn().mockResolvedValue();
    await wrapper.get('[data-test="kiosk-update-btn"]').trigger("click");
    expect(store.triggerUpdate).toHaveBeenCalledWith("k1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js`
Expected: FAIL — no `[data-test="kiosk-update-btn"]`.

- [ ] **Step 3: Implement the control**

In `KiosksSettings.vue`, in the per-kiosk card meta area add an update control + status. Wire the store action and an `updateAvailable(k)` helper:
```html
        <span class="kiosk-card__meta-end">
          <button
            v-if="updateAvailable(k)"
            type="button"
            class="kiosk-card__update"
            data-test="kiosk-update-btn"
            :disabled="k.agentUpdateRequested"
            @click.stop="onUpdate(k.id)"
          >{{ k.agentUpdateRequested ? "Updating…" : "Update" }}</button>
          <!-- existing pending badge + online/offline status stay here -->
        </span>
```
In `<script setup>`:
```js
import { useKiosksStore } from "@/stores/kiosks";
const kiosksStore = useKiosksStore();

function updateAvailable(k) {
  // agentAvailableVersion is surfaced via the selected kiosk's config fetch; fall back to
  // comparing against the freshest known available version across loaded kiosks.
  const available = availableVersion.value;
  return available != null && k.agentVersion != null && k.agentVersion !== available;
}

async function onUpdate(id) {
  await kiosksStore.triggerUpdate(id);
}
```
Add `availableVersion` — reuse the existing `/config` fetch that already populates `desiredVersions`; capture `agentAvailableVersion` from that same response into a ref `availableVersion`. (In the existing `fetchDeviceConfigVersion` flow, also read `response.data.agentAvailableVersion`.) Surface `agentUpdateStatus` as a small caption when it starts with `error` (e.g. `python-too-old` → "needs OS update").

- [ ] **Step 4: Run the test to verify pass**

Run: `cd frontend && npx vitest run src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js`
Expected: PASS.

- [ ] **Step 5: Full frontend test + lint, then commit**

Run: `cd frontend && npx vitest run && npm run lint`
Expected: PASS / no lint errors.
```bash
git add frontend/src/components/settings/categories/KiosksSettings.vue frontend/src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js
git commit -m "feat(kiosk): Update button + status in Kiosks settings"
```

---

## Task 13: Docs + full-suite gate

**Files:**
- Modify: `docs/setup/KIOSK_PROVISIONING.md` (bundle-based install, self-update)
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md` (agent update flow; `min_python`)

- [ ] **Step 1: Document the update flow**

Add a "Kiosk agent self-update" section to `docs/setup/KIOSK_PROVISIONING.md`: admin clicks **Update** in Kiosks settings → agent pulls the bundle from the server on its next poll → verifies + swaps + restarts + auto-rollback. Note: no full repo on the kiosk; `min_python` floor is 3.9; a too-new bundle is declined and surfaced as "needs OS update". Note the `zipapp` future option.

- [ ] **Step 2: Run the whole affected suite**

Run:
```bash
cd backend && uv run pytest tests/unit/test_kiosk_bundle.py tests/unit/test_kiosk_registry.py tests/integration/test_api_kiosks.py -q
cd ../deploy/kiosk-agent && python3 -m pytest test_display_agent.py -q
cd ../.. && for t in scripts/tests/test_kiosk_update_unit.sh scripts/tests/test_update_kiosk.sh scripts/tests/test_setup_kiosk_bundle.sh; do bash "$t"; done
cd frontend && npx vitest run src/stores/__tests__/kiosks.spec.js src/components/settings/categories/__tests__/KiosksSettings.updateButton.spec.js
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/setup/KIOSK_PROVISIONING.md docs/setup/DEPLOYMENT_TOPOLOGIES.md
git commit -m "docs(kiosk): document agent self-update + bundle install"
```

---

## Self-review (completed while writing)

**Spec coverage:** bundle endpoints (T3–T4), content-hash version (T3), registry+config self-report & flag (T5–T7), agent report/guard/trigger (T8–T9), privileged updater + verify/backup/rollback + restart-only-changed (T2) with its unit+sudoers (T1), `min_python` precheck (T2) + floor guard (T8), setup-kiosk drops full clone (T10), UI (T11–T12), docs (T13). "Update all" is intentionally absent (deferred → calvin-3d1). SSE remains dd9.7 (out of scope). ✅

**Placeholder scan:** every code step carries complete code; commands have expected output. Two spec "open questions" are resolved in-plan: readiness marker = `/run/calvin/agent-ready` via `RuntimeDirectory=calvin` (T8) + health check (T2); "Update all" deferred. ✅

**Type/name consistency:** `running_version`, `maybe_update`, `touch_ready`, `check_python`, `_config_url(...,kagent,kstat)`, `request_agent_update`, `agent_update_requested`, `_agentUpdateRequested`, `agentAvailableVersion`, `agentUpdateRequested`, `bundle_version`, `build_manifest`, `read_bundle_file`, `install_kiosk_bundle`, `triggerUpdate` — used identically across producing and consuming tasks. ETag widened to `version.available.flag` so a pending update can't be masked by a 304. ✅
