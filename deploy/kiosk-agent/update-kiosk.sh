#!/usr/bin/env bash
# Calvin kiosk agent updater. Pulls the kiosk bundle from the local Calvin
# backend, verifies (sha256 + py_compile + min_python), backs up, atomic-swaps
# only changed files, restarts only affected services, auto-rolls-back if the
# agent fails to come up healthy. Pure bash + python3 (no jq).
set -euo pipefail

ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"
# An exported CALVIN_CHROMIUM_GPU outranks the config file, which is sourced next
# and would otherwise replace it (same precedence as setup-common.sh).
CALVIN_CHROMIUM_GPU_ENV="${CALVIN_CHROMIUM_GPU:-}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
SIGNING_ENV_FILE="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
# shellcheck disable=SC1090
[ -f "$SIGNING_ENV_FILE" ] && . "$SIGNING_ENV_FILE"
: "${CALVIN_BACKEND_URL:?CALVIN_BACKEND_URL not set}"

CURL="${CALVIN_CURL:-curl}"
SYSTEMCTL="${CALVIN_SYSTEMCTL:-systemctl}"
PYTHON="${CALVIN_PYTHON:-python3}"
STATE_DIR="${CALVIN_AGENT_STATE_DIR:-/var/lib/calvin}"
SYSTEMD_DIR="${CALVIN_SYSTEMD_DIR:-/etc/systemd/system}"
BIN_DIR="${CALVIN_BIN_DIR:-/usr/local/bin}"
LABWC_DIR="${CALVIN_LABWC_DIR:-/home/calvin/.config/labwc}"
DISPLAY_ENV_FILE="${CALVIN_KIOSK_DISPLAY_ENV_FILE:-/etc/default/calvin-kiosk-display}"
READY_MARKER="${CALVIN_AGENT_READY_MARKER:-/run/calvin/agent-ready}"
HEALTH_TIMEOUT="${CALVIN_UPDATE_HEALTH_TIMEOUT:-30}"
BACKUP_DIR="${STATE_DIR}/agent-backup"
VERSION_FILE="${STATE_DIR}/agent-version.json"
STATE_FILE="${STATE_DIR}/agent-update-state.json"
RECEIPT_FILE="${STATE_DIR}/agent-manifest.json"
BASE="${CALVIN_BACKEND_URL%/}"

log() { printf '[update-kiosk] %s\n' "$*"; }

# Display stack of THIS kiosk (x11|wayland). Phase 1: anything but an explicit
# wayland is X11, matching resolve_display_stack in scripts/setup-common.sh.
display_stack() {
  local stack="${CALVIN_DISPLAY_STACK:-}"
  case "$stack" in
    wayland) echo wayland ;;
    *) echo x11 ;;
  esac
}

# The compositor that is NOT the configured stack must never be re-enabled by an
# update: exactly one compositor unit owns tty1.
unit_suppressed() {  # $1 = unit name
  case "$1" in
    calvin-x.service) [ "$(display_stack)" = wayland ] ;;
    calvin-wayland.service) [ "$(display_stack)" = x11 ] ;;
    *) return 1 ;;
  esac
}

# Session env file the kiosk/display-agent units read (DISPLAY/XAUTHORITY on X11,
# XDG_SESSION_TYPE/WAYLAND_DISPLAY/XDG_RUNTIME_DIR on Wayland). Older kiosks do
# not have it yet and these units require it, so create the current stack's file
# before anything is swapped. setup owns the content: an existing file is only
# touched for the Chromium flags line (sync_chromium_display_flags below).
#
# Chromium's GPU path (calvin-scuh): VC4-class boards (Pi 3 family, Zero 2 W, CM3)
# crash the renderer under Chromium's GPU process ("Aw, Snap! error 11"), so they
# get --disable-gpu. CALVIN_CHROMIUM_GPU=auto|on|off (environment, then
# /etc/default/calvin-kiosk) overrides the board detection.
calvin_board_model() {
  local file="${CALVIN_DEVICE_TREE_MODEL:-/proc/device-tree/model}"
  [ -r "$file" ] || return 0
  tr -d '\000' < "$file" | sed -e 's/[[:space:]]*$//'
}

