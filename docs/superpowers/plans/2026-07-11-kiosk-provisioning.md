# Zero-touch Kiosk Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a technical person prepare a Raspberry Pi card once so a non-technical person can plug in power and reach a running Calvin kiosk — no SSH, no per-Pi typing.

**Architecture:** A new generator, `scripts/bake-kiosk-firstrun.sh`, writes a `firstrun.sh` + `cmdline.txt` hook onto a freshly-flashed card's boot partition. On boot 1 (offline) `firstrun.sh` stages hostname/wifi/SSH, seeds `/etc/default/calvin-kiosk`, and enables a oneshot `calvin-kiosk-firstboot.service`. On boot 2 (network up) that service runs the existing, tested `setup-kiosk.sh` unattended, then reboots into the kiosk. The bake script and firstboot pieces are *thin*: they only get the card to the point `setup-kiosk.sh` takes over.

**Tech Stack:** Bash (POSIX-leaning), systemd, NetworkManager keyfiles, Raspberry Pi OS Bookworm first-boot mechanism (`systemd.run` from `cmdline.txt`), plain-bash tests (`scripts/tests/test_*.sh`).

## Global Constraints

- Target OS: **Raspberry Pi OS Bookworm** (64-bit Lite), flashed **clean** — the operator must NOT use Raspberry Pi Imager's OS-customization (it writes its own `firstrun.sh`/`cmdline.txt` and would collide). This is a documentation requirement enforced in the walkthrough.
- Bash scripts start with `set -euo pipefail`.
- New scripts that expose functions for testing carry the `--source-only` guard exactly as `scripts/setup-kiosk.sh` does (early `return 0` when sourced).
- Reuse `scripts/setup-common.sh` helpers (`log`, `log_warn`, `upsert_env_value`, `install_systemd_service`, `enable_systemd_service`, `check_root`) — do not re-implement them.
- The backend URL must match `^https?://` (same check as `setup-kiosk.sh`).
- Boot-partition runtime path on Bookworm is `/boot/firmware`; the bake script writes to the host mount point passed via `--boot-dir`.
- Default repo/branch: `https://github.com/osterbergsimon/calvin.git` / `main`.
- Plain-bash tests live in `scripts/tests/test_*.sh`, exit non-zero on failure, print `PASS` on success, and are picked up by the existing CI `Run scripts/tests/*.sh` step — no CI change needed.

---

### Task 1: `install_authorized_key` helper + SSH-key seeding in `setup-kiosk.sh`

A clean Bookworm image has no user to SSH into. `setup-kiosk.sh` creates the `calvin` user; this task lets it install a baked public key for that user so the kiosk is reachable for recovery. The key travels in `/etc/default/calvin-kiosk` as `CALVIN_KIOSK_SSH_PUBKEY`.

**Files:**
- Modify: `scripts/setup-common.sh` (add `install_authorized_key`)
- Modify: `scripts/setup-kiosk.sh` (call it after `ensure_user_exists`)
- Test: `scripts/tests/test_install_authorized_key.sh` (new)

**Interfaces:**
- Produces: `install_authorized_key <user> <pubkey_string>` — creates `~<user>/.ssh` (0700), appends `<pubkey_string>` to `authorized_keys` (0600) if not already present, `chown`s to the user. No-op on empty pubkey. Honors `CALVIN_HOME_OVERRIDE` (test hook) for the home directory root.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_install_authorized_key.sh`:

```bash
#!/usr/bin/env bash
# Verifies install_authorized_key() appends a key once, idempotently.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../setup-common.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export CALVIN_HOME_OVERRIDE="$tmp"
mkdir -p "$tmp/tester"

KEY="ssh-ed25519 AAAAC3NzaC1lZDI1 test@host"

# Empty key is a no-op (no file created).
install_authorized_key tester ""
[ ! -e "$tmp/tester/.ssh/authorized_keys" ] || { echo "FAIL: empty key wrote a file"; exit 1; }

# First install writes the key with 0600.
install_authorized_key tester "$KEY"
grep -qF "$KEY" "$tmp/tester/.ssh/authorized_keys" || { echo "FAIL: key not written"; exit 1; }
perms="$(stat -c '%a' "$tmp/tester/.ssh/authorized_keys")"
[ "$perms" = "600" ] || { echo "FAIL: bad perms: $perms"; exit 1; }

# Second install is idempotent (no duplicate line).
install_authorized_key tester "$KEY"
count="$(grep -cF "$KEY" "$tmp/tester/.ssh/authorized_keys")"
[ "$count" = "1" ] || { echo "FAIL: duplicated key ($count)"; exit 1; }

echo "PASS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test_install_authorized_key.sh`
Expected: FAIL — `install_authorized_key: command not found` (function not defined yet).

- [ ] **Step 3: Add the helper to `setup-common.sh`**

Add near the other install helpers (after `install_script`, around line 486):

