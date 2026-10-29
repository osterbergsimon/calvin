# Unraid Deployment

Run Calvin on Unraid as the backend, then point the Raspberry Pi at the
Unraid WebUI URL in kiosk-only mode.

## Install From The Template

The template lives at:

```text
https://raw.githubusercontent.com/osterbergsimon/calvin/main/deploy/unraid/calvin.xml
```

In Unraid:

1. Open **Docker**.
2. Add Calvin from the template. If you use Community Applications with
   private template repositories, add this repository URL first:
   `https://github.com/osterbergsimon/calvin`.
3. Keep the default appdata path unless you have a reason to change it:
   `/mnt/user/appdata/calvin`.
4. Keep the default port `8000`, or change it if that port is already in
   use.
5. Set **Public URL** to the address phones and new kiosks should use, for
   example `http://192.168.1.10:8000` (the Unraid server's LAN IP and the port
   above). The container can't detect it itself; without it, the
   "set up from your phone" QR codes and the **Add kiosk** install command
   show the container's internal IP whenever Calvin is opened via `localhost`.
6. Start the container.

Calvin should be available at:

```text
http://<unraid-host>:8000/
```

Health check:

```text
http://<unraid-host>:8000/api/health
```

## Raspberry Pi Kiosk

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
change after reboot.

To update the Pi's display-agent later, use **Settings → Kiosks → Update** — no
SSH needed. See [Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

## Persistent Data

The template maps:

```text
/mnt/user/appdata/calvin -> /var/lib/calvin
```

That directory contains the SQLite database, image storage, installed
plugins, and `kiosk-signing.key` (the kiosk manifest signing key). Back it up with the rest of your Unraid appdata.

## Security

Calvin does not include built-in authentication. Do not expose the
container directly to the internet. Use LAN-only access, VPN, or a
reverse proxy with authentication.