board_is_vc4_class() {
  case "${1:-}" in
    *"Raspberry Pi 3"*|*"Raspberry Pi Zero 2"*|*"Compute Module 3"*) return 0 ;;
    *) return 1 ;;
  esac
}

# auto|on|off. A bad value must not brick the update path, so warn and keep the
# default (auto) instead of failing the update.
chromium_gpu_setting() {
  local requested="${CALVIN_CHROMIUM_GPU_ENV:-${CALVIN_CHROMIUM_GPU:-auto}}"
  case "$requested" in
    auto|on|off) printf '%s\n' "$requested" ;;
    *)
      log "ignoring invalid CALVIN_CHROMIUM_GPU=${requested} (expected auto, on or off); using auto" >&2
      printf 'auto\n'
      ;;
  esac
}

chromium_display_flags() {  # $1 = stack
  local stack="$1" disable_gpu=0
  local -a flags=()
  case "$(chromium_gpu_setting)" in
    off) disable_gpu=1 ;;
    auto) board_is_vc4_class "$(calvin_board_model)" && disable_gpu=1 ;;
  esac
  [ "$stack" = "wayland" ] && flags+=(--ozone-platform=wayland)
  [ "$disable_gpu" = 1 ] && flags+=(--disable-gpu)
  local IFS=' '
  printf '%s\n' "${flags[*]:-}"
}

ensure_display_env() {
  [ -f "$DISPLAY_ENV_FILE" ] && return 0
  local uid flags
  uid="$(id -u calvin 2>/dev/null || echo 1000)"
  flags="$(chromium_display_flags "$(display_stack)")"
  mkdir -p "$(dirname "$DISPLAY_ENV_FILE")"
  if [ "$(display_stack)" = wayland ]; then
    cat > "$DISPLAY_ENV_FILE" <<EOF
# Calvin kiosk display session (stack: wayland). Created by update-kiosk.sh;
# re-run the kiosk installer to change stacks.
XDG_SESSION_TYPE=wayland
WAYLAND_DISPLAY=wayland-0
XDG_RUNTIME_DIR=/run/user/${uid}
CALVIN_CHROMIUM_DISPLAY_FLAGS=${flags}
EOF
  else
    cat > "$DISPLAY_ENV_FILE" <<EOF
# Calvin kiosk display session (stack: x11). Created by update-kiosk.sh;
# re-run the kiosk installer to change stacks.
DISPLAY=:0
XAUTHORITY=/home/calvin/.Xauthority
CALVIN_CHROMIUM_DISPLAY_FLAGS=${flags}
EOF
  fi
  chmod 0644 "$DISPLAY_ENV_FILE"
  log "created ${DISPLAY_ENV_FILE} for the $(display_stack) stack"
}

ensure_display_env