```bash
# Install a single authorized SSH public key for a user, idempotently.
# CALVIN_HOME_OVERRIDE lets tests point the home root at a temp dir.
install_authorized_key() {
    local user="$1"
    local pubkey="$2"
    [ -n "${pubkey}" ] || return 0

    local home_root="${CALVIN_HOME_OVERRIDE:-/home}"
    local ssh_dir="${home_root}/${user}/.ssh"
    local auth="${ssh_dir}/authorized_keys"

    mkdir -p "${ssh_dir}"
    chmod 700 "${ssh_dir}"
    touch "${auth}"
    if ! grep -qF "${pubkey}" "${auth}"; then
        printf '%s\n' "${pubkey}" >> "${auth}"
    fi
    chmod 600 "${auth}"
    # chown only when the target user actually exists (skipped in tests).
    if id "${user}" >/dev/null 2>&1 && [ -z "${CALVIN_HOME_OVERRIDE:-}" ]; then
        chown -R "${user}:${user}" "${ssh_dir}"
    fi
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/tests/test_install_authorized_key.sh`
Expected: PASS

- [ ] **Step 5: Wire it into `setup-kiosk.sh`**

In `scripts/setup-kiosk.sh`, inside `main()`, immediately after the existing `ensure_user_exists "${CALVIN_USER}"` line, add:

```bash
    # A baked SSH key (from firstrun seeding) makes the kiosk reachable for
    # recovery; CALVIN_KIOSK_SSH_PUBKEY is read from /etc/default/calvin-kiosk.
    if [ -f /etc/default/calvin-kiosk ]; then
        # shellcheck disable=SC1091
        . /etc/default/calvin-kiosk
    fi
    install_authorized_key "${CALVIN_USER}" "${CALVIN_KIOSK_SSH_PUBKEY:-}"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-common.sh scripts/setup-kiosk.sh scripts/tests/test_install_authorized_key.sh
git commit -m "feat(kiosk): install_authorized_key helper + seed SSH key in setup-kiosk"
```

---

### Task 2: Firstboot oneshot service + wrapper

The wrapper runs on boot 2 after networking, fetches and runs `setup-kiosk.sh` with the seeded backend URL, then makes itself idempotent and reboots. Both files live in the repo (reviewable, maintained) and are embedded into `firstrun.sh` by the bake script in Task 4.

**Files:**
- Create: `deploy/kiosk-agent/calvin-kiosk-firstboot.sh`
- Create: `deploy/systemd/calvin-kiosk-firstboot.service`
- Test: `scripts/tests/test_firstboot_wrapper.sh` (new)

**Interfaces:**
- Consumes (from `/etc/default/calvin-kiosk`, seeded in Task 4): `CALVIN_BACKEND_URL`, `CALVIN_SETUP_KIOSK_URL`.
- Produces: a sentinel at `${CALVIN_FIRSTBOOT_SENTINEL:-/var/lib/calvin/firstboot.done}`; on repeat runs it exits 0 without acting.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_firstboot_wrapper.sh`:

```bash
#!/usr/bin/env bash
# Verifies the firstboot wrapper runs setup once, is idempotent, and reboots.
set -euo pipefail

WRAPPER="$(dirname "$0")/../../deploy/kiosk-agent/calvin-kiosk-firstboot.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Mock curl, bash-target, systemctl on PATH; record their invocations.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
echo "echo CURL_RAN >> '$tmp/curl.log'"
EOF
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "systemctl \$*" >> "$tmp/systemctl.log"
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/systemctl"
export PATH="$tmp/bin:$PATH"

export CALVIN_FIRSTBOOT_SENTINEL="$tmp/firstboot.done"
export CALVIN_KIOSK_ENV_FILE="$tmp/calvin-kiosk"
cat > "$CALVIN_KIOSK_ENV_FILE" <<EOF
CALVIN_BACKEND_URL=http://homeserver.local:8000
CALVIN_SETUP_KIOSK_URL=https://raw.example/setup-kiosk.sh
EOF

# First run: curl piped to bash executes the mock's echoed command.
bash "$WRAPPER"
[ -f "$tmp/curl.log" ] || { echo "FAIL: setup script not fetched/run"; exit 1; }
[ -f "$CALVIN_FIRSTBOOT_SENTINEL" ] || { echo "FAIL: sentinel not written"; exit 1; }
grep -q "reboot" "$tmp/systemctl.log" || { echo "FAIL: no reboot requested"; exit 1; }

# Second run: sentinel present => no new curl, exits 0.
rm -f "$tmp/curl.log"
bash "$WRAPPER"
[ ! -f "$tmp/curl.log" ] || { echo "FAIL: not idempotent"; exit 1; }

echo "PASS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test_firstboot_wrapper.sh`
Expected: FAIL — wrapper file does not exist yet.

- [ ] **Step 3: Write the wrapper**

Create `deploy/kiosk-agent/calvin-kiosk-firstboot.sh`:

