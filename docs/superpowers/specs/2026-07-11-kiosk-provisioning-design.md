# Zero-touch kiosk provisioning — design

**Date:** 2026-07-11
**Status:** Draft (awaiting review)
**Related:** dd9 epic (per-kiosk settings model), dd9.2 (kiosk identity), `scripts/setup-kiosk.sh`, Deployment Topologies Mode B

## Problem

Bringing a new Mode-B kiosk online today means: flash Raspberry Pi OS,
sort out headless wifi + SSH + hostname, SSH in, and hand-type
`sudo bash scripts/setup-kiosk.sh --backend-url http://…`. Three distinct
frictions, confirmed with the requester:

1. **Flashing / first boot** — headless wifi, SSH, hostname, all manual.
2. **Typing config per-Pi** — SSH in and hand-type the backend URL.
3. **Non-technical setup** — the person bringing a kiosk online may not be
   comfortable with SSH/CLI at all.

Explicitly **not** a goal: reproducibility at large scale (this is a handful
of kiosks, not dozens), and runtime backend discovery (mDNS). The backend URL
is known when the card is prepared, and should be baked in so first boot is
zero-touch.

## Goal

After a technical person prepares a card, a non-technical person should be able
to **plug in power and nothing else** and end up at a running kiosk pointed at
the right backend, with a stable `CALVIN_KIOSK_ID`. No SSH, no per-Pi typing on
the device.

## Relationship to the client-handling / dd9 work

The `feature/client-arch` settings rearchitecture (now in develop) and the dd9
epic (server-side per-kiosk config store, merged `/api/config`, per-kiosk
content assignment) are **complementary, not conflicting**. Provisioning's job
is to get a Pi onto wifi and pointed at a backend with a stable
`CALVIN_KIOSK_ID` in `/etc/default/calvin-kiosk`. That identity + backend URL is
exactly the foundation the dd9 config model consumes via
`/api/config?kiosk=<id>`. This design deliberately establishes only that
foundation and reuses the existing `setup-kiosk.sh` for everything else.

## Approaches considered

1. **`firstrun.sh` generator + Raspberry Pi Imager (chosen).** A small
   generator produces a first-boot bundle that stages wifi/hostname/SSH and then
   runs the existing `setup-kiosk.sh` unattended. No image to build or host;
   uses the OS's official first-boot mechanism; composes with `setup-kiosk.sh`.
2. **Local image-bake script.** Download RPi OS Lite, inject the firstrun hook,
   emit a ready-to-flash `calvin-kiosk.img`. Most non-technical *final* step
   (flash one img, boot), but the most machinery to build and maintain
   (loopback mounts, a Linux host to run it, large artifacts). Deferred — a
   natural later upgrade if the boot-partition file copy proves too much.
3. **Document Imager + the existing one-liner.** Zero new code, but still
   requires SSH + typing the URL — under-delivers on all three named frictions.

### Correction on mechanism

An earlier framing assumed Raspberry Pi OS's `custom.toml` could run
`setup-kiosk.sh`. It cannot — `custom.toml` only covers wifi/hostname/SSH/locale
and runs no arbitrary scripts. The mechanism that runs commands on first boot is
`firstrun.sh` triggered from `cmdline.txt` (`systemd.run=…`). This design uses a
**single** first-boot mechanism (`firstrun.sh`) and does not mix in `custom.toml`,
to avoid two first-boot flows racing to reboot.

There is a real ordering subtlety: `firstrun.sh` runs before networking is up,
but `setup-kiosk.sh` needs the network (apt, git, curl). So `firstrun.sh` only
*stages* offline config and enables a one-shot service that runs
`setup-kiosk.sh` **after** `network-online.target`.

## Components

### 1. `scripts/bake-kiosk-firstrun.sh` (new)

The generator. A technical person runs it once per site against a freshly
flashed card's boot partition:

```bash
sudo bash scripts/bake-kiosk-firstrun.sh \
  --backend-url http://homeserver.local:8000 \
  --wifi-ssid HomeNet --wifi-psk secret --wifi-country SE \
  --hostname kitchen \
  --ssh-pubkey ~/.ssh/id_ed25519.pub \
  --boot-dir /media/$USER/bootfs
```

It writes onto the boot partition:

- a generated **`firstrun.sh`**, and
- a one-line append to **`cmdline.txt`**
  (`systemd.run=… systemd.run_success_action=reboot systemd.unit=kernel-command-line.target`).

Reuses `setup-common.sh` helpers (`upsert_env_value`, logging) so there is one
source of truth for how `/etc/default/calvin-kiosk` is shaped.

### 2. Generated `firstrun.sh` (offline staging only)

Runs on **boot 1**, before networking:

- Sets hostname.
- Writes a NetworkManager keyfile for wifi (Bookworm-native,
  `/etc/NetworkManager/system-connections/…nmconnection`, `chmod 600`).
- Enables SSH; installs the provided `--ssh-pubkey` (key-only; no password).
- Seeds `/etc/default/calvin-kiosk` with `CALVIN_BACKEND_URL` using the same
  env-file shape as `setup-kiosk.sh`'s `install_kiosk_config`.
- Installs and enables **`calvin-kiosk-firstboot.service`**.
- Removes its own `cmdline.txt` hook so it never re-runs, then reboots.

### 3. `calvin-kiosk-firstboot.service` + wrapper (new, under `deploy/`)

A oneshot unit, `After=network-online.target` / `Wants=network-online.target`.
Runs on **boot 2**, once the network is up:

- Invokes the existing `setup-kiosk.sh --backend-url <seeded url>`.
- On success: writes a sentinel, `systemctl disable`s itself, reboots into the
  kiosk.
- On failure: leaves logs in `journalctl -u calvin-kiosk-firstboot`; SSH is
  already enabled for recovery; the sentinel is not written so a manual re-run
  is possible.

## Data flow

```
bake script  →  writes firstrun.sh + cmdline.txt hook onto boot partition
   │
boot 1 (firstrun.sh, no network): hostname + wifi + ssh + seed env
         + enable firstboot service, remove cmdline hook  →  reboot
   │
boot 2 (network up): firstboot service runs setup-kiosk.sh
         → installs X/openbox/chromium + calvin-* units → reboot
   │
boot 3: kiosk is live, registered at /api/config?kiosk=<CALVIN_KIOSK_ID>
```

The non-technical person only ever plugs in power.

## Reuse / boundaries

- The bake script and firstboot wrapper are **thin**: they get the card to the
  point where the existing, tested `setup-kiosk.sh` runs unattended. No
  provisioning logic is duplicated.
- Kiosk identity (dd9.2), the display-power agent, and rotation all come along
  for free because they already live in `setup-kiosk.sh`.

## Error handling

**Bake script validates:**

- `--backend-url` matches `^https?://` (same check as `setup-kiosk.sh`).
- `--boot-dir` exists and looks like a boot partition (contains `cmdline.txt`).
- `--wifi-country` is present when wifi is requested (regulatory domain —
  otherwise wifi silently fails to associate).
- Refuses to append the `cmdline.txt` hook twice (idempotent re-runs).

**Firstboot service:** idempotent via sentinel; failures are recoverable over
the already-enabled SSH.

## Testing

`bats` tests for `bake-kiosk-firstrun.sh`, mirroring the existing
`scripts/tests/` pattern — all at the filesystem level, no real Pi needed:

- Arg validation (missing/invalid `--backend-url`, missing `--boot-dir`, missing
  wifi country).
- Correct files written into a temp "boot-dir".
- `cmdline.txt` hook appended exactly once across repeated runs.
- Generated `firstrun.sh` seeds the env file with the right URL/hostname and
  installs the SSH key.

## Docs

- New **`docs/setup/KIOSK_PROVISIONING.md`** — flash → bake → boot walkthrough.
- Link it from `DEPLOYMENT_TOPOLOGIES.md` (Mode B) and `SETUP_SCRIPTS.md`.

## Resolved decisions

- **Wifi optional.** If the operator uses Imager's own wifi UI, `--wifi-*` may be
  omitted; the bake script then only stages the setup trigger.
- **SSH key-only.** Default is `--ssh-pubkey` (no password), since these are
  headless devices.

## Out of scope

- Full prebaked/hosted `.img` (Approach 2) — deferred.
- Runtime backend discovery via mDNS — the URL is known at flash time.
- Large-scale fleet imaging.
- Any change to the dd9 per-kiosk config store; this only establishes the
  identity + backend URL it builds on.
