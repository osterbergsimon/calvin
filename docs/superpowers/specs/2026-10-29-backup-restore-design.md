# Backup and restore — design (calvin-8gx)

## Why

Calvin keeps its whole setup in one SQLite DB plus a few files in the data
dir. Every fresh install (new dev env, rebuilt container, new Pi/Unraid
deploy) means re-entering calendars, photo sources, web services, layout,
screens, keyboard map, kiosks and plugin credentials by hand. A backup must
bring a fresh install back to a configured, working state in one step: from
the Settings UI, from the API, or headlessly on first start.

## Goals / non-goals

- **Goal:** one portable file that captures the configuration and restores it
  on any deploy mode (dev, Docker/Unraid, all-in-one Pi), with a preview
  before anything is written.
- **Goal:** headless seeding: a dev setup or fresh deploy configures itself on
  first start from a file.
- **Non-goal:** backing up photos, image caches, weather/calendar caches,
  logs, or the Python venv. Photos are user content managed elsewhere; caches
  rebuild themselves.
- **Anti-goal:** a restore that half-applies and leaves Calvin broken with no
  way back, or that silently drops plugin instances the layout points at.

## What is in a backup

| Part | Source | Included |
|---|---|---|
| App settings, layout, screens, regions, display schedule, theme choice, clock bar, security allowlist / sealed mode, git branch, plugin type configs (`plugin_<id>_config`) | `config` table (every row, raw `value` + `value_type`) | always |
| Keyboard map | `keyboard_mappings` | always |
| Plugin types (enabled flag, `display_order`, theme rows) | `plugin_types` | always |
| Plugin instances = calendar sources, image sources, web services, backend plugins (id, type, name, enabled, config, display order) | `plugins` | always |
| Kiosks and per-kiosk overrides (id, hostname, overrides) | `kiosks` | always; `last_seen`, agent version/status and `last_applied_version` are runtime state and left out |
| Installed plugin packages | `PLUGIN_DIR/<id>/` (no `__pycache__`) | default on (`include_packages`) |
| Installed theme packages | theme dir `/<id>/` | default on, same switch |
| Secrets inside plugin configs | see below | default on (`include_secrets`) |
| Kiosk manifest signing key | `KIOSK_SIGNING_KEY_PATH` | default **off** (`include_signing_key`) |
| Photos, caches, logs, venv | — | never |

Instance ids are kept exactly: screens/regions reference instances by id
(`serviceId`), so a restore that re-derived ids would orphan the layout.

### Secrets

A secret is a config key the host already treats as sensitive
(`SENSITIVE_FIELDS` in `api/routes/plugins/config.py`: password, api_key,
token, secret, …) or a field the plugin's `instance_config_schema` declares
with `type: "password"`. Applies to instance configs and to
`plugin_<id>_config` rows.

- **Included by default.** The whole point is a one-step restore, and the
  DB they come from already holds them in plain text. The UI shows a warning
  next to the toggle and on the download: the file contains passwords and API
  keys in plain text; store it like a password. Backup files written to disk
  by Calvin are created `0600`.
- **Excluded on request.** Secret values are replaced by `""` and the backup
  records which instance/field was stripped. On restore, an instance whose
  secret is missing cannot pass its plugin's validation, so it is restored
  **disabled** with its other settings intact, and the result lists it as
  "needs credentials". In merge mode a stripped secret never overwrites an
  existing value on the target.
- Passphrase encryption of the file is a follow-up (needs a crypto
  dependency and a passphrase flow), not in this change.

### Kiosk signing key

Kiosks verify agent bundle manifests against the server's HMAC key. A fresh
install generates a new key, so existing kiosks would reject updates until
re-provisioned. Including the key is opt-in with a warning (anyone with the
file can sign kiosk updates). When a backup carries it, restore writes it
(`0600`) only if the caller also asks for it (`restore_signing_key`), so a
dev box restoring a prod backup does not silently take over prod's key.

## Format

A zip file, `calvin-backup-<host>-<UTC timestamp>.zip`:

```
backup.json                 # the manifest + all DB data (below)
packages/plugins/<id>/...   # installed plugin package files
packages/themes/<id>/...    # installed theme package files
signing-key                 # only if include_signing_key
```

`backup.json`:

```json
{
  "format": "calvin-backup",
  "format_version": 1,
  "created_at": "2026-10-29T10:00:00Z",
  "calvin_version": "0.1.0",
  "schema_revision": "4ca1bddc0e65",
  "source": {"hostname": "pi-kitchen", "deploy": "docker|pi|dev"},
  "options": {"include_packages": true, "include_secrets": true, "include_signing_key": false},
  "stripped_secrets": [{"scope": "instance", "id": "mealie-1a2b", "field": "api_token"}],
  "packages": {"plugins": [{"id": "mealie", "version": "1.2.0"}], "themes": []},
  "data": {
    "config": [{"key": "...", "value": "...", "value_type": "json"}],
    "keyboard_mappings": [{"key_code": "KEY_1", "action": "generic_prev"}],
    "plugin_types": [{"type_id": "ical", "plugin_type": "calendar", "enabled": true, "common_config_schema": {}}],
    "plugin_instances": [{"id": "ical-1a2b", "type_id": "ical", "plugin_type": "calendar", "name": "Family", "enabled": true, "config": {}, "display_order": 0}],
    "kiosks": [{"id": "hallway-3f9a2c", "hostname": "pi-hallway", "overrides": {}}]
  }
}
```

Restore also accepts a bare `backup.json` (no packages), so a hand-written or
scripted seed file works.

### Versioning

- `format_version` is the backup file's own schema, independent of the DB
  migration chain. Restore looks it up in a migration table
  (`MIGRATIONS[n]` upgrades a v`n` document to v`n+1`) and applies steps up to
  the current version. v1 is the first version, so the table starts empty;
  the machinery is in place and tested.
- A `format_version` newer than this Calvin supports is **rejected** before
  anything is written ("made by a newer Calvin, upgrade first"). Missing
  `format`/`format_version`, or a wrong `format`, is rejected as "not a
  Calvin backup".
- `calvin_version` and `schema_revision` are informational (shown in the
  preview). DB rows are re-created through the current models, so DB schema
  drift is absorbed: unknown columns in the backup are ignored, missing ones
  take model defaults.
- Paths are never stored absolute: packages are relative inside the zip and
  land in the target's own `PLUGIN_DIR` / theme dir. Instance configs are
  restored verbatim (e.g. a local-images `image_dir`); this is the only
  deploy-specific content and is called out in the docs.

## Restore semantics

Two modes:

- **replace** (default): the target ends up matching the backup. Config rows,
  keyboard mappings and plugin instances not in the backup are removed
  (kiosks are always merged, see below). Installed plugin packages not in the backup are **not**
  uninstalled (harmless, and uninstalling runs pip); their instances are
  removed.
- **merge**: the backup wins for everything it contains; everything else on
  the target is kept.

Steps, in order:

1. **Validate** (nothing written): zip safety (no absolute paths / `..`,
   size cap), `backup.json` parses, format/version check + migrations,
   structure validated with pydantic models, every package has a manifest.
2. **Plan / preview** (`dry_run`): counts per section; packages to install
   vs already installed (with version differences); instances to create,
   update, remove; instances whose type is neither installed nor in the
   backup (will be skipped); stripped secrets; kiosks; whether a signing key
   is present; config keys added/changed/removed. This is what the dry run and
   the UI preview return.
3. **Safety backup:** before applying, the current setup is exported to
   `<backup dir>/pre-restore-<timestamp>.zip`, so a bad restore can be undone
   by restoring that file.
4. **Apply:**
   1. Install missing plugin/theme packages from the backup through
      `plugin_installer.install_plugin` / `theme_installer.install_theme`
      (pip deps, rollback on failure), then `plugin_loader.load_installed_plugins()`
      and `load_plugin_types_for_single()` / `_register_theme_in_db()`, the
      same steps as the install endpoint. An installed plugin is never
      downgraded or overwritten; a version difference is a warning.
   2. Config rows (replace: delete rows not in the backup), keyboard map,
      plugin type rows (enabled + `display_order`), kiosks. All DB writes go
      through `retry_on_db_locked`.
   3. Instances (plugin type rows are written after them, because updating a
      running instance through the instance manager also sets its type's
      enabled flag): in replace mode, existing instances not in the backup are
      stopped, unregistered and deleted (as the delete endpoint does). Each
      backup instance goes through the instance manager:
      `apply_plugin_config_update(type_id, {**config, "_instance_id": id,
      "_instance_name": name, "_instance_enabled": enabled}, None, db_type)`,
      which creates or updates and starts it. Its `display_order` is then
      set on the row. If the type is not loadable, the instance is kept as a
      disabled row and reported. Secrets stripped from the backup are filled
      from the target's current values; an instance still missing one is
      restored disabled and listed as needing credentials. If the plugin's validation rejects the config (usually a
      stripped secret), the row is written **disabled** with the same id,
      so the layout keeps pointing at it and the user only fills in the
      missing field.
   4. Signing key, if present and `restore_signing_key`.
5. **Result:** the plan plus what actually happened per item, with warnings.
   The UI then reloads so stores pick up the new config.

Restore is not one DB transaction (it spans file installs, pip and live
plugin objects); the safety backup is the undo.

## Ways in

### API (`/api/backup/*`)