```bash
#!/usr/bin/env bash
# Boot-2 oneshot: run setup-kiosk.sh with the seeded backend URL, then reboot.
# Idempotent via a sentinel so a re-run (or a failed reboot) is safe.
set -euo pipefail

SENTINEL="${CALVIN_FIRSTBOOT_SENTINEL:-/var/lib/calvin/firstboot.done}"
ENV_FILE="${CALVIN_KIOSK_ENV_FILE:-/etc/default/calvin-kiosk}"

[ -f "${SENTINEL}" ] && exit 0

if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
fi
: "${CALVIN_BACKEND_URL:?CALVIN_BACKEND_URL not seeded}"
: "${CALVIN_SETUP_KIOSK_URL:?CALVIN_SETUP_KIOSK_URL not seeded}"

curl -fsSL "${CALVIN_SETUP_KIOSK_URL}" | bash -s -- --backend-url "${CALVIN_BACKEND_URL}"

mkdir -p "$(dirname "${SENTINEL}")"
touch "${SENTINEL}"
systemctl disable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true
systemctl reboot
```

- [ ] **Step 4: Write the systemd unit**

Create `deploy/systemd/calvin-kiosk-firstboot.service`:

```ini
[Unit]
Description=Calvin Kiosk First-Boot Provisioning
After=network-online.target
Wants=network-online.target
ConditionPathExists=!/var/lib/calvin/firstboot.done

[Service]
Type=oneshot
ExecStart=/usr/local/bin/calvin-kiosk-firstboot.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal
SyslogIdentifier=calvin-kiosk-firstboot

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/tests/test_firstboot_wrapper.sh`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add deploy/kiosk-agent/calvin-kiosk-firstboot.sh deploy/systemd/calvin-kiosk-firstboot.service scripts/tests/test_firstboot_wrapper.sh
git commit -m "feat(kiosk): firstboot oneshot service + wrapper"
```

---

### Task 3: Bake script — argument parsing & validation

The generator's front door: parse flags, apply defaults, validate. Functions are exposed via the `--source-only` guard for unit testing.

**Files:**
- Create: `scripts/bake-kiosk-firstrun.sh`
- Test: `scripts/tests/test_bake_kiosk_firstrun_args.sh` (new)

**Interfaces:**
- Produces (globals after `parse_args "$@"`): `BACKEND_URL`, `WIFI_SSID`, `WIFI_PSK`, `WIFI_COUNTRY`, `HOSTNAME_ARG`, `SSH_PUBKEY_FILE`, `BOOT_DIR`, `GIT_REPO`, `GIT_BRANCH`.
- Produces: `validate_args` — exits non-zero with a message when `--backend-url` is missing/malformed, `--boot-dir` is missing or lacks `cmdline.txt`, or `--wifi-ssid` is set without `--wifi-country`.
- Produces: `derive_raw_setup_url <repo> <branch>` — prints the raw GitHub URL to `scripts/setup-kiosk.sh`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_bake_kiosk_firstrun_args.sh`:

```bash
#!/usr/bin/env bash
# Verifies bake-kiosk-firstrun.sh argument validation and URL derivation.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
touch "$tmp/cmdline.txt"   # make it look like a boot partition

# Valid: backend url + boot dir.
( parse_args --backend-url http://h.local:8000 --boot-dir "$tmp"; validate_args ) \
    || { echo "FAIL: valid args rejected"; exit 1; }

# Missing backend url => reject.
if ( parse_args --boot-dir "$tmp"; validate_args ) 2>/dev/null; then
    echo "FAIL: missing backend-url accepted"; exit 1; fi

# Malformed backend url => reject.
if ( parse_args --backend-url ftp://x --boot-dir "$tmp"; validate_args ) 2>/dev/null; then
    echo "FAIL: bad scheme accepted"; exit 1; fi

# Boot dir without cmdline.txt => reject.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp/nope"; validate_args ) 2>/dev/null; then
    echo "FAIL: non-boot dir accepted"; exit 1; fi

# Wifi ssid without country => reject.
if ( parse_args --backend-url http://h:8000 --boot-dir "$tmp" --wifi-ssid Net; validate_args ) 2>/dev/null; then
    echo "FAIL: wifi without country accepted"; exit 1; fi

# URL derivation from a .git repo.
got="$(derive_raw_setup_url https://github.com/osterbergsimon/calvin.git develop)"
want="https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-kiosk.sh"
[ "$got" = "$want" ] || { echo "FAIL: bad raw url: $got"; exit 1; }

echo "PASS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_args.sh`
Expected: FAIL — script file does not exist.

- [ ] **Step 3: Write the script skeleton**

Create `scripts/bake-kiosk-firstrun.sh`:

```bash
#!/usr/bin/env bash
# Calvin — bake a first-boot bundle onto a freshly-flashed Raspberry Pi card.
#
# Writes firstrun.sh + a cmdline.txt hook onto the card's boot partition so the
# Pi self-provisions into a Calvin kiosk on first boot: no SSH, no per-Pi typing.
# Flash a CLEAN Raspberry Pi OS Bookworm image (do NOT use Imager's OS
# customization — it writes its own firstrun.sh and would collide).
set -euo pipefail

_CALVIN_SOURCE_ONLY=0
for _arg in "$@"; do
    [ "$_arg" = "--source-only" ] && _CALVIN_SOURCE_ONLY=1
done

DEFAULT_GIT_REPO="https://github.com/osterbergsimon/calvin.git"
DEFAULT_GIT_BRANCH="main"

BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""
GIT_REPO="${GIT_REPO:-$DEFAULT_GIT_REPO}"; GIT_BRANCH="${GIT_BRANCH:-$DEFAULT_GIT_BRANCH}"

usage() {
    cat <<EOF
Usage: bake-kiosk-firstrun.sh --backend-url <URL> --boot-dir <PATH> [options]

Required:
  --backend-url <URL>   Calvin backend, e.g. http://homeserver.local:8000
  --boot-dir <PATH>     Mount point of the flashed card's boot partition
                        (contains cmdline.txt), e.g. /media/\$USER/bootfs

Options:
  --hostname <NAME>     Kiosk hostname (e.g. kitchen)
  --wifi-ssid <SSID>    Wifi network name (requires --wifi-country)
  --wifi-psk <PSK>      Wifi passphrase
  --wifi-country <CC>   Wifi regulatory domain, e.g. SE (required with wifi)
  --ssh-pubkey <FILE>   Public key to install for the calvin user
  --git-repo <URL>      Override Calvin repo (default: $DEFAULT_GIT_REPO)
  --git-branch <NAME>   Override branch (default: $DEFAULT_GIT_BRANCH)
EOF
}

parse_args() {
    # Reset flag-driven globals so repeated calls (and tests) don't accumulate.
    BACKEND_URL=""; WIFI_SSID=""; WIFI_PSK=""; WIFI_COUNTRY=""
    HOSTNAME_ARG=""; SSH_PUBKEY_FILE=""; BOOT_DIR=""
    GIT_REPO="${DEFAULT_GIT_REPO}"; GIT_BRANCH="${DEFAULT_GIT_BRANCH}"
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --backend-url) BACKEND_URL="${2:-}"; shift 2 ;;
            --backend-url=*) BACKEND_URL="${1#*=}"; shift ;;
            --boot-dir) BOOT_DIR="${2:-}"; shift 2 ;;
            --boot-dir=*) BOOT_DIR="${1#*=}"; shift ;;
            --hostname) HOSTNAME_ARG="${2:-}"; shift 2 ;;
            --hostname=*) HOSTNAME_ARG="${1#*=}"; shift ;;
            --wifi-ssid) WIFI_SSID="${2:-}"; shift 2 ;;
            --wifi-ssid=*) WIFI_SSID="${1#*=}"; shift ;;
            --wifi-psk) WIFI_PSK="${2:-}"; shift 2 ;;
            --wifi-psk=*) WIFI_PSK="${1#*=}"; shift ;;
            --wifi-country) WIFI_COUNTRY="${2:-}"; shift 2 ;;
            --wifi-country=*) WIFI_COUNTRY="${1#*=}"; shift ;;
            --ssh-pubkey) SSH_PUBKEY_FILE="${2:-}"; shift 2 ;;
            --ssh-pubkey=*) SSH_PUBKEY_FILE="${1#*=}"; shift ;;
            --git-repo) GIT_REPO="${2:-}"; shift 2 ;;
            --git-repo=*) GIT_REPO="${1#*=}"; shift ;;
            --git-branch) GIT_BRANCH="${2:-}"; shift 2 ;;
            --git-branch=*) GIT_BRANCH="${1#*=}"; shift ;;
            --source-only) shift ;;
            -h|--help) usage; exit 0 ;;
            *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
        esac
    done
}

validate_args() {
    if [ -z "${BACKEND_URL}" ]; then
        echo "Error: --backend-url is required" >&2; return 1; fi
    if ! echo "${BACKEND_URL}" | grep -qE '^https?://'; then
        echo "Error: --backend-url must start with http:// or https:// (got: ${BACKEND_URL})" >&2; return 1; fi
    if [ -z "${BOOT_DIR}" ]; then
        echo "Error: --boot-dir is required" >&2; return 1; fi
    if [ ! -f "${BOOT_DIR}/cmdline.txt" ]; then
        echo "Error: --boot-dir does not look like a boot partition (no cmdline.txt): ${BOOT_DIR}" >&2; return 1; fi
    if [ -n "${WIFI_SSID}" ] && [ -z "${WIFI_COUNTRY}" ]; then
        echo "Error: --wifi-country is required when --wifi-ssid is set" >&2; return 1; fi
    return 0
}

derive_raw_setup_url() {
    local repo="$1" branch="$2" owner name
    owner="$(echo "${repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)$|\1|')"
    name="$(echo "${repo}" | sed -E 's|.*github\.com[:/]([^/]+)/([^/]+)$|\2|' | sed 's|\.git$||')"
    printf 'https://raw.githubusercontent.com/%s/%s/%s/scripts/setup-kiosk.sh\n' "${owner}" "${name}" "${branch}"
}

# Sourced for testing: stop before running main.
[ "${_CALVIN_SOURCE_ONLY}" = "1" ] && return 0 2>/dev/null || true

main() {
    parse_args "$@"
    validate_args
    echo "TODO: generate firstrun.sh (Task 4) and write cmdline hook (Task 5)"
}

main "$@"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_args.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/bake-kiosk-firstrun.sh scripts/tests/test_bake_kiosk_firstrun_args.sh
git commit -m "feat(kiosk): bake-kiosk-firstrun arg parsing + validation"
```

