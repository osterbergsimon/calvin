# Kiosk Agent Self-Update — Design

**Date:** 2026-07-15
**Status:** Approved (brainstorming), pending implementation plan
**Related:** dd9 epic (per-kiosk settings), dd9.7 (SSE push channel — future upgrade of the poll nudge)

## Problem

A provisioned Calvin kiosk runs `calvin_display_agent.py` (display rotation, resolution,
on/off schedule) as the systemd unit `calvin-display-agent.service`. Today there is **no
path to update that agent after provisioning** short of a full SD re-flash or manual SSH.
The server side already has a self-update story (`scripts/update-calvin.sh` +
`/etc/default/calvin-update` + `POST /api/update`); the kiosk side has nothing equivalent.

A second problem surfaced while scoping: `setup-kiosk.sh` **git-clones the entire calvin
repo** to `/home/calvin/calvin` (`ensure_repo_for_unit_files`) only to copy out ~7 files.
A pure kiosk does not need the backend/frontend/plugins/docs tree. This design removes that
full checkout.

## Goals

- An admin can trigger a kiosk-agent update **from the Calvin server UI** (a button in
  Kiosks settings). No inbound connection to the Pi is required — the update rides the
  existing pull-based config poll.
- The kiosk fetches its update **from the local Calvin server** (the backend it already
  polls and trusts), with no dependency on GitHub reachability. GitHub-raw is an optional
  provisioning-time fallback only.
- Updates are **safe on an unattended Pi**: verify before swap, keep a backup, and
  automatically roll back if the new agent fails to come up healthy.
- **Python version skew across Pis never bricks a kiosk.**
- The kiosk stops carrying a full repo checkout.

## Non-goals

- SSE push to replace the poll-based nudge — that is dd9.7, a future upgrade. This design
  deliberately uses the existing config poll (dd9 "Option 1").
- Compiling the agent into a binary (PyInstaller / PyCrucible / Nuitka). Rejected: those
  produce **architecture-specific artifacts**, so the x86 server could not serve them from
  its own checkout without a cross-build/CI pipeline — the exact cost this design avoids.
  The agent stays as source. See "Packaging" below.
- Autonomous background self-update. Trigger is admin-initiated (a background cadence can be
  added later on top of the same mechanism).

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Trigger | Admin-triggered from the server UI |
| Source | Local Calvin server serves the bundle from its checkout; GitHub-raw optional fallback |
| Packaging | Source file bundle (no full repo, no compiled binary) |
| Scope | Whole ~7-file bundle; restart only the services whose files changed |
| Safety | Verify (`py_compile` + checksum) + backup + auto-rollback |

## The kiosk bundle

The files a pure kiosk needs — the entire update surface:

| Bundle file | Installed to | Restart unit |
|---|---|---|
| `deploy/kiosk-agent/calvin_display_agent.py` | `/usr/local/bin/calvin_display_agent.py` | `calvin-display-agent.service` |
| `deploy/systemd/calvin-display-agent.service` | `/etc/systemd/system/…` | `calvin-display-agent.service` |
| `deploy/systemd/calvin-kiosk-remote.service` | `/etc/systemd/system/…` | `calvin-kiosk-remote.service` |
| `deploy/systemd/calvin-x.service` | `/etc/systemd/system/…` | `calvin-x.service` |
| `deploy/kiosk-agent/update-kiosk.sh` *(new)* | `/usr/local/bin/update-kiosk.sh` | — |
| `deploy/systemd/calvin-kiosk-update.service` *(new)* | `/etc/systemd/system/…` | — |

`install_systemd_service` and `install_script` are plain `cp` (verified — no templating), so
installed files are byte-identical to their bundle sources. That makes a content hash a valid
version and makes "restart only what changed" a simple installed-vs-incoming hash compare.

## Versioning — content hash, no manual bumps

The bundle **version** is a truncated SHA-256 over the sorted `(name, bytes)` of the bundle
files (mirrors `device_config_version` in `kiosk_registry.py`). The backend computes it from
`settings.repo_dir`; the version changes exactly when the files change, so there is no VERSION
constant to maintain.

The **running version** is recorded by the updater into a state file on the device
(`/var/lib/calvin/agent-version.json`) after a successful apply. The agent reads that file to
report its running version — it does not re-hash installed files (which would couple the
report to install-path details). The initial value is seeded by `setup-kiosk.sh` at
provisioning.

