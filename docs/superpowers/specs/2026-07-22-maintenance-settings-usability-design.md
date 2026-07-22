# Deployment-aware Maintenance settings — design

**Date:** 2026-07-22 · **Bead:** calvin-ebl

## Problem

The Settings → Maintenance tab was designed for the retired "native systemd on a
Pi with a repo checkout" deployment. Calvin now runs in two supported topologies
(docs/setup/DEPLOYMENT_TOPOLOGIES.md), and in **both** the backend is a Docker
container (`ghcr.io/osterbergsimon/calvin`):

- **Mode A** — all-in-one Pi: container + kiosk browser on one Pi.
- **Mode B** — server container + one or more dumb kiosk Pis running Chromium
  and the Python display-agent.

Inside the container the Maintenance tab's primary actions are dead:

| Control | Current behavior in Docker |
|---|---|
| Update now | HTTP 404 — `/usr/local/bin/update-calvin.sh` exists on the host, not in the container |
| Check status → Update state | "Unknown — update log not found" |
| Repository / Branch fields | Drive a git flow the prod updater doesn't use (`docker compose pull`); branch listing runs git in the container where there is no repo |
| Restart backend / frontend | HTTP 500 — no `systemctl`, no helper script in the container |

Meanwhile the one update mechanism that **is** live and in-product — the kiosk
agent self-update (Mode B) — is a small per-kiosk button in Settings → Kiosks,
not visible from Maintenance at all.

## Goals

1. Never show an action that is guaranteed to fail in the current deployment.
2. Where the *host* owns the action (image pull), say so and tell the user how.
3. Make "Restart backend" actually work in Docker deployments.
4. Surface kiosk agent updates in Maintenance (fleet overview) since that is
   the update functionality that still matters.
5. Keep Diagnostics and Reload UI as-is (they always work).

Non-goals: orchestrating server image updates from inside the container
(requires docker-socket access — rejected on security grounds); merging the
Kiosks and Maintenance categories; changing the kiosk-agent update mechanism.

## Design

### 1. Backend: `GET /api/system/environment`

New endpoint in `backend/app/api/routes/system.py`:

```json
{
  "deployment": "docker" | "native",
  "is_dev_mode": false,
  "update_supported": false,
  "restart_backend_supported": true,
  "restart_frontend_supported": false
}
```

- `deployment`: `"docker"` when `/.dockerenv` exists (or `CALVIN_CONTAINER=1`
  env is set, an escape hatch for other container runtimes); else `"native"`.
- `is_dev_mode`: existing `settings.is_dev_mode`.
- `update_supported`: `settings.get_update_script_path().exists()` — the exact
  check `POST /system/update` performs.
- `restart_backend_supported`: existing `_restart_mechanism_available()` **or**
  running in a container (see §2).
- `restart_frontend_supported`: `_restart_mechanism_available()` only — a
  separate frontend service exists only on legacy native installs.

### 2. Backend: container-aware backend restart

`POST /system/restart-backend` gains a Docker path: when no helper script and
no `systemctl` are available **and** we are in a container, respond 200 then
(after the existing `_BACKEND_RESTART_DELAY_SEC`) send `SIGTERM` to our own
process. Uvicorn shuts down gracefully; the compose `restart: unless-stopped`
policy starts a fresh container. The response message says the container is
restarting. Native behavior is unchanged; the no-mechanism 500 remains for
"native and nothing available".

Risk note: if someone runs the container with `--restart no`, the backend stays
down. Accepted — the shipped compose file and Unraid template both set a
restart policy, and the confirm dialog wording ("the container will restart via
its restart policy") makes the assumption visible.

### 3. Frontend: deployment-aware Maintenance tab

`MaintenanceSettings.vue` fetches `/api/system/environment` on mount (cached in
`useSystem`'s singleton state; fall back to "show everything" on fetch failure
so a transient error can't hide working controls).

Sections, in order:

1. **Updates** —
   - `update_supported` → today's `UpdatesTab` (repo/branch/status flow),
     unchanged.
   - else → a guidance panel (no dead buttons): explains that this server is
     updated by pulling the published image, with the concrete command
     (`sudo /usr/local/bin/update-calvin.sh` on the host, or
     `docker compose pull && docker compose up -d`). One sentence, one
     code line — not a wall of text.
2. **Kiosk agents** *(new)* — rendered only when at least one kiosk has ever
   registered. A compact list reusing `useKiosksStore`: kiosk id, online dot,
   agent version → available bundle version, and an Update button when stale
   (same store call as Settings → Kiosks; `agentUpdateRequested` renders as
   "Updating…", error status as "needs OS update"). Empty-state: section is
   omitted entirely in Mode A (no kiosks — zero noise for all-in-one users).
   The existing per-kiosk button in Settings → Kiosks stays (documented flow);
   both views share the same store so state stays consistent.
3. **System** — "Restart backend" only when `restart_backend_supported`;
   "Restart frontend" only when `restart_frontend_supported`; "Reload UI"
   always.
4. **Diagnostics** — unchanged.

### 4. Registry / search

`settingsRegistry.js`:

- Maintenance category subtitle → `"Updates · agents · diagnostics"`.
- `maintenance-updates` keywords gain `docker`, `image`, `pull`, `version`.
- New destination `maintenance-kiosk-agents` (path "Maintenance / Kiosk
  agents", keywords: kiosk, agent, update, bundle, fleet).
- New destination `maintenance-system` (path "Maintenance / System", keywords:
  restart, reload, backend).

### 5. Docs

- `DEPLOYMENT_TOPOLOGIES.md` §"Kiosk agent self-update": mention agents can
  also be updated from Settings → Maintenance → Kiosk agents.

## Data flow

```
MaintenanceSettings.vue ──mount──> GET /api/system/environment ─┐
        │                                                       ▼
        │                                   conditional sections render
        ├── Updates (supported) ──> existing useSystem update flow
        ├── Updates (unsupported) ──> static guidance (no API calls)
        ├── Kiosk agents ──> useKiosksStore.loadKiosks / fetchAvailableAgentVersion
        │                    └─ Update ──> store.triggerUpdate(id) ──> POST /api/kiosks/{id}/agent/update
        └── Restart backend ──> POST /system/restart-backend
                                  └─ docker: 200 → delayed SIGTERM → compose restarts
```

## Error handling

- `/api/system/environment` unreachable → treat all capabilities as available
  (current behavior); actions still fail loudly server-side as today.
- Docker restart: health-wait loop in `useSystem.restartBackend` already
  handles the gap while the container restarts; no frontend change needed.
- Kiosk agent list load failure → section shows the store's error state text,
  not a crash.

## Testing

Backend (pytest):
- `test_system_environment.py`: docker detection (tmp `/.dockerenv` monkeypatch
  + env var), capability flags for each combination (script present/absent,
  restart mechanism present/absent, container yes/no).
- Extend `test_system_restart_helpers.py`: container restart path schedules a
  self-signal and returns 200; native no-mechanism still 500s.

Frontend (vitest):
- `MaintenanceSettings.spec.js`: renders UpdatesTab when supported; renders
  guidance (and no update buttons) when not; restart rows hidden per
  capability; kiosk agents section renders only with registered kiosks;
  Update button triggers store call.
- `settingsRegistry.spec.js`: new destinations resolve.