---

### Task 4: Bake script — generate `firstrun.sh`

Emit the boot-1 script. It stages hostname, optional wifi (NetworkManager keyfile), enables SSH, seeds `/etc/default/calvin-kiosk`, and installs+enables the firstboot service/wrapper (embedded from the repo files created in Task 2). It removes its own cmdline hook and reboots.

**Files:**
- Modify: `scripts/bake-kiosk-firstrun.sh` (add `emit_firstrun`)
- Test: `scripts/tests/test_bake_kiosk_firstrun_emit.sh` (new)

**Interfaces:**
- Consumes: the globals from Task 3; the repo files `deploy/kiosk-agent/calvin-kiosk-firstboot.sh` and `deploy/systemd/calvin-kiosk-firstboot.service` (Task 2).
- Produces: `emit_firstrun` — prints a complete `firstrun.sh` to stdout using the current globals and `SCRIPT_DIR` (repo root anchor).

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_bake_kiosk_firstrun_emit.sh`:

```bash
#!/usr/bin/env bash
# Verifies emit_firstrun produces a firstrun.sh with the baked values embedded.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

parse_args \
  --backend-url http://homeserver.local:8000 \
  --boot-dir /tmp --hostname kitchen \
  --wifi-ssid HomeNet --wifi-psk s3cret --wifi-country SE \
  --git-branch develop

out="$(emit_firstrun)"

# Baked values live in the single-quoted values block; the CALVIN_* env lines
# are literal ${VAR} refs that only expand when firstrun runs on the Pi.
echo "$out" | grep -qF "BACKEND_URL='http://homeserver.local:8000'" \
    || { echo "FAIL: backend url not baked"; exit 1; }
echo "$out" | grep -qF "SETUP_KIOSK_URL='https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-kiosk.sh'" \
    || { echo "FAIL: setup url not baked"; exit 1; }
echo "$out" | grep -q '/etc/hostname' || { echo "FAIL: hostname not set"; exit 1; }
echo "$out" | grep -qF "CALVIN_HOSTNAME='kitchen'" || { echo "FAIL: hostname value missing"; exit 1; }
echo "$out" | grep -qF "WIFI_SSID='HomeNet'" || { echo "FAIL: wifi ssid not baked"; exit 1; }
echo "$out" | grep -q 'calvin-kiosk-firstboot.service' || { echo "FAIL: firstboot unit not embedded"; exit 1; }
echo "$out" | grep -q 'calvin-kiosk-firstboot.sh' || { echo "FAIL: firstboot wrapper not embedded"; exit 1; }
echo "$out" | grep -q 'systemd.run' || { echo "FAIL: does not strip its own cmdline hook"; exit 1; }

# Wifi is runtime-guarded, so the block is always present but baked empty when
# no SSID is given.
parse_args --backend-url http://h:8000 --boot-dir /tmp
out2="$(emit_firstrun)"
echo "$out2" | grep -qF "WIFI_SSID=''" || { echo "FAIL: empty wifi not baked"; exit 1; }

echo "PASS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_emit.sh`
Expected: FAIL — `emit_firstrun: command not found`.

- [ ] **Step 3: Add `SCRIPT_DIR` anchor and `emit_firstrun`**