## Backend

### Bundle-serving endpoints (public, LAN-trust — same posture as `/api/config`)

- `GET /api/kiosks/agent/manifest` →
  ```json
  {
    "version": "<16-hex>",
    "min_python": "3.9",
    "files": [
      { "name": "calvin_display_agent.py", "sha256": "…", "mode": "0755",
        "target_path": "/usr/local/bin/calvin_display_agent.py",
        "restart_unit": "calvin-display-agent.service" }
    ]
  }
  ```
  Built from `settings.repo_dir`. `min_python` is a declared constant (see Python
  compatibility).
- `GET /api/kiosks/agent/files/{name}` → raw bytes, **allowlisted to the manifest's `name`
  set** (path-traversal safe).

### Registry + config changes

- New `KioskDB` columns (Alembic migration): `agent_version` (running, reported by the
  agent), `agent_update_status` (`ok` | `updating` | `error:<reason>`). `last_applied_version`
  already exists and is reused for the last successfully-applied bundle version.
- `GET /api/kiosks/{id}/config` gains `agentAvailableVersion` (the server's current bundle
  version) and `agentUpdateRequested` (bool).
- The config poll ingests the agent self-report via query params, piggybacking the existing
  `khost` pattern: `kagent=<running_version>`, `kstat=<ok|updating|error>`. Stored on the
  registry row.
- `POST /api/kiosks/{id}/update` sets the per-kiosk `agentUpdateRequested` flag. The flag is
  cleared when the agent next reports `running == available`. (`POST /api/kiosks/update-all`
  fans the flag across kiosks for the UI "Update all" action.)

## Agent (`calvin_display_agent.py`)

The agent performs **no privileged work in-process**. Additions:

- Read the running version from `/var/lib/calvin/agent-version.json`; send `kagent`/`kstat`
  on every config poll.
- On each poll, if `agentUpdateRequested` is true **and** `running != agentAvailableVersion`:
  trigger the privileged updater (below) and keep running normally.
- Record the version just attempted. If an attempt fails / rolls back, do **not** retry the
  same version automatically — report `error` and wait for a fresh admin trigger. This
  prevents a broken-bundle retry loop.
- Startup **Python version guard**: check `sys.version_info` against the floor and exit with a
  readable log line if below it.

## Updater — privileged oneshot that survives the agent restart

The agent runs unprivileged as `calvin`, but swapping files under `/usr/local/bin` and
`/etc/systemd/system` and running `systemctl restart` requires root — and the updater must
**outlive the restart of the very service that spawned it**.

- `calvin-kiosk-update.service` (new): `Type=oneshot`, root, `ExecStart=/usr/local/bin/update-kiosk.sh`.
- The agent triggers it with a narrowly-scoped sudoers rule
  (`/etc/sudoers.d/calvin-kiosk-update`):
  `calvin ALL=(root) NOPASSWD: /bin/systemctl start --no-block calvin-kiosk-update.service`.
  Because the updater is its **own** unit, restarting `calvin-display-agent.service` does not
  kill it.

`update-kiosk.sh` (new) mirrors `update-calvin.sh`:

1. Fetch the manifest from `$CALVIN_BACKEND_URL/api/kiosks/agent/manifest`.
2. **`min_python` precheck** — if the manifest's `min_python` exceeds the device's `python3`,
   abort with `error: python-too-old`, keep the current agent, report the state. (See Python
   compatibility.)
3. Fetch each file whose incoming hash differs from the installed file.
4. **Verify:** checksum every fetched file against the manifest; `py_compile` the agent under
   the device's own `python3`.
5. **Back up** current versions of the files about to change to `/var/lib/calvin/agent-backup/`.
6. **Atomically swap** only the changed files (write temp + `mv`); `daemon-reload` if any unit
   file changed; restart only the services whose files changed.
7. **Auto-rollback:** after restart, confirm the agent is healthy — service `active`, not
   crash-looping (`systemctl show -p NRestarts`), and the agent touched a readiness marker
   within a timeout. On failure, restore the backup, restart the previous agent, write
   `status=error`.
8. Write the applied version to `/var/lib/calvin/agent-version.json` and a
   `calvin-update-state.json`-style state file on success.

