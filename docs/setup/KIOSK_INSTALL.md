# Install a kiosk Pi: fresh SD card to Calvin on screen

This is the short path for **Mode B**: the Calvin server runs elsewhere (Unraid, or any
Docker host), and the Raspberry Pi is only a display. See
[DEPLOYMENT_TOPOLOGIES.md](DEPLOYMENT_TOPOLOGIES.md) for the background.

Your Calvin server hands out everything the Pi needs. You don't need a repo checkout on
the Pi, and nothing comes from GitHub, so the kiosk always matches the server's version.

## Supported hardware and OS

| | Supported | Notes |
|---|---|---|
| **Pi model** | Raspberry Pi 5, Pi 4 (2 GB+), Pi 400 | Recommended. cog (WPE WebKit) by default. |
| | Pi 3B / 3B+ | Supported. cog by default; verified end to end on a 3B+ (2026-10-31). |
| | Pi Zero 2 W | Uses cog (WPE WebKit) by default; still unmeasured on 512 MB, so not recommended yet. |
| | Older Pis (Pi 1/2, Zero) | Not supported (too little RAM for the dashboard). |
| **OS** | **Raspberry Pi OS Lite (64-bit), Trixie** (Debian 13) | Verified with cog on a Pi 3B+ and a Pi 400 (boot/reboot, rotation, screen off/on, real sites, 60 min soak; 2026-10-31). |
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

   To pair the screen as it installs, use the command under **Settings → Screens →
   Add a screen** instead. It carries a one-time code, so the screen is paired the
   moment it first reaches Calvin (see [Pairing a screen](#pairing-a-screen)).

   **Do not add the signing key to this form.** The script arrives over plain HTTP, and
   a tampered copy could steal the key.

   Either way, the install takes a few minutes, mostly package installs, and the Pi
   then reboots.
3. **Done.** After the reboot the Pi starts the kiosk browser (cog by default) on the dashboard.
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
never selects an image for the Pi (a kiosk runs a browser, not Calvin). The
server container's image tag (`CALVIN_IMAGE_TAG`) is the version that matters,
and `setup.sh` sets it from the same tag.

## Pairing a screen

Every screen can prove which screen it is. Its display agent makes a secret the first
time it runs, and sends it with each check-in. The secret becomes valid when someone
signed in to Settings types the short code the screen shows. Until then the screen
still shows the dashboard.

**A new screen.** Open **Settings → Screens → Add a screen**. The Raspberry Pi card
mints a one-time code and puts it in the install command. Run that command (or bake it
into the card). The code works once, for 30 minutes; **New code** makes another. If the
code has expired by the time the Pi boots, the install still works and the screen falls
back to showing a code of its own.

Opening **Add a screen** again also makes a new code. The server keeps only the five newest,
so a command you copied a while ago can stop working if several newer codes have been made.
If that happens, the install still works, and the screen shows a code to type in
**Pair a screen**.

**A screen that is already installed.** After an update makes pairing available, the
screen shows **Pair this screen** and a code such as `K7Q-4MD` along its bottom edge,
over the dashboard. In **Settings → Screens**, type the code under **Pair a screen**.
Case and the dash do not matter. Settings names the screen it paired, and the strip
disappears from the wall within about ten seconds. Nothing is hidden or covered while
the code is there.

**Only paired screens.** This switch is off by default. With it off, screens that are
not paired keep working as they did before; a paired screen is protected at once.
With it on, an unpaired screen still shows the dashboard but cannot report in or follow
home automation, so Settings is the place to pair it. Turning the switch on while a
recently seen screen is unpaired asks first and names those screens.

**Pair again, or replace a screen.** Type a new code for a screen that is already
paired and the new pairing replaces the old one; Settings says the old pairing no
longer works. **Unpair** on a screen's page makes the screen show a new code and stop
reporting in until it is paired again.

**A stolen screen.** **Unpair** it at once: the server stops accepting its secret
immediately, and the screen shows a new code within a minute. If it is not coming back,
**Remove** it as well. Removing records its id, so an
older backup restores it unpaired even if that backup still carried its pairing.

**Reinstalling or swapping the card.** Reinstalling keeps `/var/lib/calvin/agent`, and
with it the screen's secret and id: the screen stays paired. A new SD card on a
different Pi is a new screen with a new id and no secret, so it appears unpaired and
shows a code.

**What optional mode leaves open.** An unpaired screen can be imitated by another
device on the same network, exactly as every screen could before pairing existed: it
can report status for that screen and read its presence fields. Pairing closes that
for each screen, and **Only paired screens** closes it for all of them. Two smaller
things stay true:

- A caller on the local network can start pairings for a screen id and hold its three
  pending slots for a while. The screen's own code still appears once a slot is free,
  and only someone signed in to Settings can approve one, but approval can be delayed.
- Until the screen's browser has swapped its start-URL secret for its cookie, the
  secret sits in the browser's start URL. On that Pi it can be read from the local
  DevTools port while the browser starts, and it is kept in the kiosk browser
  profile's history. The browser removes `#pair=` from its address before its first
  request, but its navigation timing entry still holds the start URL; a script running
  on one of Calvin's own pages (for example a web-component plugin, which only an
  admin installs) could read it. Such a script could already act as the screen
  through its cookie, so this adds no new access. It speaks for that screen only.

Finally, `GET /api/kiosks/{id}/display-check` is still a public read and its run id is
not a protection on its own. What protects a display-check report on a paired or
required-mode screen is the screen's own secret.

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
       ├─ apt: cog (WPE WebKit) + the X11/Chromium fallback packages, sudo
       │       (+ labwc, wlr-randr, wlopm on the opt-in Wayland stack)
       ├─ /etc/default/calvin-kiosk (server URL, kiosk id, hostname,
       │                            display stack; other keys kept)
       └─ update-kiosk.sh --bootstrap ◀─── GET /api/kiosks/agent/files/*  (verified)
            └─ display agent + calvin-cog (or calvin-x / calvin-wayland) + calvin-display-agent units
reboot → cog shows Calvin; the agent polls /api/kiosks/<id>/config → listed in Settings → Screens
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
all-in-one install (`setup.sh`). It only matters when a kiosk runs Chromium (the
X11/Wayland fallback); the cog default does not run Chromium at all.

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

## Display stack (cog default everywhere, Wayland opt-in)

A kiosk installs **cog** (WPE WebKit directly on DRM/KMS) by default on **every
board** — no X server, no compositor, no Chromium. This is the owner decision of
2026-10-31 after cog passed boot/reboot, rotation, screen off/on, real sites and a
60 minute soak on both a Pi 3B+ and a Pi 400 (cog ~67 MB + WPE ~273 MB, CPU ~94 %
idle). See [../research/2026-10-29-kiosk-cog.md](../research/2026-10-29-kiosk-cog.md).

**X11 + Chromium stays available as the fallback** for a site WPE cannot show
(native `<select>` dropdowns are the known one, see the limitations below);
**Wayland + labwc** is opt-in and still experimental. Both alternate stacks stay
installed, so switching is an installer re-run — **not** a re-flash. Your server
URL, kiosk id, hostname, signing key and display settings are kept.

Every board follows the same rule: a fresh install selects cog. An existing
kiosk keeps the stack recorded in `/etc/default/calvin-kiosk` — the default does
not silently migrate an X11 kiosk — and you switch it with an explicit
`--display-stack` (see [Switch an existing kiosk](#switch-an-existing-kiosk)).
FULL (all-in-one) installs (`scripts/setup.sh`, which also runs the server)
follow the same rule: a fresh install selects cog, `--display-stack` wins, and a
re-run keeps the recorded stack (an all-in-one Pi from before the setting
existed stays X11). Switch one with `sudo bash setup.sh --display-stack <stack>`.

### Choose Wayland on a fresh install (opt-in, experimental)

Wayland is a phase-1 pilot tracked in bead `calvin-8by7`; see the design notes in
[../research/2026-10-29-kiosk-wayland.md](../research/2026-10-29-kiosk-wayland.md).
It is not the default on any board.

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

### cog (the default on every board)

A fresh install reads `/proc/device-tree/model` only for the Chromium GPU flags;
the stack itself is **cog on every board** — no flag needed. To be explicit, or
to move an existing kiosk, add `--display-stack cog`:

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
- **Faster page switching** (a per-screen setting, off by default): in
  Settings › Screens, pick the screen, then turn on **Faster page switching**
  under Display. Only an admin can change it, and it applies to that screen
  only (a browser that is not a known kiosk never uses it). It applies only to
  a screen the server knows by id (opened with `?kiosk=`); the server's own
  local display page, which opens without a kiosk id, does not use it. The
  dashboard then keeps every page mounted and shows only the active one, so a
  page switch does not rebuild the page; the pages that are not shown stay
  hidden, cannot take focus and pause their photo rotation. On a Pi 3B+ (cog,
  WPE WebKit 2.48) a
  warm page switch went from about 2.4 s to 0.8 s (about 3x faster) and used
  about half the CPU, with no measurable memory cost. The cost is a start about
  1 s slower (about 5.5 s to 6.5 s), because every page is built at start.
  Editing the layout always works on the single active page, so the setting
  has no effect while the layout is unlocked for editing.
  For testing, `?screenStack=on` (or `off`) on the dashboard URL overrides the
  setting for that one load only; it is not remembered.
  A fullscreen view (the photo frame, a maximized calendar) keeps the whole
  stack mounted and laid out behind it, so leaving and re-entering the dashboard
  does not rebuild the pages. Opening `/settings` and coming back still
  remounts every page, not just the active one: an admin-visit cost, not a page
  switch.
- **Screen power** (display schedule) works: cog is the only DRM client, so the
  agent's root helper stops `calvin-cog.service`, waits up to 5 s for its
  `MainPID` to disappear (the kernel restores the console mode when the last DRM
  client closes, which would otherwise turn DPMS back on), clears tty1, then
  writes `0` and `4` to `/sys/class/graphics/fb0/blank` (DPMS off), verifies the
  connected connectors report `dpms=Off` and retries the `0`/`4` pair once
  before failing, so the agent retries on its next poll. On wake it clears tty1,
  writes `0` and starts the unit again (the dashboard is back in ~5 s).
  Starting is idempotent, and a
  kiosk that boots inside its off window recovers at the next on boundary: the
  agent retries a panel command that failed (for example while the unit was
  still transitioning) on its next poll instead of waiting for the next schedule
  change. The agent polls its config every `CALVIN_DISPLAY_REFRESH_SECONDS`
  (default 60, override in `/etc/default/calvin-kiosk`) and also wakes at each
  schedule boundary, so a schedule edit made in Settings reaches the panel
  within about a minute. cog aborts on SIGTERM
  (SIGSEGV as root, SIGABRT as `calvin`), so the unit lists both in
  `SuccessExitStatus` and a scheduled screen-off does not leave it `failed`. The
  helper (`/usr/local/bin/calvin-cog-panel.sh`) is the only thing `calvin` may
  run through a sudoers drop-in.
- **Crash recovery** is cog's own `--webprocess-failure=restart`; the Chromium
  DevTools watchdog does not run on this stack. A hung page still recovers through
  `Restart=always` when cog exits.

### Switch an existing kiosk

Re-run the installer on the Pi with the other stack. Everything else is preserved.
An existing kiosk is **not** migrated by the new default: it keeps the stack in
`/etc/default/calvin-kiosk` until you pass a flag.

```bash
# X11 -> cog (what the default does on a fresh install)
curl -fsSL http://tower:8000/api/kiosks/install.sh -o /tmp/install-kiosk.sh
sudo bash /tmp/install-kiosk.sh --display-stack cog

# cog -> X11/Chromium, or -> Wayland
sudo bash /tmp/install-kiosk.sh --display-stack x11
sudo bash /tmp/install-kiosk.sh --display-stack wayland

# From a server checkout over SSH (signed installs use the stored key)
ssh -t $PI "sudo bash /tmp/install-kiosk.sh --display-stack cog"
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
(`auto`, `x11`, `wayland`, `cog`), then `auto`. `auto` means **cog on every
board**; only an explicit `x11` selects Chromium and only an explicit `wayland`
selects labwc.

The installer records the resolved stack in `/etc/default/calvin-kiosk`, so a
re-run with no flag keeps the stack an existing kiosk already has — an existing
X11 kiosk does not jump to cog. Kiosks installed before the setting existed have
no stored stack; they also stay on X11 and only move with an explicit flag. To
switch, pass it (`--display-stack x11` to go back to Chromium, `cog` or
`wayland` to move).

### Known limitations in phase 1

- **OS:** validated on **Raspberry Pi OS Trixie (Lite, 64-bit)** only. Bookworm
  ships an older labwc and no `wlopm`, so the installer warns and panel power will
  not work there.
- **Hardware:** cog is the default on every board. It was verified end to end on
  the owner's Pi 3B+ and Pi 400 (install, rotation via the agent, screen off/on,
  reboot, real sites, 60 min soak). If anything misbehaves,
  `--display-stack x11` switches back to Chromium in place.
- **Cursor:** labwc has no idle-hide. `rc.xml` binds `HideCursor` + `WarpCursor` and
  the autostart fires it once; the pointer reappears on pointer/touch input.
- **Rotation:** on Wayland the agent uses `wlr-randr --transform`, which counts
  counter-clockwise (`left` -> `90`, `inverted` -> `180`, `right` -> `270`). Verify
  it on the panel.
- **Panel power:** on Wayland, `wlopm --off/--on`, with `wlr-randr --on` as the wake
  fallback. A monitor that fakes a hotplug can still wake; `autoEnableOutputs` is
  off in `rc.xml`. On cog, the framebuffer-blank path below is used.
- **Fullscreen/mode:** output names differ (`HDMI-1` -> `HDMI-A-1`); the agent accepts
  both and auto-detects the first connected output.
- **Remote update:** a bundle update installs the Wayland unit and labwc config but
  never switches the stack or enables the other compositor. Switching is always an
  explicit installer run.
- FULL installs (`scripts/setup.sh`) take the same `--display-stack` values and the
  same default (cog); the backend display services are unchanged.

### Known limitations of cog

- **OS/hardware:** validated on **Raspberry Pi OS Trixie (Lite, 64-bit)** with a
  **Pi 3B+** and a **Pi 400** (boot/reboot, rotation, screen off/on, real sites,
  60 min soak). Debian's `cog`/WPE packaging is older than Trixie's on Bookworm, so
  the installer warns there.
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

## Screen power from home automation

Home automation (or Settings) can switch a screen on or off with the
[screen-power call](../integrations/HOME_AUTOMATION.md). Each screen has one mode in
Settings: **Schedule**, **Always on** or **External**. Home automation switches only an
External screen, and a command there stands until the next one. The display agent learns
about it on its regular config poll, so a change shows within about a minute.

Every mode reaches today's screens, including one on older software. In External the
server sends the command as both `screenHold` (an agent that reports `kfeat=hold` obeys it
until it changes) and `screenNow`. An agent from before External already follows
`screenNow`, and the schedule is switched off, so there is no next change to end it:

| | Agent from before External | Agent that holds |
|---|---|---|
| **Server from before External** | as before | sends `kfeat`, which the server ignores; as before |
| **Server with screen power modes** | obeys a command until the next scheduled change in Schedule; the same command stands in External | obeys `screenHold` until it changes |

**Settings › Screens** no longer needs an update note: External works with every agent. A
touch on a screen that is off can wake it, depending on the display. It is not left lit:
Calvin sleeps it again at its next check, once the screen's idle time (**Turn off when
idle**) has passed, or about once a minute when no idle time is set. The command itself is
unchanged.

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
- **The screen shows a code I cannot pair:** make sure you are signed in to Settings as
  admin, and check that the code has not expired (it lives ten minutes; the screen
  replaces it with a new one). Another device on the network can hold a screen's three
  waiting slots for a while; wait for the screen's code and try again.
- **Wrong server later:** edit `CALVIN_BACKEND_URL` in `/etc/default/calvin-kiosk`, then
  `sudo systemctl restart calvin-kiosk-remote calvin-display-agent`.