In `scripts/bake-kiosk-firstrun.sh`, add just below the `DEFAULT_GIT_*` constants:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
```

Then add `emit_firstrun` above the source-only guard. It prints firstrun.sh; the outer heredoc is quoted (`'FIRSTRUN_EOF'`) so nothing expands at bake time except where we deliberately close the heredoc to inject baked values:

```bash
emit_firstrun() {
    local setup_url wrapper_src unit_src
    setup_url="$(derive_raw_setup_url "${GIT_REPO}" "${GIT_BRANCH}")"
    wrapper_src="$(cat "${REPO_ROOT}/deploy/kiosk-agent/calvin-kiosk-firstboot.sh")"
    unit_src="$(cat "${REPO_ROOT}/deploy/systemd/calvin-kiosk-firstboot.service")"

    local pubkey=""
    [ -n "${SSH_PUBKEY_FILE}" ] && pubkey="$(cat "${SSH_PUBKEY_FILE}")"

    cat <<'FIRSTRUN_EOF'
#!/bin/bash
# Calvin kiosk first-boot (boot 1, offline). Generated by bake-kiosk-firstrun.sh.
# Stages host/wifi/ssh + seeds config, enables the boot-2 provisioning service,
# then removes its own cmdline hook and reboots.
set -euo pipefail
BOOT_CMDLINE=/boot/firmware/cmdline.txt
ENV_FILE=/etc/default/calvin-kiosk
FIRSTRUN_EOF

    # --- baked values (heredoc closed so these expand now) ---
    cat <<EOF
CALVIN_HOSTNAME='${HOSTNAME_ARG}'
WIFI_SSID='${WIFI_SSID}'
WIFI_PSK='${WIFI_PSK}'
WIFI_COUNTRY='${WIFI_COUNTRY}'
BACKEND_URL='${BACKEND_URL}'
SETUP_KIOSK_URL='${setup_url}'
SSH_PUBKEY='${pubkey}'
EOF

    cat <<'FIRSTRUN_EOF'

# 1. Hostname.
if [ -n "${CALVIN_HOSTNAME}" ]; then
    echo "${CALVIN_HOSTNAME}" > /etc/hostname
    sed -i "s/^127.0.1.1.*/127.0.1.1\t${CALVIN_HOSTNAME}/" /etc/hosts || true
fi

# 2. Wifi (NetworkManager keyfile), only if an SSID was baked.
if [ -n "${WIFI_SSID}" ]; then
    command -v raspi-config >/dev/null 2>&1 && raspi-config nonint do_wifi_country "${WIFI_COUNTRY}" || true
    conn=/etc/NetworkManager/system-connections/CalvinKiosk.nmconnection
    mkdir -p /etc/NetworkManager/system-connections
    cat > "${conn}" <<NMEOF
[connection]
id=CalvinKiosk
type=wifi
autoconnect=true
[wifi]
mode=infrastructure
ssid=${WIFI_SSID}
[wifi-security]
key-mgmt=wpa-psk
psk=${WIFI_PSK}
[ipv4]
method=auto
[ipv6]
method=auto
NMEOF
    chmod 600 "${conn}"
fi

# 3. SSH on for recovery.
systemctl enable ssh >/dev/null 2>&1 || true

# 4. Seed /etc/default/calvin-kiosk for the boot-2 provisioning service.
touch "${ENV_FILE}"; chmod 644 "${ENV_FILE}"
{
    echo "CALVIN_BACKEND_URL=${BACKEND_URL}"
    echo "CALVIN_SETUP_KIOSK_URL=${SETUP_KIOSK_URL}"
    [ -n "${SSH_PUBKEY}" ] && echo "CALVIN_KIOSK_SSH_PUBKEY=${SSH_PUBKEY}"
} > "${ENV_FILE}"

# 5. Install the boot-2 wrapper + oneshot service.
cat > /usr/local/bin/calvin-kiosk-firstboot.sh <<'WRAPPER_EOF'
FIRSTRUN_EOF

    printf '%s\n' "${wrapper_src}"
    cat <<'FIRSTRUN_EOF'
WRAPPER_EOF
chmod 755 /usr/local/bin/calvin-kiosk-firstboot.sh

cat > /etc/systemd/system/calvin-kiosk-firstboot.service <<'UNIT_EOF'
FIRSTRUN_EOF

    printf '%s\n' "${unit_src}"
    cat <<'FIRSTRUN_EOF'
UNIT_EOF
systemctl enable calvin-kiosk-firstboot.service >/dev/null 2>&1 || true

# 6. Remove our own first-boot hook so this never runs again, then reboot.
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=[^ ]*||g' "${BOOT_CMDLINE}" || true
reboot
FIRSTRUN_EOF
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_emit.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/bake-kiosk-firstrun.sh scripts/tests/test_bake_kiosk_firstrun_emit.sh
git commit -m "feat(kiosk): generate firstrun.sh with baked host/wifi/ssh/config"
```

---

### Task 5: Bake script — write firstrun + idempotent `cmdline.txt` hook

Wire `main()` to write `firstrun.sh` into the boot partition and append the `systemd.run` hook to `cmdline.txt` exactly once.

**Files:**
- Modify: `scripts/bake-kiosk-firstrun.sh` (replace the placeholder `main`, add `append_cmdline_hook`)
- Test: `scripts/tests/test_bake_kiosk_firstrun_cmdline.sh` (new)

**Interfaces:**
- Produces: `append_cmdline_hook <cmdline_path>` — appends ` systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target` to the single cmdline line, and is a no-op if the hook is already present.
- Produces: `main` writes `${BOOT_DIR}/firstrun.sh` (0755) from `emit_firstrun` and calls `append_cmdline_hook "${BOOT_DIR}/cmdline.txt"`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_bake_kiosk_firstrun_cmdline.sh`:

```bash
#!/usr/bin/env bash
# Verifies main() writes firstrun.sh and appends the cmdline hook exactly once.
set -euo pipefail

# shellcheck disable=SC1090
source "$(dirname "$0")/../bake-kiosk-firstrun.sh" --source-only 2>/dev/null || true

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf 'console=serial0,115200 root=PARTUUID=abcd rootwait\n' > "$tmp/cmdline.txt"

parse_args --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen
main --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen

[ -f "$tmp/firstrun.sh" ] || { echo "FAIL: firstrun.sh not written"; exit 1; }
[ -x "$tmp/firstrun.sh" ] || { echo "FAIL: firstrun.sh not executable"; exit 1; }
grep -q 'systemd.run=/boot/firmware/firstrun.sh' "$tmp/cmdline.txt" \
    || { echo "FAIL: cmdline hook missing"; exit 1; }
# cmdline.txt must stay a single line.
[ "$(wc -l < "$tmp/cmdline.txt")" -le 1 ] || { echo "FAIL: cmdline became multiline"; exit 1; }

# Re-run must not duplicate the hook.
main --backend-url http://homeserver.local:8000 --boot-dir "$tmp" --hostname kitchen
n="$(grep -o 'systemd.run=/boot/firmware/firstrun.sh' "$tmp/cmdline.txt" | wc -l)"
[ "$n" = "1" ] || { echo "FAIL: hook duplicated ($n)"; exit 1; }

echo "PASS"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_cmdline.sh`
Expected: FAIL — placeholder `main` writes nothing; `firstrun.sh` absent.

- [ ] **Step 3: Add `append_cmdline_hook` and replace `main`**

In `scripts/bake-kiosk-firstrun.sh`, add `append_cmdline_hook` next to `emit_firstrun`:

```bash
CMDLINE_HOOK='systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target'

append_cmdline_hook() {
    local cmdline="$1"
    if grep -q 'systemd.run=/boot/firmware/firstrun.sh' "${cmdline}"; then
        return 0
    fi
    # cmdline.txt must remain a single line: strip the trailing newline,
    # append the hook, restore one newline.
    local content
    content="$(tr -d '\n' < "${cmdline}")"
    printf '%s %s\n' "${content}" "${CMDLINE_HOOK}" > "${cmdline}"
}
```

Replace the placeholder `main` with:

```bash
main() {
    parse_args "$@"
    validate_args
    emit_firstrun > "${BOOT_DIR}/firstrun.sh"
    chmod 755 "${BOOT_DIR}/firstrun.sh"
    append_cmdline_hook "${BOOT_DIR}/cmdline.txt"
    echo "Baked kiosk firstrun into ${BOOT_DIR}."
    echo "Backend: ${BACKEND_URL}"
    [ -n "${HOSTNAME_ARG}" ] && echo "Hostname: ${HOSTNAME_ARG}"
    echo "Eject the card, boot the Pi, and wait — it self-provisions (2 reboots)."
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_cmdline.sh`
Expected: PASS

- [ ] **Step 5: Run the whole script suite**

Run: `for t in scripts/tests/test_*.sh; do echo "== $t"; bash "$t"; done`
Expected: every file prints `PASS`.

- [ ] **Step 6: Commit**

```bash
git add scripts/bake-kiosk-firstrun.sh scripts/tests/test_bake_kiosk_firstrun_cmdline.sh
git commit -m "feat(kiosk): write firstrun + idempotent cmdline hook"
```

---

### Task 6: Documentation

Write the operator walkthrough and link it from the existing setup docs. Update the tests README so the new test files are listed.

**Files:**
- Create: `docs/setup/KIOSK_PROVISIONING.md`
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md` (link from Mode B)
- Modify: `docs/setup/SETUP_SCRIPTS.md` (add a "Zero-touch kiosk provisioning" entry)
- Modify: `scripts/tests/README.md` (list the four new `test_*.sh` files)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the walkthrough**

Create `docs/setup/KIOSK_PROVISIONING.md`:

```markdown
# Zero-touch kiosk provisioning

Prepare a Raspberry Pi card once so a non-technical person can plug in
power and reach a running Calvin kiosk — no SSH, no typing on the Pi.

This is for **Mode B** (remote backend + kiosk Pi). See
[DEPLOYMENT_TOPOLOGIES.md](DEPLOYMENT_TOPOLOGIES.md).

## What you need

- A Raspberry Pi and an SD card / SSD.
- Raspberry Pi Imager.
- The Calvin repo checked out on your workstation (Linux/macOS).
- Your backend URL, e.g. `http://homeserver.local:8000`.

## Step 1 — Flash a CLEAN image

In Raspberry Pi Imager, choose **Raspberry Pi OS Lite (64-bit)** and flash.

> **Important:** Do **not** use Imager's OS-customization (the gear /
> "Edit settings"). Calvin's bake step writes its own first-boot hook, and
> Imager's customization writes a competing one. Flash a clean image.

