# Unraid Deployment

Run Calvin on Unraid as the backend, then point one or more Raspberry Pis
at it as kiosk-only displays.

## What runs

| | |
|---|---|
| Image | `ghcr.io/osterbergsimon/calvin:develop` (public, amd64 + arm64 + arm/v7) |
| Built from | the `develop` branch: every push to `develop` publishes a new `:develop` image |
| Port | `8000` (UI and API on the same port) |
| Data | `/mnt/user/appdata/calvin` → `/var/lib/calvin` (database, images, plugins, themes, kiosk signing key) |
| Runs as | `PUID=99` / `PGID=100` (Unraid's `nobody:users`) |

## Install

1. In the Unraid web UI, open **Docker** and scroll to the bottom.
2. Fetch the template once from a terminal on the Unraid box
   (**Terminal** icon in the top bar):

   ```bash
   wget -O /boot/config/plugins/dockerMan/templates-user/my-Calvin.xml \
     https://raw.githubusercontent.com/osterbergsimon/calvin/develop/deploy/unraid/calvin.xml
   ```

3. Back in **Docker**, click **Add Container**, then pick **Calvin** from the
   **Template** dropdown (under *User templates*).
4. Leave the defaults unless you need to change them:
   - **WebUI Port** `8000`. Change this if port 8000 is already taken.
   - **Appdata** `/mnt/user/appdata/calvin`.
   - Advanced view: `PUID` `99` and `PGID` `100`. The paths and the
     database URL normally stay as they are.
5. Click **Apply**. Unraid pulls the image and starts the container.

Open Calvin at:

```text
http://<unraid-host>:8000/
```

If it doesn't load, check `http://<unraid-host>:8000/api/health`, which
should return `{"status":"healthy"}`. The Docker tab also shows the
container's health, which comes from the image's built-in health check.

## Update

Calvin tracks `develop`. Each push to `develop` builds and publishes a new
`:develop` image (about 20 minutes after the push). To pick it up:

1. In **Docker**, click **Check for Updates**.
2. When Calvin shows *update ready*, click **apply update**.

Unraid pulls the new image and recreates the container. Everything in
appdata stays, including installed plugins. Their Python packages are
re-installed automatically when the container starts.

To stay on a known-good build, change **Repository** to a pinned tag such
as `ghcr.io/osterbergsimon/calvin:sha-1a2b3c4`. Every published build also
gets a `sha-<commit>` tag; the list is at
<https://github.com/osterbergsimon/calvin/pkgs/container/calvin>. To go
back to following `develop`, switch the tag back to `:develop`.

## Plugins

Install plugins from **Settings → Plugins** as usual. Installing is live:
plugin files go to `appdata/calvin/plugins`, their pip dependencies are
installed into the running container, and no rebuild or restart is
needed.

## Raspberry Pi kiosk

Once Calvin is running on Unraid, turn a fresh Raspberry Pi OS Lite install
into a kiosk with one command (the container serves the installer):

```bash
curl -fsSL http://<unraid-host>:8000/api/kiosks/install.sh | sudo bash
```

For a **signed** kiosk, the signing key is
`/mnt/user/appdata/calvin/kiosk-signing.key`. It is in Appdata, so it survives
container updates. Copy the key and the installer to the Pi over SSH instead of
using the line above.
[KIOSK_INSTALL.md](KIOSK_INSTALL.md) has the exact commands, plus a
bake-the-SD-card option with no SSH at all.

Use a stable hostname or IP for `<unraid-host>` so the kiosk URL does not
change. To update a Pi's display agent later, use **Settings → Kiosks →
Update**: the Unraid container serves the kiosk bundle that matches its
own build. See [Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

## Backups

Everything Calvin needs is under `/mnt/user/appdata/calvin`. Back it up
with the rest of your appdata (for example with the Appdata Backup
plugin).

`/mnt/user/appdata/calvin/kiosk-signing.key` signs kiosk updates. It is
the key that [manifest signing](KIOSK_PROVISIONING.md#manifest-signing-closing-the-lan-mitm)
calls `./data/kiosk-signing.key`; read it with
`cat /mnt/user/appdata/calvin/kiosk-signing.key`. If you lose it, a new
key is generated, and every kiosk that has the old key baked in must be
given the new one.

## Security

Calvin has no built-in authentication. Do not expose the container to the
internet. Keep it LAN-only, or put it behind a VPN or an authenticating
reverse proxy.
