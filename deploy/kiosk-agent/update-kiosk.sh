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
RECEIPT_FILE="${STATE_DIR}/agent-manifest.json"
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
  MANIFEST_JSON="$manifest" "$PYTHON" - "$RECEIPT_FILE" <<'PY'
import json, os, sys
path = sys.argv[1]
m = json.loads(os.environ["MANIFEST_JSON"])
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

manifest="$("$CURL" -fsSL "$BASE/api/kiosks/agent/manifest")" || {
  write_state error fetch "manifest fetch failed"; log "manifest fetch failed"; exit 1; }

version="$(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(json.load(sys.stdin)["version"])')"
ALL_NAMES=" $(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(" ".join(f["name"] for f in json.load(sys.stdin)["files"]))') "

# --- min_python precheck ---
min_py="$(printf '%s' "$manifest" | "$PYTHON" -c 'import sys,json;print(json.load(sys.stdin).get("min_python",""))')"
if [ -n "$min_py" ]; then
  if ! "$PYTHON" -c 'import sys;a=tuple(int(x) for x in sys.argv[1].split("."));sys.exit(0 if sys.version_info[:2]>=a else 1)' "$min_py"; then
    write_state error python-too-old "device python < ${min_py}; keeping current agent" "$version"
    log "python-too-old (need ${min_py}); aborting"; exit 1
  fi
fi
# Emit one TAB-separated line per file: name sha256 mode target_path restart_unit enable
files_tsv="$(printf '%s' "$manifest" | "$PYTHON" -c '
import sys, json
for f in json.load(sys.stdin)["files"]:
    print("\t".join([f["name"], f["sha256"], f["mode"], f["target_path"],
                     f.get("restart_unit") or "", "1" if f.get("enable") else ""]))')"

write_state running fetch "checking bundle ${version}"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$BACKUP_DIR"
declare -a CHANGED_TARGET=() CHANGED_MODE=() CHANGED_NAME=()
declare -A RESTART_UNITS=()
declare -a NEW_ENABLE_UNITS=()
unit_changed=0

installed_sha() { [ -f "$1" ] && sha256sum "$1" | cut -d' ' -f1 || echo ""; }

while IFS=$'\t' read -r name sha mode target unit enable; do
  [ -n "$name" ] || continue
  old="$(installed_sha "$target")"
  if [ "$old" = "$sha" ]; then continue; fi   # unchanged
  # fetch + verify
  "$CURL" -fsSL "$BASE/api/kiosks/agent/files/$name" > "$STAGE/$name" || {
    write_state error fetch "download failed: $name" "$version"; exit 1; }
  got="$(sha256sum "$STAGE/$name" | cut -d' ' -f1)"
  [ "$got" = "$sha" ] || { write_state error verify "checksum mismatch: $name" "$version"; exit 1; }
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
  [ -n "$unit" ] && RESTART_UNITS["$unit"]=1
  case "$target" in "$SYSTEMD_DIR"/*) unit_changed=1;; esac
  if [ -z "$old" ] && [ "$enable" = "1" ]; then
    case "$target" in "$SYSTEMD_DIR"/*.service) NEW_ENABLE_UNITS+=("$(basename "$target")");; esac
  fi
done <<< "$files_tsv"

for u in "${NEW_ENABLE_UNITS[@]:-}"; do [ -n "$u" ] && unset 'RESTART_UNITS[$u]'; done

if [ "${#CHANGED_NAME[@]}" -eq 0 ]; then
  write_state success noop "already at ${version}" "$version"
  write_version "$version"
  write_receipt
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
  install -m "${CHANGED_MODE[$i]}" "$s" "$t"    # replace via new inode (safe over a running script) + mode
done
[ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true

restart_all() { for u in "${!RESTART_UNITS[@]}"; do "$SYSTEMCTL" restart "$u"; done; }
enable_units() { for u in "$@"; do "$SYSTEMCTL" enable "$u" || log "enable failed: $u"; done; }
start_units()  { for u in "$@"; do "$SYSTEMCTL" start  "$u" || log "start failed: $u";  done; }
restart_all

# --- health check (only meaningful when the agent was among the restarts) ---
agent_restarted=0; [ -n "${RESTART_UNITS[calvin-display-agent.service]:-}" ] && agent_restarted=1
if [ "$agent_restarted" = 1 ]; then
  rm -f "$READY_MARKER"   # clear stale marker; only a fresh one created by the new agent counts
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
      if [ -f "$b" ]; then
        install -m "${CHANGED_MODE[$i]}" "$b" "${CHANGED_TARGET[$i]}"
      else
        rm -f "${CHANGED_TARGET[$i]}"   # file was newly introduced by this update; undo it
      fi
    done
    [ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true
    restart_all
    write_state error rollback "rolled back to previous version" "$version"
    exit 1
  fi
fi

if [ "${#NEW_ENABLE_UNITS[@]}" -gt 0 ]; then
  enable_units "${NEW_ENABLE_UNITS[@]}"
  start_units "${NEW_ENABLE_UNITS[@]}"
fi

write_version "$version"
write_receipt
write_state success complete "updated to ${version}" "$version"
log "updated to ${version}"