## Step 2 — Bake the first-boot bundle

Re-insert the flashed card; the boot partition auto-mounts (often
`/media/$USER/bootfs`). From the repo root:

```bash
sudo bash scripts/bake-kiosk-firstrun.sh \
  --backend-url http://homeserver.local:8000 \
  --hostname kitchen \
  --wifi-ssid HomeNet --wifi-psk 's3cret' --wifi-country SE \
  --ssh-pubkey ~/.ssh/id_ed25519.pub \
  --boot-dir /media/$USER/bootfs
```

Only `--backend-url` and `--boot-dir` are required. Omit `--wifi-*` if the
Pi is on Ethernet. `--ssh-pubkey` installs a recovery key for the `calvin`
user. `--git-branch develop` targets a non-default branch.

Eject the card.

## Step 3 — Boot

Put the card in the Pi and power on. It self-provisions unattended:

1. **Boot 1** — sets hostname + wifi + SSH, seeds config, reboots.
2. **Boot 2** — once online, runs `setup-kiosk.sh` (installs X, openbox,
   Chromium, the Calvin services), reboots.
3. **Boot 3** — Chromium opens the dashboard.

First provisioning takes several minutes (package installs). Watch progress
over SSH if you baked a key: `journalctl -u calvin-kiosk-firstboot -f`.

