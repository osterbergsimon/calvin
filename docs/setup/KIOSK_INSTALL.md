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
| | Pi 3B / 3B+ | Works, but Chromium is slow. Runs without the GPU path; see [Pi 3 and GPU](#pi-3-and-gpu). |
| | Pi Zero 2 W, older Pis | Not recommended (512 MB RAM is too little for Chromium). |
| **OS** | **Raspberry Pi OS Lite (64-bit), Bookworm** (Debian 12) | The tested target. |
| | Raspberry Pi OS Lite 32-bit, Bookworm | Should work; 64-bit is preferred. |
| | Raspberry Pi OS **Desktop** | Not supported: Calvin starts its own X session on tty1, which conflicts with the desktop. |
| | Raspberry Pi OS Trixie (Debian 13) | Not yet verified on hardware. |

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
   Within a minute it appears in **Settings → Kiosks** on the server.

The quick form bakes in the URL the server saw the request on. Behind a reverse proxy
that can be an internal or `http://` address. If the Pi should use a different URL, add
`-s -- --backend-url http://<server>:8000`.

## Option B: bake the SD card (no SSH, no typing on the Pi)

Use this for several Pis, or for a Pi you hand to someone else. You need a Calvin
checkout on your workstation (Linux/macOS); the `develop` branch is fine.

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
       │       when --display-stack wayland)
       ├─ /etc/default/calvin-kiosk (server URL, kiosk id, hostname,
       │                            display stack; other keys kept)
       └─ update-kiosk.sh --bootstrap ◀─── GET /api/kiosks/agent/files/*  (verified)
            └─ display agent + calvin-x / calvin-kiosk-remote / calvin-display-agent units
reboot → Chromium shows Calvin; the agent polls /api/kiosks/<id>/config → listed in Settings → Kiosks
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
same page load and stay up, so the installer adds that flag on those boards — and
only there. Pi 4/5 have a working GPU path and keep it.

| Board (`/proc/device-tree/model`) | `CALVIN_CHROMIUM_GPU=auto` (the default) |
|---|---|
| Raspberry Pi 3 / 3B / 3B+, Zero 2 W, Compute Module 3 | `--disable-gpu` |
| Raspberry Pi 4, Pi 5, Compute Module 4/5 | GPU path on, no extra flag |
| anything else (unknown board, no device tree) | GPU path on, no extra flag |

The flag lands in `CALVIN_CHROMIUM_DISPLAY_FLAGS` in
`/etc/default/calvin-kiosk-display`, which `calvin-kiosk-remote.service` passes to
Chromium, so it applies to both stacks (Wayland keeps `--ozone-platform=wayland`
and the GPU flag follows it). The installer and a kiosk **Update** recompute that
line from the board instead of appending to it, so re-running never duplicates it.

### Override it

Set `CALVIN_CHROMIUM_GPU` in the file the other kiosk settings live in:

```bash
sudo nano /etc/default/calvin-kiosk
# CALVIN_CHROMIUM_GPU=auto   # default: decide from the board
# CALVIN_CHROMIUM_GPU=on     # never add --disable-gpu
# CALVIN_CHROMIUM_GPU=off    # always add --disable-gpu
sudo systemctl restart calvin-kiosk-remote
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
This is display-stack independent (it talks to Chromium, not to X11 or Wayland),
so it covers both.

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
| `CALVIN_KIOSK_WATCHDOG_COOLDOWN` | `300` | seconds before another restart (stops restart loops) |

`sudo systemctl restart calvin-display-agent` applies a change. Two guards keep
the watchdog out of the way: it never touches a unit that is not running (systemd
owns that case) or one that started less than two minutes ago, and it never acts
when nothing answers on the port — so an older unit file without the port, or a
non-kiosk host, simply logs `crash recovery is idle` and nothing restarts.

## Display stack (Wayland, opt-in)

A kiosk normally runs **X11 + openbox**. You can install it on **Wayland + labwc**
instead, which is what Raspberry Pi OS itself now defaults to. This is a **phase-1,
opt-in pilot**: `auto` still means X11 everywhere, FULL (all-in-one) installs are
unchanged, and it is **experimental on a Pi 3B+**. Real-hardware testing is tracked in
bead `calvin-8by7`; see the design notes in
[../research/2026-10-29-kiosk-wayland.md](../research/2026-10-29-kiosk-wayland.md).

Both stacks stay installed, so switching is a re-run of the installer — **not** a
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

### Switch an existing kiosk

Re-run the installer on the Pi with the other stack. Everything else is preserved:

```bash
# X11 -> Wayland
curl -fsSL http://tower:8000/api/kiosks/install.sh -o /tmp/install-kiosk.sh
sudo bash /tmp/install-kiosk.sh --display-stack wayland

# X11 -> Wayland, from a server checkout over SSH (signed installs use the stored key)
ssh -t $PI "sudo bash /tmp/install-kiosk.sh --display-stack wayland"
```

The installer disables `calvin-x.service`, enables `calvin-wayland.service`, rewrites
`/etc/default/calvin-kiosk-display` for the new session, and reboots. Re-running it
twice is harmless.

### Roll back to X11

The same command with `x11` — both package sets are still on the Pi:

```bash
sudo bash /tmp/install-kiosk.sh --display-stack x11
```

### Choosing without a flag

The stack also comes from `CALVIN_DISPLAY_STACK` in `/etc/default/calvin-kiosk`
(`auto`, `x11`, `wayland`), and from an exported `CALVIN_DISPLAY_STACK` when you run
the installer. Precedence: `--display-stack` flag, then the environment, then the
config file, then `auto`. In phase 1 `auto` is always X11. A re-run of the installer
with no flag keeps whatever the config file says.

### Known limitations in phase 1

- **OS:** validated on **Raspberry Pi OS Trixie (Lite, 64-bit)** only. Bookworm
  ships an older labwc and no `wlopm`, so the installer warns and panel power will
  not work there.
- **Pi 3B/3B+:** still experimental. The 1 GB RAM / VideoCore IV margin is the open
  question (`calvin-8by7`); X11 remains the safe choice there.
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

## Updating a kiosk later

Use **Settings → Kiosks → Update** for that kiosk. The Pi pulls the new agent from the
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
- **Kiosk missing from Settings → Kiosks:** `systemctl status calvin-display-agent` on the Pi.
- **Wrong server later:** edit `CALVIN_BACKEND_URL` in `/etc/default/calvin-kiosk`, then
  `sudo systemctl restart calvin-kiosk-remote calvin-display-agent`.
