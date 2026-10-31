# Install a kiosk Pi: fresh SD card to Calvin on screen

This is the short path for **Mode B**: the Calvin server runs elsewhere (Unraid, or any
Docker host), and the Raspberry Pi is only a display. See
[DEPLOYMENT_TOPOLOGIES.md](DEPLOYMENT_TOPOLOGIES.md) for the background.

Your Calvin server hands out everything the Pi needs. You don't need a repo checkout on
the Pi, and nothing comes from GitHub, so the kiosk always matches the server's version.

## Supported hardware and OS

| | Supported | Notes |
|---|---|---|
| **Pi model** | Raspberry Pi 5, Pi 4 (2 GB+), Pi 400 | Recommended. |
| | Pi 3B / 3B+ | Auto-installs **cog** (WPE WebKit) instead of Chromium; see [Display stack](#display-stack-cog-on-pi-3-class-wayland-opt-in). |
| | Pi Zero 2 W | Uses cog (WPE WebKit) via auto; still unmeasured on 512 MB, so not recommended yet. |
| | Older Pis (Pi 1/2, Zero) | Not supported (too little RAM for the dashboard). |
| **OS** | **Raspberry Pi OS Lite (64-bit), Trixie** (Debian 13) | Verified on a Pi 3B+ with the cog stack (2026-10-31); Pi 4/5 Wayland test pending. |
| | Raspberry Pi OS Lite (64-bit), Bookworm (Debian 12) | Should work; 64-bit is preferred. |
| | Raspberry Pi OS Lite 32-bit, Bookworm | Should work; 64-bit is preferred. |
| | Raspberry Pi OS **Desktop** | Not supported: Calvin starts its own X session on tty1, which conflicts with the desktop. |

You need a reachable Calvin server. Check from any machine on the LAN with
`curl http://<server>:8000/api/health`. Use a stable hostname or IP for the server,
such as a DHCP reservation or `tower.local`.

## Step 0: get the signing key from the server (recommended)

The server signs the kiosk software it serves. When you give the Pi the server's key,
the Pi rejects anything another device on your network might try to slip in. That
covers the setup scripts, the kiosk agent, and every later update. Copy the key
**over a trusted channel** (your own SSH/terminal access to the server), never over
plain HTTP. The server creates it on first start:

| Server | Where the key is |
|---|---|
| Unraid (template) | `/mnt/user/appdata/calvin/kiosk-signing.key` (Unraid web terminal or SSH as root) |
| Docker compose | `${CALVIN_DATA_DIR:-/var/lib/calvin}/kiosk-signing.key` on the host, or `docker exec calvin cat /var/lib/calvin/kiosk-signing.key` |
| Source checkout | the path logged at startup: `Kiosk manifest signing key: …` |

The file is one line of 64 hex characters. It sits in the server's data volume, so it
survives container updates.

You can skip the key. The kiosk still works, but then it trusts whatever answers at the
server's address on your LAN.

## Option A: install over SSH on a running Pi

1. **Flash.** In Raspberry Pi Imager, pick **Raspberry Pi OS Lite (64-bit)**. Using
   Imager's OS customisation is fine here: set a hostname (e.g. `kitchen`), a user,
   Wi-Fi, and **enable SSH**. Boot the Pi.
2. **Install**, using one of these two ways:

   **Signed (recommended).** Run this from your workstation. It copies the key *and* the
   installer from the server to the Pi over SSH, so nothing that touches the key comes
   over plain HTTP:

   ```bash
   SERVER=tower PI=<user>@kitchen.local
   ssh root@$SERVER cat /mnt/user/appdata/calvin/kiosk-signing.key \
     | ssh $PI 'umask 077; cat > calvin.key'
   ssh root@$SERVER docker exec Calvin cat /app/kiosk-bundle/deploy/kiosk-agent/install-kiosk.sh \
     | ssh $PI 'cat > install-kiosk.sh'
   ssh -t $PI "sudo bash install-kiosk.sh --backend-url http://$SERVER:8000 \
     --signing-key-file calvin.key --no-reboot && rm calvin.key && sudo reboot"
   ```

   `Calvin` is the Unraid template's container name; with Docker compose it is
   `calvin`, and the key path is the one from Step 0. You can also copy
   `deploy/kiosk-agent/install-kiosk.sh` from a Calvin checkout. The installer stores
   the key root-only in `/etc/default/calvin-kiosk-signing`, but only after the
   server's signature has proved the key is correct.

   **Quick (trusts your LAN).** On the Pi, run:

   ```bash
   curl -fsSL http://tower:8000/api/kiosks/install.sh | sudo bash
   ```

   **Do not add the signing key to this form.** The script arrives over plain HTTP, and
   a tampered copy could steal the key.

   Either way, the install takes a few minutes, mostly package installs, and the Pi
   then reboots.
3. **Done.** After the reboot the Pi starts Chromium in kiosk mode on the dashboard.
   Within a minute it appears in **Settings → Screens** on the server.

The quick form bakes in the URL the server saw the request on. Behind a reverse proxy
that can be an internal or `http://` address. If the Pi should use a different URL, add
`-s -- --backend-url http://<server>:8000`.

## Option B: bake the SD card (no SSH, no typing on the Pi)

Use this for several Pis, or for a Pi you hand to someone else. You need a Calvin
checkout on your workstation (Linux/macOS) at the release you run on the server
(a `vX.Y.Z` tag; `develop` is fine for testing).

1. Flash **Raspberry Pi OS Lite (64-bit)** with Imager and **do not** use Imager's OS
   customisation (it writes a competing first-boot hook).
2. Re-insert the card, then copy the key to the workstation as above
   (`ssh root@tower cat … > calvin.key; chmod 600 calvin.key`). Then bake:

   ```bash
   sudo bash scripts/bake-kiosk-firstrun.sh \
     --backend-url http://tower:8000 \
     --boot-dir /media/$USER/bootfs \
     --hostname kitchen \
     --wifi-ssid HomeNet --wifi-psk 's3cret' --wifi-country SE \
     --ssh-pubkey ~/.ssh/id_ed25519.pub \
     --signing-key-file calvin.key
   ```

   Omit `--wifi-*` on Ethernet. `--ssh-pubkey` is optional and gives you recovery
   access as `calvin-admin` (key-only, passwordless sudo; `--admin-user` renames it).
3. Put the card in the Pi and power on. It reboots twice by itself and comes up on the
   dashboard. Boot 1 applies the hostname, Wi-Fi and SSH. Boot 2 waits for the server,
   then installs, showing its progress on the screen. Boot 3 is the kiosk.

Details and troubleshooting: [KIOSK_PROVISIONING.md](KIOSK_PROVISIONING.md).

## Pin a release

A kiosk installs the software its **server** serves, so the way to pin a kiosk
to a release is to run the server on that release (see
[SETUP_SCRIPTS.md](SETUP_SCRIPTS.md#installing-a-release-versus-develop)). The
Pi then matches the backend exactly, and **Settings → Screens → Update** moves
with the server.

The install scripts themselves also accept a release tag, which is what you
want when the card is baked from a checkout or `setup-kiosk.sh` is fetched
directly:

```bash
# Kiosk-only install from a release tag (the fallback common script is
# fetched from the same tag)
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/v0.1.0/scripts/setup-kiosk.sh \
  | sudo GIT_BRANCH=v0.1.0 bash -s -- --backend-url http://tower:8000

# Bake a card from a release checkout
git clone --branch v0.1.0 https://github.com/osterbergsimon/calvin.git
cd calvin
sudo bash scripts/bake-kiosk-firstrun.sh --backend-url http://tower:8000 ...
```

`GIT_BRANCH=v0.1.0` pins the scripts and the checkout the server side uses; it
never selects an image for the Pi (a kiosk runs Chromium, not Calvin). The
server container's image tag (`CALVIN_IMAGE_TAG`) is the version that matters,
and `setup.sh` sets it from the same tag.

## What the install does

```text
Pi                                         Calvin server
──                                         ─────────────
install-kiosk.sh (over SSH, piped  ◀──── GET /api/kiosks/install.sh  (server URL baked in)
  from the server, or on the card)
  ├─ store key → /etc/default/calvin-kiosk-signing (0600)
  ├─ fetch manifest, verify HMAC     ◀──── GET /api/kiosks/agent/manifest (signed)
  ├─ fetch setup scripts, check sha  ◀──── GET /api/kiosks/installer/setup-{kiosk,common}.sh
  └─ setup-kiosk.sh
       ├─ apt: X, openbox, Chromium, sudo (+ labwc, wlr-randr, wlopm
       │       on Wayland; + cog on the Pi 3 class or --display-stack cog)
       ├─ /etc/default/calvin-kiosk (server URL, kiosk id, hostname,
       │                            display stack; other keys kept)
       └─ update-kiosk.sh --bootstrap ◀─── GET /api/kiosks/agent/files/*  (verified)
            └─ display agent + calvin-x / calvin-kiosk-remote / calvin-display-agent units
reboot → Chromium shows Calvin; the agent polls /api/kiosks/<id>/config → listed in Settings → Screens
```

**Trust boundary:** with a key, every file after the installer is verified against the
server's signature: the setup scripts, the kiosk agent, and every later update. The
installer itself must come over a trusted channel: SSH from the server (Option A,
signed), or your own checkout (Option B). The quick `curl | bash` form trusts whatever
answers on your LAN, so use it without a key.

## Pi 3 and GPU

Pi 3-class boards (Broadcom **VC4**, OpenGL ES 2.0 through Mesa) cannot run
Chromium's GPU path: the dashboard's renderer crashes within seconds with
**"Aw, Snap! error 11"** and the tab reloads forever. `--disable-gpu` makes the
same page load and stay up, so the installers add that flag on those boards — and
only there. Pi 4/5 have a working GPU path and keep it. This covers both
deployment shapes: the remote kiosk installer (`setup-kiosk.sh`) and the
all-in-one install (`setup.sh`).

| Board (`/proc/device-tree/model`) | `CALVIN_CHROMIUM_GPU=auto` (the default) |
|---|---|
| Raspberry Pi 3 / 3B / 3B+, Zero 2 W, Compute Module 3 | `--disable-gpu` |
| Raspberry Pi 4, Pi 5, Compute Module 4/5 | GPU path on, no extra flag |
| anything else (unknown board, no device tree) | GPU path on, no extra flag |

The flag lands in `CALVIN_CHROMIUM_DISPLAY_FLAGS` in
`/etc/default/calvin-kiosk-display`, which both kiosk units pass to Chromium
(`calvin-kiosk-remote.service` on a kiosk, `calvin-kiosk.service` on an
all-in-one install), so it applies to both stacks (Wayland keeps
`--ozone-platform=wayland` and the GPU flag follows it). The installer and an
update (a kiosk **Update** on a remote kiosk, `update-calvin.sh` on an all-in-one
install) recompute that line from the board instead of appending to it, so
re-running never duplicates it.

### Override it

Set `CALVIN_CHROMIUM_GPU` in the file the other kiosk settings live in:

```bash
sudo nano /etc/default/calvin-kiosk
# CALVIN_CHROMIUM_GPU=auto   # default: decide from the board
# CALVIN_CHROMIUM_GPU=on     # never add --disable-gpu
# CALVIN_CHROMIUM_GPU=off    # always add --disable-gpu
sudo systemctl restart calvin-kiosk-remote   # or calvin-kiosk on an all-in-one install
```

The installer and the updater read it on their next run; an exported
`CALVIN_CHROMIUM_GPU` at install time wins over the file. Use `off` on a board
that is not detected and still crashes, and `on` only to test a newer
Chromium/Mesa that may have fixed it. Narrower flags that keep compositing (for
example `--disable-gpu-rasterization`) are being measured on hardware in bead
`calvin-8by7`.

### Crash-page recovery

The GPU flag removes the common cause, but a renderer can still die (memory
pressure, an OOM kill). When only the renderer dies, Chromium's browser process
stays up, so the kiosk unit's `Restart=always` never fires and the screen keeps
showing "Aw, Snap!". Nothing inside that page can reload itself.

`calvin-display-agent.service` (already installed on every kiosk) therefore acts
as a watchdog: every 30 s it asks Chromium, over the Chrome DevTools Protocol on
`127.0.0.1:9222`, whether the dashboard page answers a trivial script. After
three consecutive failures it restarts the kiosk unit — the browser start-up
path the kiosk already has: a fresh browser, a fresh page, the same backend.
This covers the X11 and Wayland stacks (it talks to Chromium, not to X11 or
Wayland); on cog, recovery is cog's own `--webprocess-failure=restart`.

Chromium runs with its **own profile**, not the account's default one:
`--user-data-dir=/home/calvin/.config/calvin-kiosk-chromium`. That is required —
Chromium 136 and later (Raspberry Pi OS Trixie ships 156) ignore the debugging
port when it runs on the default profile, which would silently disable recovery.
The profile holds only Chromium state and its cache (the unit clears `Cache` and
`Code Cache` there at start-up); Calvin's own data comes from the server. FULL
(all-in-one) installs are covered too: `calvin-kiosk.service` passes the same
flags, and the same agent watches it.

It fails safe. If nothing that is Chromium answers on the port — recovery
disabled, an older unit file without the flag, or a Chromium that ignores it —
the agent logs `crash recovery is idle` once and restarts nothing: an
`unreachable` probe never triggers a restart. Once the endpoint answers as
Chromium, however, a page that probes dead counts as crashed **even if it was
never seen alive** (the renderer can die during the first load, leaving an empty
target list), and a probe or two of endpoint flapping does not discard that
evidence. Repeated restarts back off (300 s, 600 s, 900 s …) up to
`CALVIN_KIOSK_WATCHDOG_BACKOFF_MAX` (15 min by default), each restart after the
first is logged as a `crash loop`, and a healthy page resets that.

```bash
journalctl -u calvin-display-agent -f            # watchdog lines
curl -s http://127.0.0.1:9222/json/list          # what the agent probes
```

The debugging port is loopback-only (`--remote-debugging-address=127.0.0.1`) and
exists only for this probe. Settings live in `/etc/default/calvin-kiosk`:

| Setting | Default | Meaning |
|---|---|---|
| `CALVIN_KIOSK_WATCHDOG` | `1` | `0`/`off` turns recovery off (the browser is then left alone) |
| `CALVIN_KIOSK_CDP_PORT` | `9222` | loopback DevTools port; the unit and the agent must agree |
| `CALVIN_KIOSK_WATCHDOG_SECONDS` | `30` | seconds between probes (minimum 5) |
| `CALVIN_KIOSK_WATCHDOG_FAILURES` | `3` | consecutive failed probes before a restart |
| `CALVIN_KIOSK_WATCHDOG_COOLDOWN` | `300` | seconds before the first, and after a recovered, restart |
| `CALVIN_KIOSK_WATCHDOG_BACKOFF_MAX` | `900` | cap for the doubling wait between repeated restarts (15 min) |

`sudo systemctl restart calvin-display-agent` applies a change. Two guards keep
the watchdog out of the way: it never touches a unit that is not running (systemd
owns that case) or one that started less than two minutes ago.

## Display stack (cog on Pi 3-class, Wayland opt-in)

A kiosk normally runs **X11 + openbox**. On the **Pi 3-class boards** it installs
**cog** (WPE WebKit directly on DRM/KMS) instead, because the low-RAM / VC4
boards cannot run Chromium's GPU path and are tight on memory. Every other board
keeps X11; **Wayland + labwc** and an explicit **cog** stay opt-in everywhere.
FULL (all-in-one) installs are unchanged (always X11), and switching is an
installer re-run — not a re-flash.

Wayland is a phase-1 pilot tracked in bead `calvin-8by7`; see the design notes in
[../research/2026-10-29-kiosk-wayland.md](../research/2026-10-29-kiosk-wayland.md).
cog was adopted for **Pi 3-class boards** (owner decision 2026-10-30, gate
`g-10`); see [../research/2026-10-29-kiosk-cog.md](../research/2026-10-29-kiosk-cog.md).
On the owner's Pi 3B+ (Trixie, cog 0.18.4) it renders the dashboard in portrait
and the display schedule works through the framebuffer blank path below.

All stacks stay installed, so switching is a re-run of the installer — **not** a
re-flash. Your server URL, kiosk id, hostname, signing key and display settings are
kept.

### Choose Wayland on a fresh install

Add `--display-stack wayland` to the installer:

```bash
curl -fsSL http://tower:8000/api/kiosks/install.sh \
  | sudo bash -s -- --display-stack wayland
```

For a signed install, add the flag to the SSH form from Option A:

```bash
ssh -t $PI "sudo bash install-kiosk.sh --backend-url http://$SERVER:8000 \
  --signing-key-file calvin.key --display-stack wayland --no-reboot \
  && rm calvin.key && sudo reboot"
```

Wayland installs `labwc`, `wlr-randr`, `wlopm` and `wtype` **in addition to** the X11
packages, writes `~/.config/labwc/autostart` and `rc.xml`, and enables
`calvin-wayland.service` instead of `calvin-x.service`. Chromium runs with the same
kiosk flags plus `--ozone-platform=wayland`.

### cog on a Pi 3-class board (the default)

On a Pi 3, 3B, 3B+, 3A+, Zero 2 W or Compute Module 3 the installer reads
`/proc/device-tree/model` and selects **cog automatically** — no flag needed. To
be explicit, or to force cog on a board that auto-detects as X11, add
`--display-stack cog`:

```bash
curl -fsSL http://tower:8000/api/kiosks/install.sh \
  | sudo bash -s -- --display-stack cog
```

It installs the `cog` package (WPE WebKit; Debian's `libwpewebkit-2.0-1` on
Trixie) **in addition to** the X11 packages, writes
`/etc/default/calvin-kiosk-display` and `/etc/default/calvin-kiosk-cog`, and
enables `calvin-cog.service` instead of `calvin-x.service` /
`calvin-wayland.service`. Chromium (`calvin-kiosk-remote.service`) is disabled on
this stack: there is no X or Wayland session for it, and it would fight cog for
the panel.

cog runs as the `calvin` user with `video`, `render` and `input` groups, on tty1
like `calvin-x.service` but **without** a PAM/logind session (`PAMName=login`
makes cog trap with SIGTRAP on the Pi 3B+). As the first DRM client it becomes
DRM master by opening `/dev/dri/card0`, and systemd gives the unit its own
`XDG_RUNTIME_DIR` (`/run/calvin-cog`). It is launched as:

```bash
cog --platform=drm \
    --platform-params=renderer=gles,rotation=N \
    --webprocess-failure=restart \
    "http://tower:8000/?kiosk=..."
```

- **Rotation** comes from the Screens display setting. The display agent maps
  Calvin's xrandr names to cog's counter-clockwise quarter turns:
  `normal` → `0`, `left` (90° CCW) → `1`, `inverted` → `2`, `right` → `3`.
  It persists the value in `/etc/default/calvin-kiosk-cog` and restarts
  `calvin-cog.service` when it changes (rotation is a cog startup property).
  The `renderer=gles` part is required: cog's default `modeset` renderer cannot
  rotate.
- **Screen power** (display schedule) works: cog is the only DRM client, so the
  agent's root helper stops `calvin-cog.service`, writes `4` to
  `/sys/class/graphics/fb0/blank` (DPMS off), and on wake writes `0` and starts
  the unit again (the dashboard is back in ~5 s). cog aborts on SIGTERM
  (SIGSEGV as root, SIGABRT as `calvin`), so the unit lists both in
  `SuccessExitStatus` and a scheduled screen-off does not leave it `failed`. The
  helper (`/usr/local/bin/calvin-cog-panel.sh`) is the only thing `calvin` may
  run through a sudoers drop-in.
- **Crash recovery** is cog's own `--webprocess-failure=restart`; the Chromium
  DevTools watchdog does not run on this stack. A hung page still recovers through
  `Restart=always` when cog exits.

### Switch an existing kiosk

Re-run the installer on the Pi with the other stack. Everything else is preserved:

```bash
# X11 -> Wayland
curl -fsSL http://tower:8000/api/kiosks/install.sh -o /tmp/install-kiosk.sh
sudo bash /tmp/install-kiosk.sh --display-stack wayland

# X11 -> cog (or cog -> X11 / Wayland)
sudo bash /tmp/install-kiosk.sh --display-stack cog

# X11 -> Wayland, from a server checkout over SSH (signed installs use the stored key)
ssh -t $PI "sudo bash /tmp/install-kiosk.sh --display-stack wayland"
```

The installer disables the other display units, enables the chosen one (and
disables Chromium on cog), rewrites `/etc/default/calvin-kiosk-display` for the
new session, and reboots. Re-running it twice is harmless.

### Roll back to X11

The same command with `x11` — every package set is still on the Pi:

```bash
sudo bash /tmp/install-kiosk.sh --display-stack x11
```

This re-enables `calvin-x.service` and Chromium and disables `calvin-cog.service`
(and the Wayland compositor). Chromium and cog were both left installed, so it is
a service switch, not a re-image; `sudo apt remove cog` only frees space.

### Choosing without a flag

The stack comes from, in order: the `--display-stack` flag, an exported
`CALVIN_DISPLAY_STACK`, the value already in `/etc/default/calvin-kiosk`
(`auto`, `x11`, `wayland`, `cog`), then `auto`. `auto` means **cog on the
Pi 3-class boards** (Pi 3, 3B, 3B+, 3A+, Zero 2 W, Compute Module 3; the same
VC4 detection as `--disable-gpu`) and **X11 everywhere else**. Wayland stays
opt-in on every board.

The installer records the resolved stack in `/etc/default/calvin-kiosk`, so a
re-run with no flag keeps the stack an existing kiosk already has — an existing
X11 kiosk on a Pi 3B+ does not jump to cog. Kiosks installed before the setting
existed have no stored stack; they also stay on X11 and only move with an
explicit flag. To switch, pass it (`--display-stack x11` to go back to
Chromium, `cog` or `wayland` to move).

### Known limitations in phase 1

- **OS:** validated on **Raspberry Pi OS Trixie (Lite, 64-bit)** only. Bookworm
  ships an older labwc and no `wlopm`, so the installer warns and panel power will
  not work there.
- **Pi 3B/3B+:** cog is now the default there. It was verified end to end on the
  owner's 3B+ (install, rotation via the agent, screen off/on, reboot, 24 h soak);
  the 1 GB / VideoCore IV margin stays worth watching (`calvin-8by7`). If anything
  misbehaves, `--display-stack x11` switches back to Chromium in place.
- **Cursor:** labwc has no idle-hide. `rc.xml` binds `HideCursor` + `WarpCursor` and
  the autostart fires it once; the pointer reappears on pointer/touch input.
- **Rotation:** the agent uses `wlr-randr --transform`, which counts counter-clockwise
  (`left` -> `90`, `inverted` -> `180`, `right` -> `270`). Verify it on the panel.
- **Panel power:** `wlopm --off/--on`, with `wlr-randr --on` as the wake fallback. A
  monitor that fakes a hotplug can still wake; `autoEnableOutputs` is off in `rc.xml`.
- **Fullscreen/mode:** output names differ (`HDMI-1` -> `HDMI-A-1`); the agent accepts
  both and auto-detects the first connected output.
- **Remote update:** a bundle update installs the Wayland unit and labwc config but
  never switches the stack or enables the other compositor. Switching is always an
  explicit installer run.
- FULL installs (`scripts/setup.sh`) and the backend display services are unchanged in
  phase 1; they follow in phase 2/3.

### Known limitations of cog

- **OS/hardware:** validated on **Raspberry Pi OS Trixie (Lite, 64-bit)** and a
  **Pi 3B+**. Debian's `cog`/WPE packaging is older than Trixie's on Bookworm, so the
  installer warns there.
- **Native `<select>` dropdowns do not open** under cog's DRM backend (upstream
  issues #793/#503). Configure such settings from a phone/desktop; the rest of the
  dashboard and Settings work.
- **Rotation needs a restart** (cog has no runtime rotation API) — the agent
  restarts the unit, so the screen blanks for a few seconds.
- **Screen power** is the framebuffer-blank path; HDMI-CEC (`cec-ctl`) is not used
  by the agent. A monitor that ignores DPMS stays lit.
- **Touch capability** may not reach the page under cog; set `touchControls` and
  `onScreenKeyboard` to `on` for the kiosk if the on-screen keyboard does not
  appear automatically.
- **Security horizon:** Debian's `wpewebkit` on Trixie lags Chromium's patches (see
  the research doc §1.3). Keep Pi 3-class kiosks on trusted networks; an explicit
  `--display-stack x11` returns that board to Chromium.

## Updating a kiosk later

Use **Settings → Screens → Update** for that kiosk. The Pi pulls the new agent from the
server, verifies it, swaps it in, and rolls back if it doesn't come up healthy. See
[Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update). To pick up a new
Calvin version, update the server container; the kiosk follows when you press Update.

## Troubleshooting

- **The installer can't reach the server:** check the URL from the Pi with
  `curl http://<server>:8000/api/health`.
- **"manifest signature invalid":** the key doesn't match this server. Re-copy
  `kiosk-signing.key`. A server that lost its data volume generates a new key, and then
  every kiosk needs the new one.
- **"server manifest lists no installer files":** the server is older than this installer.
  Update the server container.
- **Install log:** `/var/log/calvin-setup.log`. For a baked card, run
  `journalctl -u calvin-kiosk-firstboot` (`ssh calvin-admin@<kiosk>` with the baked key).
- **Kiosk missing from Settings → Screens:** `systemctl status calvin-display-agent` on the Pi.
- **Wrong server later:** edit `CALVIN_BACKEND_URL` in `/etc/default/calvin-kiosk`, then
  `sudo systemctl restart calvin-kiosk-remote calvin-display-agent`.
