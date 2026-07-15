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
