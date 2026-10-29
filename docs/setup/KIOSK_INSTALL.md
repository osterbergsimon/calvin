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
| | Pi 3B / 3B+ | Works, but Chromium is slow. |
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

## Option A: one command on the Pi (simplest)

1. **Flash.** In Raspberry Pi Imager, pick **Raspberry Pi OS Lite (64-bit)**. Using
   Imager's OS customisation is fine here: set a hostname (e.g. `kitchen`), a user,
   Wi-Fi, and **enable SSH**.
2. **Boot the Pi and copy the key onto it.** From your workstation, this pipes the key
   from the server to the Pi over SSH on both legs:

   ```bash
   ssh root@tower cat /mnt/user/appdata/calvin/kiosk-signing.key \
     | ssh <user>@kitchen.local 'umask 077; cat > ~/calvin.key'
   ```

3. **Install.** On the Pi (`ssh <user>@kitchen.local`):

   ```bash
   curl -fsSL http://tower:8000/api/kiosks/install.sh | sudo bash -s -- --signing-key-file ~/calvin.key
   ```

   Without a key, use `curl -fsSL http://tower:8000/api/kiosks/install.sh | sudo bash`.

   This takes a few minutes, mostly package installs. When it finishes, the Pi reboots
   by itself. Add `--no-reboot` to skip that.
4. **Done.** After the reboot the Pi starts Chromium in kiosk mode on the dashboard.
   Within a minute the Pi appears in **Settings → Kiosks** on the server. The installer
   stored the key root-only in `/etc/default/calvin-kiosk-signing`, so delete the copy:
   `rm ~/calvin.key`.

Behind a reverse proxy, the installer uses the URL you fetched it from. If that is not
the URL the Pi should use, pass `--backend-url http://<server>:8000`.

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
   access as the `calvin` user.
3. Put the card in the Pi and power on. It reboots twice by itself and comes up on the
   dashboard. Boot 1 applies the hostname, Wi-Fi and SSH. Boot 2 waits for the server,
   then installs. Boot 3 is the kiosk.

Details and troubleshooting: [KIOSK_PROVISIONING.md](KIOSK_PROVISIONING.md).

## What the install does

```text
Pi                                         Calvin server
──                                         ─────────────
install.sh (piped from the server,  ◀──── GET /api/kiosks/install.sh  (server URL baked in)
  or baked onto the card)
  ├─ store key → /etc/default/calvin-kiosk-signing (0600)
  ├─ fetch manifest, verify HMAC     ◀──── GET /api/kiosks/agent/manifest (signed)
  ├─ fetch setup scripts, check sha  ◀──── GET /api/kiosks/installer/setup-{kiosk,common}.sh
  └─ setup-kiosk.sh
       ├─ apt: X, openbox, Chromium, sudo
       ├─ /etc/default/calvin-kiosk (server URL, kiosk id, hostname)
       └─ update-kiosk.sh --bootstrap ◀─── GET /api/kiosks/agent/files/*  (verified)
            └─ display agent + calvin-x / calvin-kiosk-remote / calvin-display-agent units
reboot → Chromium shows Calvin; the agent polls /api/kiosks/<id>/config → listed in Settings → Kiosks
```

**Trust boundary:** in Option A, the first `install.sh` comes over plain HTTP and runs as
given, like any `curl | bash`. After that, with a key, every file is verified. In
Option B, the installer comes from your own checkout on the card, so the whole chain
is verified when a key is baked.

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
  `journalctl -u calvin-kiosk-firstboot` (SSH in with the baked key).
- **Kiosk missing from Settings → Kiosks:** `systemctl status calvin-display-agent` on the Pi.
- **Wrong server later:** edit `CALVIN_BACKEND_URL` in `/etc/default/calvin-kiosk`, then
  `sudo systemctl restart calvin-kiosk-remote calvin-display-agent`.