# Set KEY=VALUE in a .env-style file in place, adding the line when missing and
# leaving every other line (operator settings, comments) alone.
set_env_line() {  # $1 = file, $2 = key, $3 = value
  local file="$1" tmp
  tmp="$(mktemp)"
  UPSERT_KEY="$2" UPSERT_VALUE="$3" awk '
    BEGIN { k = ENVIRON["UPSERT_KEY"]; v = ENVIRON["UPSERT_VALUE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"   # rewrite in place: keeps owner and mode
  rm -f "$tmp"
}

current_display_flags() {
  local line
  line="$(grep -m1 '^CALVIN_CHROMIUM_DISPLAY_FLAGS=' "$DISPLAY_ENV_FILE" 2>/dev/null || true)"
  printf '%s' "${line#CALVIN_CHROMIUM_DISPLAY_FLAGS=}"
}

# The flag depends on the board and the setting, not on the bundle: recompute it
# on every run, including one that changes nothing else. Returns 0 when the line
# changed, so the caller restarts the kiosk unit to apply it now.
sync_chromium_display_flags() {
  local want
  [ -f "$DISPLAY_ENV_FILE" ] || return 1
  want="$(chromium_display_flags "$(display_stack)")"
  [ "$(current_display_flags)" = "$want" ] && return 1
  set_env_line "$DISPLAY_ENV_FILE" CALVIN_CHROMIUM_DISPLAY_FLAGS "$want"
  log "set CALVIN_CHROMIUM_DISPLAY_FLAGS='${want}' in ${DISPLAY_ENV_FILE}"
  return 0
}

FLAGS_CHANGED=0
if sync_chromium_display_flags; then FLAGS_CHANGED=1; fi

restart_kiosk_for_flags() {
  [ "$FLAGS_CHANGED" = 1 ] || return 0
  [ -f "$SYSTEMD_DIR/calvin-kiosk-remote.service" ] || return 0
  # restart_all() already covers a changed unit file.
  [ -z "${RESTART_UNITS[calvin-kiosk-remote.service]:-}" ] || return 0
  "$SYSTEMCTL" restart calvin-kiosk-remote.service \
    || log "restart failed: calvin-kiosk-remote.service"
}

path_allowed() {  # $1 = absolute target path
  case "$1" in
    *..*) return 1 ;;                         # no traversal
    "$BIN_DIR"/*|"$SYSTEMD_DIR"/*|"$LABWC_DIR"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# The bundle's files, pinned (K7): each may only go to its own path with its own
# mode, and only these units may be restarted or enabled. Keep in sync with
# BUNDLE_FILES in backend/app/services/kiosk_bundle.py (a backend test checks).
# A manifest naming a file not listed here is refused, unless it also ships a
# newer update-kiosk.sh, which is then re-run to install the rest.
pinned_entry() {  # $1 = name -> "<dir> <mode>"
  case "$1" in
    calvin_display_agent.py|update-kiosk.sh) echo "$BIN_DIR 0755" ;;
    calvin-display-agent.service|calvin-kiosk-remote.service|calvin-x.service|calvin-kiosk-update.service|calvin-wayland.service) echo "$SYSTEMD_DIR 0644" ;;
    autostart) echo "$LABWC_DIR 0755" ;;
    rc.xml) echo "$LABWC_DIR 0644" ;;
    *) return 1 ;;
  esac
}
KNOWN_UNITS=" calvin-display-agent.service calvin-kiosk-remote.service calvin-x.service calvin-wayland.service calvin-kiosk-update.service "

name_allowed() {  # $1 = manifest file name; must be a bare filename (calvin-10n)
  case "$1" in
    ''|.|..|*/*|*..*) return 1 ;;             # no empty, dot-dirs, slashes, traversal
    *) return 0 ;;
  esac
}

# Verify the manifest HMAC signature when a signing key is configured (calvin-5vw).
# $1 = manifest JSON. Prints a failure reason to stdout and returns non-zero on failure.
# No key configured -> returns 0 (LAN-trust, unchanged behavior).
verify_manifest_sig() {
  [ -n "${CALVIN_KIOSK_SIGNING_KEY:-}" ] || return 0
  CALVIN_KIOSK_SIGNING_KEY="$CALVIN_KIOSK_SIGNING_KEY" MANIFEST_JSON="$1" "$PYTHON" - <<'PY'
import sys, json, hmac, hashlib, os
key_hex = os.environ.get("CALVIN_KIOSK_SIGNING_KEY", "")
def fail(msg):
    sys.stdout.write(msg)
    sys.exit(1)
try:
    m = json.loads(os.environ["MANIFEST_JSON"])
except Exception:
    fail("signature: manifest unparseable")
sig = m.pop("signature", None)
alg = m.pop("sig_alg", None)
if sig is None or alg is None:
    fail("signature required but missing")
if alg != "hmac-sha256":
    fail("unsupported manifest sig_alg")
try:
    key = bytes.fromhex(key_hex)
except ValueError:
    fail("signing key malformed")
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
tag = hmac.new(key, canon, hashlib.sha256).hexdigest()
if not hmac.compare_digest(tag, str(sig)):
    fail("signature invalid")
PY
}