## After provisioning

The kiosk behaves exactly like one set up by hand with `setup-kiosk.sh`:
stable `CALVIN_KIOSK_ID`, display-power agent, rotation via
`/etc/default/calvin-kiosk`. See the [kiosk identity](DEPLOYMENT_TOPOLOGIES.md#kiosk-identity)
section to rename it.

## Troubleshooting

- **Nothing happens on first boot:** confirm you flashed a *clean* image
  (no Imager customization) and that `cmdline.txt` on the card contains
  `systemd.run=/boot/firmware/firstrun.sh`.
- **Wifi doesn't connect:** check `--wifi-country` was set (regulatory
  domain) and the PSK is correct.
- **Provisioning failed:** SSH in (if you baked a key) and read
  `journalctl -u calvin-kiosk-firstboot`. Fix, then
  `sudo rm /var/lib/calvin/firstboot.done && sudo systemctl start calvin-kiosk-firstboot`.
```

- [ ] **Step 2: Link from `DEPLOYMENT_TOPOLOGIES.md`**

In `docs/setup/DEPLOYMENT_TOPOLOGIES.md`, under the **Mode B** "### Setup"
section, immediately after the `**2. Pi.**` paragraph that shows
`setup-kiosk.sh`, add:

```markdown
> **Zero-touch alternative:** instead of SSHing in to run `setup-kiosk.sh`
> by hand, you can bake the backend URL + wifi into the card before first
> boot so the Pi self-provisions. See
> [KIOSK_PROVISIONING.md](KIOSK_PROVISIONING.md).
```

- [ ] **Step 3: Add an entry to `SETUP_SCRIPTS.md`**

In `docs/setup/SETUP_SCRIPTS.md`, under "## Available Scripts", after the
kiosk-related content, add:

```markdown
### Zero-touch Kiosk Provisioning (`scripts/bake-kiosk-firstrun.sh`)

**Purpose:** Bake a first-boot bundle onto a freshly-flashed card so a Pi
self-provisions into a Mode-B kiosk with no SSH and no per-Pi typing.

**Usage:**

```bash
sudo bash scripts/bake-kiosk-firstrun.sh \
  --backend-url http://homeserver.local:8000 \
  --wifi-ssid HomeNet --wifi-psk 's3cret' --wifi-country SE \
  --hostname kitchen \
  --boot-dir /media/$USER/bootfs
```

Full walkthrough: [KIOSK_PROVISIONING.md](KIOSK_PROVISIONING.md).
```

- [ ] **Step 4: Update the tests README**

In `scripts/tests/README.md`, under "## Test Structure", add these bullets to
the list of `test_*.sh` files:

```markdown
- `test_install_authorized_key.sh` - Verifies `install_authorized_key()` appends an SSH key once, idempotently, with 0600 perms
- `test_firstboot_wrapper.sh` - Verifies the boot-2 firstboot wrapper runs setup once, is idempotent via a sentinel, and reboots
- `test_bake_kiosk_firstrun_args.sh` - Verifies `bake-kiosk-firstrun.sh` argument validation and raw-URL derivation
- `test_bake_kiosk_firstrun_emit.sh` - Verifies `emit_firstrun` bakes host/wifi/ssh/config into the generated `firstrun.sh`
- `test_bake_kiosk_firstrun_cmdline.sh` - Verifies `main()` writes `firstrun.sh` and appends the `cmdline.txt` hook exactly once
```

- [ ] **Step 5: Commit**

```bash
git add docs/setup/KIOSK_PROVISIONING.md docs/setup/DEPLOYMENT_TOPOLOGIES.md docs/setup/SETUP_SCRIPTS.md scripts/tests/README.md
git commit -m "docs(kiosk): zero-touch provisioning walkthrough + links"
```

---

## Final verification

- [ ] Run the full plain-bash suite: `for t in scripts/tests/test_*.sh; do echo "== $t"; bash "$t" || exit 1; done` — all print `PASS`.
- [ ] `shellcheck scripts/bake-kiosk-firstrun.sh deploy/kiosk-agent/calvin-kiosk-firstboot.sh` is clean (or only pre-existing/ignored warnings).
- [ ] Manual (optional, needs hardware): flash a clean Bookworm Lite image, bake against its boot partition, boot a Pi, confirm it reaches the dashboard after the two reboots.