- `GET  /backup/export?include_packages=&include_secrets=&include_signing_key=` → zip download.
- `POST /backup/preview` (multipart `file`, `mode`) → plan.
- `POST /backup/restore` (multipart `file`, `mode`, `restore_signing_key`) → result.
- `GET  /backup/files` → stored backups in the backup dir (name, size, time, kind).
- `POST /backup/files` → write a backup to the backup dir now.
- `GET  /backup/files/{name}` → download one; `POST /backup/files/{name}/restore` → restore one (with `mode`, `dry_run`).
- `GET/PUT /backup/schedule` → `{enabled, interval_hours, retention}`.

### Settings UI

Maintenance → new **Backup & restore** section:

- **Download backup**: toggles for "Include plugin packages" (on), "Include
  passwords and API keys" (on, warning text), "Include kiosk signing key"
  (off, warning text), and a Download button.
- **Restore**: file picker → preview (summary counts, packages to install,
  instances skipped / needing credentials, version info, warnings) → mode
  (Replace / Merge) and, if the file has a key, "Also restore kiosk signing
  key" → confirm → result → reload UI.
- **Automatic backups**: enable toggle, interval, keep N; list of stored
  backups with download.

### Headless

- **CLI:** `uv run python -m app.services.backup export [--out FILE] [--no-packages] [--no-secrets] [--include-signing-key]`
  and `uv run python -m app.services.backup restore FILE [--mode replace|merge] [--dry-run] [--restore-signing-key]`.
  The CLI opens the DB and loads plugins the way the server does. Export is
  safe while the server runs; restore should run with the server stopped
  (otherwise use the API).
- **Restore on first start:** at startup, after plugins load and before
  defaults are seeded, Calvin restores from `CALVIN_RESTORE_FROM` (a file
  path), or else from `<backup dir>/restore-on-start.zip|.json` if present.
  Mode from `CALVIN_RESTORE_MODE` (default replace). It runs once per file
  content: the file's SHA-256 is recorded in config key
  `backup_seed_applied_sha256` and a file with the same hash is skipped,
  so the env var can stay set across restarts and the file can live on a
  read-only mount. A failed seed is logged and startup continues.
- **Backup dir:** `BACKUP_DIR` env, else `$CALVIN_DATA_DIR/backups`, else
  `<db dir>/../backups` (`backend/data/backups` in dev,
  `/var/lib/calvin/backups` in Docker).

### Scheduled backups

Off by default. When on, a periodic job (APScheduler, like the existing
schedulers) writes `auto-<timestamp>.zip` to the backup dir every
`interval_hours` (default 24) with packages and secrets, no signing key, and
deletes the oldest `auto-*` files beyond `retention` (default 7).
Pre-restore and manual files are never pruned.

## Decisions made during review (builder's calls, flagged for the reader)

- **Validation failure detection.** `apply_plugin_config_update` returns a
  result without `instance_id` when the plugin's `validate_config` rejects
  the config; that is the signal to write the disabled row directly
  (`PluginDB`, via `retry_on_db_locked`). Restore never calls
  `test_connection`. Creating an instance runs the plugin's normal
  `initialize()`; a failure there is reported per instance and does not stop
  the restore.
- **Kiosks are always merged**, even in replace mode. Kiosks re-register
  themselves on their next poll, and deleting a live device's row would
  drop its overrides for no gain.
- **Install-local config keys.** Keys starting with `backup_` (seed marker,
  automatic-backup schedule) belong to the install, not the setup: they are
  not exported and survive a replace. Everything else in `config`, including
  the security allowlist, sealed mode and git branch, is the user's setup and
  is restored.
- **Dangling layout references.** An instance that cannot be restored (type
  neither installed nor in the backup) is a warning in preview and result,
  not a failure; the layout is left as it is so installing the plugin later
  brings the region back.
- **Trust.** Calvin has no auth layer; `/api/plugins/install` already accepts
  arbitrary plugin zips that run code in-process, so restore does not widen
  that. The doc says so.
- **One restore at a time.** An in-process lock guards restore and the
  automatic backup job; a second restore gets `409`.
- **Seed and defaults.** Seed restore runs right after `_initialize_plugins`
  (which may create the default local-images instance) and before keyboard
  and config defaults, so defaults only fill what the backup does not set.
- **Secret matching** uses the same name rule as `mask_sensitive_config`
  (substring match, recursing into nested dicts) plus schema `password`
  fields, on instance configs and `plugin_<id>_config` rows.
- `KIOSK_SIGNING_KEY_PATH` is the existing `kiosk_signing_key_path` setting;
  `CALVIN_DATA_DIR` is set by the Docker image; `BACKUP_DIR` is new.

## Calls left to the builder

Module layout (`app/services/backup/`), pydantic model details, the exact
size cap, UI copy and layout within the existing settings shell components.