# --self-check: read-only validation of THIS updater's startup + fetch/parse path.
# A running updater invokes this on a STAGED new updater before adopting it, so a
# dead-on-arrival updater is never installed. Mutates nothing (no state-dir mkdir,
# no swap/restart/state/version/backup/marker writes) and triggers no update, so it
# cannot recurse.
if [ "${1:-}" = "--self-check" ]; then
  _m="$("$CURL" -fsSL "$BASE/api/kiosks/agent/manifest")" || { log "self-check: manifest fetch failed"; exit 1; }
  printf '%s' "$_m" | "$PYTHON" -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("version") and isinstance(d.get("files"), list) else 1)' || {
    log "self-check: manifest invalid"; exit 1; }
  _sc_reason="$(verify_manifest_sig "$_m")" || {
    log "self-check: manifest ${_sc_reason:-signature verification failed}"; exit 1; }
  log "self-check: ok"; exit 0
fi

BOOTSTRAP=0
if [ "${1:-}" = "--bootstrap" ]; then BOOTSTRAP=1; fi

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

_sig_reason="$(verify_manifest_sig "$manifest")" || {
  write_state error verify "manifest ${_sig_reason:-signature verification failed}"
  log "manifest ${_sig_reason:-signature verification failed}"; exit 1; }

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
declare -a DROPPED_TARGETS=()
declare -a ENABLE_WANTED=() UNKNOWN_NAMES=()
unit_changed=0

installed_sha() { [ -f "$1" ] && sha256sum "$1" | cut -d' ' -f1 || echo ""; }

