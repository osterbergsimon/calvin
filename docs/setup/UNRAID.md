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
5. Start the container.

Calvin should be available at:

```text
http://<unraid-host>:8000/
```

Health check:

```text
http://<unraid-host>:8000/api/health
```

## Raspberry Pi Kiosk

Once Calvin is running on Unraid, configure the Pi as a kiosk-only
display:

```bash
sudo bash scripts/setup-kiosk.sh --backend-url http://<unraid-host>:8000
sudo reboot
```

Use a stable hostname or IP for `<unraid-host>` so the kiosk URL does not
change after reboot.

To update the Pi's display-agent later, use **Settings → Kiosks → Update** — no
SSH needed. See [Kiosk agent self-update](KIOSK_PROVISIONING.md#kiosk-agent-self-update).

## Persistent Data

The template maps:

```text
/mnt/user/appdata/calvin -> /var/lib/calvin
```

That directory contains the SQLite database, image storage, and installed
plugins. Back it up with the rest of your Unraid appdata.

## Security

Calvin does not include built-in authentication. Do not expose the
container directly to the internet. Use LAN-only access, VPN, or a
reverse proxy with authentication.
