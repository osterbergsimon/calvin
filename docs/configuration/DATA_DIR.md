# Data directory

Everything the Calvin backend writes lives under one directory, set with
`CALVIN_DATA_DIR`. Where the server is started from (its working directory)
makes no difference.

| Install | `CALVIN_DATA_DIR` |
|---|---|
| Source checkout (dev, bare-metal Pi) | unset: `backend/data` of the checkout |
| Docker image, compose, Pi server | `/var/lib/calvin` (set in the image; the volume is mounted there) |
| Unraid | `/var/lib/calvin` in the container = `/mnt/user/appdata/calvin` on the host |

## What goes where

| Path under the data dir | Contents | Override |
|---|---|---|
| `db/calvin.db` | SQLite database (Alembic migrates it at startup) | `DATABASE_URL` |
| `images/` | Local Images uploads and their `thumbnails/` | `IMAGE_DIR` |
| `plugins/` | Installed plugins, plus per-instance `scan_cache.json` | `PLUGIN_DIR` (or `PLUGINS_DIR`) |
| `themes/` | Installed themes | `THEMES_DIR` |
| `image_cache/` | Cached remote image bytes | `IMAGE_CACHE_DIR` |
| `logs/` | Backend log directory | `LOG_DIR` |
| `backups/` | Saved and automatic backups | `BACKUP_DIR` |
| `kiosk-signing.key` | Kiosk manifest signing key | `KIOSK_SIGNING_KEY_PATH` |
| `admin-auth.json` | Admin password hash and session-signing secret (mode `0600`) | `ADMIN_AUTH_PATH` |

An override wins over the data dir for that one path; everything else stays
under the data dir. A relative value (for `CALVIN_DATA_DIR` or an override)
is taken relative to the `backend/` directory, not the working directory, so
older `.env` files with `./data/...` paths keep pointing where they used to.
An empty value (`CALVIN_DATA_DIR=`, `BACKUP_DIR=`, ...) counts as unset.

`image_cache/` is bounded so it can't slowly fill an SD card. Past
`IMAGE_CACHE_MAX_MB` (default 500) the least recently viewed images are
evicted, and a single remote image larger than `IMAGE_CACHE_MAX_ITEM_MB`
(default 25) is refused instead of being read into memory.

## Upgrading when the data dir moves

Before `CALVIN_DATA_DIR` was read, everything without its own variable was
written to `backend/data` of the checkout. The dev compose stack
(`setup.sh --mode dev`) is the common case: its database was on the volume,
but uploads, installed themes and the kiosk signing key were in the
bind-mounted checkout.

On the first start with a data dir other than `backend/data`, the backend
copies what it finds there (database, uploads, plugins, installed themes,
caches, backups, kiosk signing key) to where the settings now put it. It
never overwrites a file that already exists, skips the old database when
one is already in place, and leaves the originals where they were. It then
writes `.legacy-data-migrated` in the data dir and does not look again, so
files you delete later are not brought back. The log says how many files
were copied.

## Not in the data dir


- the built-in themes (`backend/data/themes/builtin.json`), which ship with
  the code;
- `alembic.ini` and the migrations, found next to the `app` package; the
  backend refuses to start if `alembic.ini` is missing rather than run on an
  un-migrated database;
- the host updater's log (`<repo>/backend/logs/calvin-update.log`), which is
  shared with `scripts/update-calvin.sh` and only used on native installs.

## Local Images

The Local Images plugin always stores images in `IMAGE_DIR` (by default
`<data dir>/images`). Older installs saved `image_dir: ./data/images` in the
plugin instance's settings; that value is now ignored, so it can no longer
send uploads to a directory that depends on where the server was started.