## setup-kiosk.sh changes (removes the full-repo clone)

- Delete `ensure_repo_for_unit_files`'s full `git clone` of `/home/calvin/calvin`. Instead
  fetch the bundle (manifest + files) from `$BACKEND_URL/api/kiosks/agent/…` — the kiosk
  already has `CALVIN_BACKEND_URL` at firstboot — with GitHub-raw as fallback. Install the
  agent + units from the fetched bundle and seed `/var/lib/calvin/agent-version.json`.
- Additionally install `update-kiosk.sh`, `calvin-kiosk-update.service`, and the
  `/etc/sudoers.d/calvin-kiosk-update` rule.
- Net: the Pi carries only what it runs — no working tree.
- The stale `ensure_repo_for_unit_files` comment ("We only need the systemd unit files") goes
  away with the function.

## Frontend — Kiosks settings

The Kiosks list already shows `lastSeen` / `lastAppliedVersion`. Add:

- Running version vs available version.
- An **Update** button per kiosk, enabled when `running != available`.
- An **Update all** action.
- Update-in-progress / failed status surfaced from `agent_update_status` (including the
  `python-too-old` case → "kiosk needs OS update").

## Python version compatibility

Field Pis run different Pythons (Bullseye 3.9, Bookworm 3.11, Trixie ≈ 3.13). A pure-stdlib,
version-tolerant script is *more* robust to this than a pinned bundled interpreter, provided
we hold a floor and test the range.

- **Floor: Python 3.9**, matching the agent's existing defensive `zoneinfo`/`ZoneInfo` import
  fallback. Bookworm/3.11 is the primary tested platform.
- **Startup guard** in the agent (`sys.version_info`).
- **CI matrix** runs the agent tests under 3.9 / 3.11 / 3.13 — cheap because stdlib-only.
- **`min_python` in the manifest + updater precheck** makes skew explicit and safe:
  verification runs on-device under the device's interpreter, so a too-new bundle is declined
  locally (updater refuses; `py_compile` would also fail) and the kiosk keeps its working
  agent. Version skew degrades gracefully to "stays on last-compatible version," never a
  brick.

## Packaging (why source, not a binary)

Considered and rejected: **PyInstaller / PyCrucible / Nuitka**. All produce
architecture-specific artifacts, so the x86 server cannot serve them from its checkout without
a cross-build/CI pipeline — defeating the local-server-serves-source model. The agent has zero
third-party deps and is single-file stdlib, so a bundler's value proposition (dependency
bundling, reproducible env) does not apply. Binaries are also worse for the verify/diff/backup
safety model. PyCrucible additionally relies on `uv` provisioning Python at runtime, adding a
toolchain + network bootstrap the Pi does not need.

**Documented future option:** if the agent ever grows past one file, package it as a stdlib
`zipapp` `.pyz` — arch-independent, no CI, runs on the system `python3`. That preserves every
property this design relies on.

## Testing

- **Backend unit tests:** version computation; file-serving allowlist / traversal safety;
  config payload fields (`agentAvailableVersion`, `agentUpdateRequested`); update-flag
  set/clear; registry ingestion of `kagent`/`kstat`.
- **Agent pytest** (extend `deploy/kiosk-agent/test_display_agent.py`): version read from
  state file; report params in the poll URL; update-trigger decision (mock `systemctl start`);
  no-retry-loop on a failed version; startup Python-version guard.
- **Updater shell tests** (`scripts/tests/` style, mocked `curl`/`systemctl`): verify; backup;
  restart-only-changed; auto-rollback; `min_python` precheck abort.
- **setup-kiosk shell test:** bundle fetch replaces the clone; updater + sudoers installed.

## Rollout note

The bundle-serving endpoints must exist on the server **before** kiosks can update from it, and
`setup-kiosk.sh`'s bundle fetch depends on them too. Order: ship backend endpoints → ship agent
+ updater + setup-kiosk changes → ship UI. A kiosk provisioned against an older server (no
bundle endpoint) falls back to GitHub-raw at provisioning time.

## Open questions for implementation

- Exact readiness-marker mechanism for the health check (touch a file under `/run/calvin/` on
  first successful config fetch vs. rely on `systemctl is-active` + `NRestarts` alone).
- Whether "Update all" is in the first cut or a fast follow.
