# Backup and restore

A backup is one file that brings a fresh Calvin back to a configured state:
calendars, photo sources, web services, layout and screens, keyboard map,
plugins, themes and kiosks. Use it to move to a new server, to rebuild a
container, or to seed a dev setup instead of entering everything again.

## What is in a backup

| Included | Notes |
|---|---|
| All app settings | Layout, screens and regions, clock bar, display schedule, theme choice, appearance, security allowlist and sealed mode, update branch, plugin type settings |
| Keyboard map | |
| Plugins and their instances | Calendar sources, image sources, web services and backend plugins, with their ids, names, on/off state, settings and order |
| Installed plugin and theme packages | Optional, on by default. Restore installs them (and their Python dependencies) on the new server |
| Kiosks | Each kiosk's id, hostname and per-kiosk settings |
| Passwords and API keys | Optional, on by default. See [Secrets](#secrets) |
| Kiosk signing key | Optional, off by default. See [Kiosk signing key](#kiosk-signing-key) |

| Not included | Why |
|---|---|
| Photos and other image files | They are your content, not settings; copy the image folder separately if you need it |
| Caches (images, calendars, weather) | Rebuilt automatically |
| Kiosk status (last seen, agent version) | Reported again by each kiosk |
| Logs, the Python environment, the frontend build | Part of the install, not the setup |
| The automatic-backup schedule | Belongs to each server (see below) |

Instance ids are kept exactly, because screens and regions point at sources
by id.

One thing in a backup can depend on the machine: a source whose settings
contain a local path (for example the **Local Images** folder). It is restored
as it was; adjust it in Settings if the new server keeps images elsewhere.

### Secrets

Plugin settings can hold passwords, API keys and tokens. By default they are
included, so a restore needs no retyping. **The file then contains them in
plain text: store it like a password.** Backups that Calvin writes to its own
backup folder are readable only by the Calvin user (`0600`).

Turn off **Include passwords and API keys** (or pass `--no-secrets` /
`include_secrets=false`) to blank them. On restore, a blanked value is taken
from the server's current settings when it has one, so a blank never
overwrites a password the server already has (sources and plugin-level
settings alike). A source still missing one is restored **switched off**, with
its other settings intact, and listed under "needs credentials"; enter the
password in Settings and switch it on.

A setting counts as secret when its name contains `password`, `api_key`,
`api_token`, `token`, `secret`, `access_token` or `refresh_token`, or when the
plugin declares it as a password field.

### Kiosk signing key

Calvin signs the kiosk agent's update manifest with a key in
`KIOSK_SIGNING_KEY_PATH`. A new server makes a new key, so kiosks set up
against the old server stop accepting updates until they are set up again.

To move a whole installation, include the key in the backup and, when
restoring, choose **Also restore the kiosk signing key** (or
`--restore-signing-key`, `restore_signing_key=true`,
`CALVIN_RESTORE_SIGNING_KEY=1`). It is opt-in on both sides because anyone
with the key can sign kiosk updates, and a dev machine restoring a production
backup should not take over production's key by accident.

## Making a backup

- **Settings:** Maintenance → Backup → **Download backup**.
- **API:** `GET /api/backup/export` (query `include_packages`, `include_secrets`,
  `include_signing_key`) returns the zip.
- **Command line** (works while Calvin runs), from `backend/`:

  ```bash
  uv run python -m app.services.backup export --out calvin.zip
  uv run python -m app.services.backup export --no-secrets --no-packages
  uv run python -m app.services.backup export --include-signing-key
  ```

  In Docker: `docker exec calvin python -m app.services.backup export --out /var/lib/calvin/backups/manual.zip`.

### Automatic backups

Maintenance → Automatic backups saves a backup to the backup folder every N
hours and keeps the newest N (default: every 24 hours, keep 7). They include
packages and secrets but not the signing key. Backups saved there before a
restore (`pre-restore-*`) and by **Save a backup now** are never deleted
automatically. The schedule is also available at `GET/PUT /api/backup/schedule`.

The backup folder is, in order of preference: `BACKUP_DIR`;
`$CALVIN_DATA_DIR/backups` (Docker/Unraid: `/var/lib/calvin/backups`); next to
the database's data folder (dev: `backend/data/backups`).

## Restoring

Restore is the same everywhere: the file is checked, you see what will change,
the current setup is saved to the backup folder as `pre-restore-<time>.zip`,
then the backup is applied.

### Replace or merge

- **Replace** (default): this Calvin ends up like the backup. Settings, key
  bindings and sources that are not in the backup are removed. Installed
  plugin packages are not uninstalled; their sources are removed.
- **Merge:** everything in the backup is added or updated; everything else is
  kept.

Kiosks are always merged: they re-register on their own, so a restore never
deletes one.

### What happens, in order

1. **Check.** The file must be a Calvin backup (`format: calvin-backup`). A
   backup from a newer Calvin is refused with "made by a newer Calvin" and
   nothing is changed; upgrade first. Older backup formats are upgraded
   automatically.
2. **Preview.** Counts of settings, sources, key bindings and kiosks; plugins
   to install; sources that will be created, updated, removed or skipped;
   warnings (for example a plugin installed here at a different version than
   in the backup: the installed one is kept).
3. **Safety backup** of the current setup.
4. **Apply.** Plugin and theme packages from the backup that are not installed
   are installed (with their Python dependencies). Then settings, key
   bindings, plugin on/off state, sources (through the normal plugin instance
   manager, so they start straight away) and kiosks.
5. **Result.** What was done, sources that need credentials, warnings and
   errors. Reload the UI to see everything.

A source whose plugin is neither installed nor in the backup (or whose plugin
failed to install) is kept **switched off** with its settings, with a warning;
install the plugin and switch the source on again. Its screen region stays. Restore is not one database transaction: if something goes wrong
part-way, restore the `pre-restore-*` file to go back.

### From Settings

Maintenance → Restore → choose the file → check the preview → pick Replace or
Merge → **Restore this backup** → **Reload Calvin**.

### From the API

```bash
# preview only
curl -F file=@calvin.zip -F mode=replace http://calvin:8000/api/backup/preview
# restore
curl -F file=@calvin.zip -F mode=replace http://calvin:8000/api/backup/restore
# a backup already in the backup folder
curl -F mode=merge -F dry_run=true http://calvin:8000/api/backup/files/auto-pi-20261029-030000-000000.zip/restore
```

Responses: `200` with the plan or result; `400` when the file is rejected
(with the reason in `detail`); `409` when another restore is running.

### From the command line

Stop Calvin first (the command changes the database and plugin folders
directly), then from `backend/`:

```bash
uv run python -m app.services.backup restore calvin.zip --dry-run
uv run python -m app.services.backup restore calvin.zip --mode merge
uv run python -m app.services.backup restore calvin.zip --restore-signing-key
```

Exit code `0` = restored, `1` = restored with errors (listed in the output),
`2` = the file was rejected.

### On first start (fresh deploys and dev setups)

Point Calvin at a backup and it restores it during startup, after plugins are
loaded and before defaults are filled in:

- `CALVIN_RESTORE_FROM=/path/to/backup.zip` (or `.json`), or
- drop the file into the backup folder as `restore-on-start.zip` or
  `restore-on-start.json`.

`CALVIN_RESTORE_MODE` picks `replace` (default) or `merge`;
`CALVIN_RESTORE_SIGNING_KEY=1` also restores the signing key.

Each file is applied **once**: Calvin remembers its checksum, so the variable
can stay set and the file can live on a read-only mount; restarts do not undo
your later changes. Put a different file there to seed again. A file that is
rejected is logged and Calvin starts with its current setup. If the restore
ran but reported errors (for example a plugin whose dependencies could not be
downloaded), it is not marked as applied and is tried again on the next
start.

Docker/Unraid example:

```yaml
services:
  calvin:
    environment:
      CALVIN_RESTORE_FROM: /var/lib/calvin/backups/seed.zip
```

Dev setup: keep a backup of your usual configuration and start the backend
with `CALVIN_RESTORE_FROM=~/calvin-dev-seed.zip`.

A seed can also be a hand-written `backup.json` (no packages). The smallest
valid one:

```json
{
  "format": "calvin-backup",
  "format_version": 1,
  "data": {
    "config": [{"key": "time_format", "value": "24h", "value_type": "string"}],
    "plugin_instances": [
      {"id": "ical-family", "type_id": "ical", "name": "Family", "enabled": true,
       "config": {"ical_url": "https://example.com/family.ics"}}
    ]
  }
}
```

## File format

A zip:

```
backup.json                 # header + all settings
packages/plugins/<id>/...   # installed plugin files (if included)
packages/themes/<id>/...    # installed theme files (if included)
signing-key                 # only if the key was included
```

`backup.json` carries `format` (`calvin-backup`), `format_version` (currently
`1`), `created_at`, `calvin_version`, `schema_revision` (the database
migration the source was on, for information), `source` (hostname, deploy
kind), the export `options`, `stripped_secrets`, the `packages` list and
`data` (`config`, `keyboard_mappings`, `plugin_types`, `plugin_instances`,
`kiosks`).

`format_version` is the backup's own version, separate from the database
schema. When it changes, a migration step in
`backend/app/services/backup/format.py` (`MIGRATIONS`) upgrades older files,
so old backups keep restoring. Unknown fields are ignored, so database
columns added later do not break older backups.

## Security

Calvin's API has no login; anyone who can reach it can download a backup
(including secrets) or restore one, the same as they can already install a
plugin that runs code on the server. Keep Calvin on a trusted network.