while IFS=$'\t' read -r name sha mode target unit enable; do
  [ -n "$name" ] || continue
  if ! name_allowed "$name"; then
    write_state error verify "file name not allowed: $name" "$version"
    log "file name not allowed: $name"; exit 1
  fi
  if ! path_allowed "$target"; then
    write_state error verify "target path not allowed: $target" "$version"
    log "target path not allowed: $target"; exit 1
  fi
  if ! pinned="$(pinned_entry "$name")"; then
    UNKNOWN_NAMES+=("$name"); continue   # decided after the loop
  fi
  if [ "$target" != "${pinned% *}/$name" ]; then
    write_state error verify "target path not allowed: $target" "$version"
    log "target path not allowed for $name: $target"; exit 1
  fi
  if [ "$mode" != "${pinned#* }" ]; then
    write_state error verify "mode $mode not allowed for $name" "$version"
    log "mode $mode not allowed for $name"; exit 1
  fi
  if [ -n "$unit" ] && [ "${KNOWN_UNITS#* "$unit" }" = "$KNOWN_UNITS" ]; then
    write_state error verify "restart unit not allowed: $unit" "$version"
    log "restart unit not allowed: $unit"; exit 1
  fi
  if [ "$enable" = "1" ]; then
    case "$target" in "$SYSTEMD_DIR"/*.service) ENABLE_WANTED+=("$name");; esac
  fi
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

# Files this updater does not know: fine only when the manifest also brings a
# newer updater (which may know them); it is re-run at the end. Otherwise refuse
# before anything is touched.
REEXEC=0
if [ "${#UNKNOWN_NAMES[@]}" -gt 0 ]; then
  if [ -z "${CALVIN_UPDATE_REEXEC:-}" ] && [[ " ${CHANGED_NAME[*]:-} " == *" update-kiosk.sh "* ]]; then
    REEXEC=1
    log "manifest has files this updater does not know (${UNKNOWN_NAMES[*]}); the new updater will install them"
  else
    write_state error verify "not a bundle file: ${UNKNOWN_NAMES[*]}" "$version"
    log "not a bundle file: ${UNKNOWN_NAMES[*]}"; exit 1
  fi
fi

# Units that should be enabled but are not (e.g. an enable that failed on an
# earlier run). Units installed fresh by this run are handled separately.
reenable_units() {
  local u
  for u in "${ENABLE_WANTED[@]:-}"; do
    [ -n "$u" ] || continue
    if unit_suppressed "$u"; then continue; fi   # the other display stack's compositor
    [[ " ${NEW_ENABLE_UNITS[*]:-} " == *" $u "* ]] && continue
    "$SYSTEMCTL" is-enabled --quiet "$u" 2>/dev/null && continue
    "$SYSTEMCTL" enable "$u" || { log "enable failed: $u"; continue; }
    if [ "$BOOTSTRAP" != 1 ]; then "$SYSTEMCTL" start "$u" || log "start failed: $u"; fi
  done
}

# Hand over to the newly installed updater for the files only it knows.
reexec_new_updater() {
  rm -rf "$STAGE"; trap - EXIT
  local args=()
  [ "$BOOTSTRAP" = 1 ] && args=(--bootstrap)
  log "re-running the new updater"
  CALVIN_UPDATE_REEXEC=1 exec bash "$BIN_DIR/update-kiosk.sh" "${args[@]}"
}

while IFS=$'\t' read -r rname rtarget _renable; do
  [ -n "$rname" ] || continue
  case "$ALL_NAMES" in *" $rname "*) : ;; *) DROPPED_TARGETS+=("$rtarget") ;; esac
done < <(read_receipt_tsv)

if [ "${#CHANGED_NAME[@]}" -eq 0 ] && [ "${#DROPPED_TARGETS[@]}" -eq 0 ]; then
  reenable_units
  restart_kiosk_for_flags
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
  mkdir -p "$(dirname "$t")"   # e.g. /home/calvin/.config/labwc on an X11 kiosk
  install -m "${CHANGED_MODE[$i]}" "$s" "$t"    # replace via new inode (safe over a running script) + mode
done
[ "$unit_changed" = 1 ] && "$SYSTEMCTL" daemon-reload || true

# Restart changed units, except the other display stack's compositor: restarting
# calvin-x.service on a Wayland kiosk would stop labwc (they Conflict), and the
# converse would drop the X session.
restart_all() {
  local u
  for u in "${!RESTART_UNITS[@]}"; do
    if unit_suppressed "$u"; then log "not restarting $u (other display stack)"; continue; fi
    "$SYSTEMCTL" restart "$u"
  done
}
enable_units() { for u in "$@"; do unit_suppressed "$u" && continue; "$SYSTEMCTL" enable "$u" || log "enable failed: $u"; done; }
start_units()  { for u in "$@"; do unit_suppressed "$u" && continue; "$SYSTEMCTL" start  "$u" || log "start failed: $u";  done; }

if [ "$BOOTSTRAP" = 1 ]; then
  # First-boot install: enable boot units; no restart, health, rollback, or decommission.
  if [ "${#NEW_ENABLE_UNITS[@]}" -gt 0 ]; then
    enable_units "${NEW_ENABLE_UNITS[@]}"
  fi
  reenable_units
  [ "$REEXEC" = 1 ] && reexec_new_updater
  write_version "$version"
  write_receipt
  write_state success bootstrap "installed ${version}" "$version"
  log "bootstrap: installed ${version}"
  exit 0
fi

decommission_drops() {
  local removed_unit=0 t base
  for t in "${DROPPED_TARGETS[@]:-}"; do
    [ -n "$t" ] || continue
    if ! path_allowed "$t"; then
      log "refusing to decommission out-of-allowlist path: $t"; continue
    fi
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
restart_all
# A recomputed Chromium flag only takes effect when the kiosk unit restarts.
restart_kiosk_for_flags

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

reenable_units

if [ "${#DROPPED_TARGETS[@]}" -gt 0 ]; then
  decommission_drops
fi

[ "$REEXEC" = 1 ] && reexec_new_updater

write_version "$version"
write_receipt
write_state success complete "updated to ${version}" "$version"
log "updated to ${version}"
