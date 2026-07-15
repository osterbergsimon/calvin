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

## Kiosk agent self-update

The kiosk's Python display-agent and its systemd units can be updated remotely
from the Calvin admin UI — no SSH, no re-flash.

### How it works

1. **Admin triggers the update.** In Settings → Kiosks, click **Update** next to
   a kiosk. This sets a per-kiosk `agentUpdateRequested` flag in the backend
   registry (`POST /api/kiosks/{id}/update`).

2. **Agent sees the flag on its next config poll.** On every successful
   `GET /api/kiosks/{id}/config` (roughly once per minute), the display-agent
   checks for `agentUpdateRequested: true` and a new `agentAvailableVersion`. If
   the available version differs from its own running version
   (`/var/lib/calvin/agent-version.json`) and hasn't already been tried this
   session, the agent fires the root oneshot updater:

   ```
   sudo -n systemctl start --no-block calvin-kiosk-update.service
   ```

   The sudoers fragment installed at `/etc/sudoers.d/calvin-kiosk-update`
   (mode 0440) allows exactly this call for the `calvin` user — nothing else.

3. **Updater fetches the bundle from the local backend.** `update-kiosk.sh`
   (installed to `/usr/local/bin/`) pulls the bundle manifest from
   `GET /api/kiosks/agent/manifest` and downloads only changed files from
   `GET /api/kiosks/agent/files/{name}`. The bundle source is the **local
   Calvin server**, not GitHub — no internet access required on the kiosk.

   The bundle is ~6 files: the display-agent script, three systemd units, the
   updater itself, and the oneshot service unit. No full repo checkout lives
   on the kiosk.

4. **Verify, backup, atomic swap, restart.** For each changed file the updater:
   - verifies the sha256 against the manifest value,
   - runs `py_compile` on Python files,
   - backs up the current file to `/var/lib/calvin/agent-backup/`,
   - atomic-replaces via `install -m <mode>`,
   - restarts only the systemd units that own the changed files (uses
     `daemon-reload` when a unit file changed).

5. **Auto-rollback on unhealthy agent.** If the display-agent was among the
   restarted units, the updater waits up to 30 seconds for it to become both
   `active` and to have written the ready-marker
   (`/run/calvin/agent-ready`, a tmpfs file created on the first successful
   backend contact). If the agent doesn't come up healthy in time, all changed
   files are restored from backup and the affected units are restarted again.

6. **Update flag auto-clears.** On the next config poll after a successful
   update the agent reports its new version via the `kagent` query parameter.
   The backend auto-clears `agentUpdateRequested` once it sees
   `kagent == agentAvailableVersion`.

### Bundle source: local Calvin server only

`setup-kiosk.sh` and `update-kiosk.sh` both pull the bundle from
`${CALVIN_BACKEND_URL}/api/kiosks/agent/*`. The kiosk needs no internet access
and no copy of the Calvin git repo; everything comes from the server it is
already talking to.

### Updating the updater itself

`update-kiosk.sh` is part of the bundle, so it updates itself like any other file. Before a
new copy is adopted it is verified up front — `bash -n` for syntax and a read-only
`--self-check` run (which fetches and parses the manifest but changes nothing). If either
fails, the whole update aborts before anything is swapped and the current, known-good updater
stays installed. This is what makes it safe to evolve the updater remotely: a dead-on-arrival
updater is never installed. `--self-check` validates the new code against the *current*
manifest and environment, so it proves the updater starts and can parse today's manifest — a
new updater that misbehaves only mid-apply, or that expects a future manifest shape or a new
env var, is only partially exercised. That residual gap is bounded by the durable no-retry
guard (`agent-update-state.json`), which prevents a failing version from re-triggering in a
loop.

### Python version floor (`min_python`)

The bundle manifest carries `"min_python": "3.9"`. The updater checks the
kiosk's Python version before downloading anything; if the device Python is
below 3.9 the update is aborted with a `python-too-old` status and the current
agent is left in place. This surfaces in the backend's `agentUpdateStatus` field
as `"device python < 3.9; keeping current agent"` — the kiosk will need an OS
upgrade before the agent can be updated.

The display-agent itself enforces the same floor at startup and exits
immediately if it runs on Python older than 3.9.

### Initial install

`setup-kiosk.sh` calls `install_kiosk_bundle` (in `scripts/setup-common.sh`)
to fetch and install the bundle during first-time setup. The agent version is
seeded into `/var/lib/calvin/agent-version.json` at that point.

### Future option: zipapp

If the agent is ever split into multiple Python modules, packaging it as a
`zipapp` `.pyz` file is a supported path — the bundle endpoint can serve any
allowlisted file. PyInstaller and PyCrucible were rejected because they produce
architecture-specific artifacts; the current `python3` script works on any
Debian-family Raspberry Pi OS without recompilation.

### "Update all" kiosks

Bulk-updating all kiosks at once is not yet implemented. Each kiosk must be
triggered individually. Bulk update is tracked as `calvin-3d1`.

## Troubleshooting

- **Nothing happens on first boot:** confirm you flashed a *clean* image
  (no Imager customization) and that `cmdline.txt` on the card contains
  `systemd.run=/boot/firmware/firstrun.sh`.
- **Wifi doesn't connect:** check `--wifi-country` was set (regulatory
  domain) and the PSK is correct.
- **Provisioning failed:** SSH in (if you baked a key) and read
  `journalctl -u calvin-kiosk-firstboot`. Fix, then
  `sudo rm /var/lib/calvin/firstboot.done && sudo systemctl start calvin-kiosk-firstboot`.
