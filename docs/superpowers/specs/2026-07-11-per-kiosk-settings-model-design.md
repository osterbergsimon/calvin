# Per-device (per-kiosk) settings model — design

- **Date:** 2026-07-11
- **Status:** Approved (brainstorm), pending implementation plan
- **Epic:** `calvin-dd9`
- **Children:** `dd9.1` (Tier-1 display settings), `dd9.2` (kiosk identity — keystone), `dd9.3` (per-kiosk config store + merged `/api/config`), `dd9.4` (content assignment), `dd9.5` (multi-screen), `dd9.6` (orientation home), `dd9.7` (SSE upgrade — deferred)
- **Base branch:** `develop` (this design lives on `feature/dd9-kiosk-model`)

## Problem

Calvin is shifting from all-in-one Pis (Mode A) to a central server + multiple dumb
kiosk Pis (Mode B, see [DEPLOYMENT_TOPOLOGIES.md](../../setup/DEPLOYMENT_TOPOLOGIES.md)).
In Mode B the backend and its data live on a server; each Pi runs only Chromium against
the server URL.

The server config is a single **flat global JSON blob** served at `GET /api/config`
(stored as key-value rows in `ConfigDB` via `config_service`, merged on `PUT`). It mixes
three concerns that no longer share a home once one server drives many kiosks:

1. **Device-physical** — `orientation`, `orientationFlipped`, `applyDisplayRotation` (and,
   in scope for this epic, brightness / resolution / which HDMI output). These are physical
   to a specific Pi. The backend used to apply them locally via `xrandr`/`vcgencmd` in the
   `main.py` lifespan (`display_orientation_service`, `display_power_service`); a **remote**
   backend cannot reach a kiosk's display.
2. **Content/layout** — `dashboardLayout`, `dashboardScreens` (already a `version: 2` model
   with a `screens[]` catalog + `activeScreenId`). Different kiosks may want to show
   different screens.
3. **UI prefs** — theme, time format, keyboard combos, etc. Genuinely global.

Two regressions triggered this epic (screen power schedule and rotation on a converted Pi);
both are instances of the same gap. Screen scheduling was already solved with a device-local
**display-agent** (`deploy/kiosk-agent/calvin_display_agent.py`) that reads the schedule from
`/api/config` and applies it locally. This epic defines the broader model.

## Goals

- A stable **per-kiosk identity** so the server can distinguish kiosks (the keystone).
- A single **config resolution model** (layered merge) that yields a per-kiosk view of config.
- **UI-authored** device-physical settings (rotation/brightness/output) with **no SSH** —
  the display-agent applies them device-side from values the server hands it.
- Per-kiosk **content assignment** without re-authoring dashboards.
- **Full backward compatibility**: a request with no kiosk id behaves exactly as today.

## Non-goals (this epic / deferred)

- SSE push for instant apply — deferred to `dd9.7` (version-poll is the core mechanism).
- Multi-output-per-Pi content mapping — `dd9.5`, an optional extension of the content override.
- Reworking the global UI-prefs set. Those stay global.

## The model — layered resolution (decision: option A)

The server holds **global** config (unchanged, in `ConfigDB`) plus an optional **sparse
per-kiosk `overrides`** map. A kiosk's effective config is:

```
device-local env (/etc/default/calvin-kiosk, optional escape hatch)
        ▲ wins over
per-kiosk override (server, authored in UI)   ← primary authoring surface
        ▲ wins over
global config (server default)
```

- `GET /api/config?kiosk=<id>` → `deepmerge(global, overrides[id])`.
- No `kiosk` param ⇒ no override lookup ⇒ **exactly today's global response**.
- Sparse: a kiosk inherits global for every field it doesn't override. A global change
  reaches every kiosk that hasn't overridden that field.

This one mental model subsumes `dd9.3` (per-kiosk store + merged config), `dd9.4` (content),
and `dd9.6` (orientation): each is just a field resolved through the layers.

### Device-physical settings: authored in server config, applied by the agent

Key design pivot from the original two-tier sketch: device-physical settings
(rotation/brightness/output) are **authored per-kiosk in the server config / UI**, not in a
device-local env file. The backend still can't run `xrandr` on a remote Pi — so the
**display-agent** is the device-side applicator:

1. Agent knows its own `CALVIN_KIOSK_ID` (see identity below).
2. Agent reads `GET ${CALVIN_BACKEND_URL}/api/config?kiosk=<id>` (already polls this URL for
   the schedule).
3. If rotation/brightness/output changed since last apply, it runs `xrandr` (rotation/mode/
   output) or backlight sysfs/`ddcutil` (brightness). `xrandr --output X --rotate left`
   applies live while Chromium runs — no reboot.

The device-local `/etc/default/calvin-kiosk` shrinks to **bootstrap only**
(`CALVIN_BACKEND_URL`, `CALVIN_KIOSK_ID`), plus an **optional escape hatch**:
`CALVIN_DISPLAY_ROTATION` (and future `CALVIN_DISPLAY_*`) remain honored and **win over the
UI value**, per the precedence order, for break-glass on a misbehaving Pi without touching
the server. This env already ships on `develop`; keeping it is backward-compatible.

## Kiosk identity (dd9.2 — the keystone)

- **Storage:** `CALVIN_KIOSK_ID` in `/etc/default/calvin-kiosk`, written once by
  `setup-kiosk.sh`. Operator-editable to a friendly name (`kitchen`, `hallway`).
- **Default recipe:** `<hostname>-<suffix>`, where `<suffix>` is a short (~6-char) slice of a
  stable per-device source, in preference order:
  1. `/etc/machine-id` (present on all systemd Pis; changes on re-image — correct, a
     re-imaged card *is* a new kiosk)
  2. primary NIC MAC (fallback)
  3. Pi CPU serial from `/proc/cpuinfo` (last resort)

  Rationale: a stock Pi OS image defaults the hostname to `raspberrypi`, so hostname alone
  collides across multiple Pis. Two stock Pis become `raspberrypi-3f9a2c` / `raspberrypi-b71e04`
  — unique, stable, readable.
- **Transport:** **query param** `?kiosk=<id>` on `/api/config` and data requests, baked into
  the Chromium kiosk URL. Chosen because it's the only option that survives the Mode-B
  constraints (dumb Pi, no proxy, top-level Chromium navigation can't set request headers)
  without extra machinery, and the display-agent reuses the same param verbatim. The frontend
  reads the id from its own URL and threads it onto its API/XHR calls.
- **Registration:** on any request carrying a `kiosk` id, the server upserts a `Kiosk` row
  (id, hostname, last-seen). The UI can then list/manage known kiosks.

## Server storage — `Kiosk` table (decision: dedicated table)

Introduce one Ormar/SQLite model, matching the existing ORM idiom. The kiosk **registry**
(`dd9.2`) and the **overrides store** (`dd9.3`) are the same table:

| column                | purpose                                                        |
|-----------------------|----------------------------------------------------------------|
| `id` (PK)             | `CALVIN_KIOSK_ID`                                               |
| `hostname`            | reported by the kiosk (shown next to id to spot duplicates)    |
| `last_seen`           | updated on each request carrying the id                        |
| `last_applied_version`| device-config version the agent last confirmed applied         |
| `overrides` (JSON)    | sparse per-kiosk config (device-physical + content fields)     |

Global config stays in `ConfigDB` / `config_service`, untouched. No id on a request ⇒ no
table lookup ⇒ today's exact behavior. DB writes wrap with `retry_on_db_locked` per house
rules.

## The nudge — version-poll / conditional GET (dd9.x, core; SSE = dd9.7)

So a UI change applies without SSH and feels near-instant:

- Server computes a cheap **`deviceConfigVersion`** per kiosk = hash of that kiosk's resolved
  device-physical settings (rotation/brightness/output/schedule). Exposed as an **ETag** on
  `GET /api/config?kiosk=<id>` (or a tiny `GET /api/kiosk/<id>/device-version` → `{version}`).
- Agent runs **two cadences**: a cheap fast-poll every ~10–15s (`If-None-Match` → usually
  `304`), plus its existing slow full-refresh. On version change → fetch → diff → apply.
- **"Apply now"** in the UI is *not* a special endpoint — a normal save bumps the version; the
  agent catches it within one fast-poll (~15s).
- **Confirmation loop:** on apply, the agent POSTs back its `last_applied_version` + result, so
  the UI can show **Applied ✓ / applying… / kiosk offline** instead of firing blind.

Rationale: near-instant *feel* with no persistent connections; survives network drops/proxies;
matches the codebase's existing polling idiom (`configPollInterval`, the agent's schedule
poll). `StreamingResponse(text/event-stream)` is already proven in `system.py`, but the only
existing SSE is a bespoke update-log tailer, so a real push channel is genuinely new infra →
deferred to `dd9.7`.

## Content assignment (dd9.4; multi-screen dd9.5 deferred)

Keep the `screens[]` **catalog global** (authored once in the UI). The per-kiosk override adds
two small fields only:

- `availableScreens: [ids]` — optional allowlist of which global screens this Pi may show
  (default: all). The kiosk's existing screen-switching UI/keyboard is unchanged, just filtered
  to this set.
- `defaultScreenId` — which screen this Pi boots into. Runtime `activeScreenId` stays local +
  user-switchable; the per-kiosk default just seeds it.

No per-kiosk screen authoring. **Multi-output (`dd9.5`)** later adds an optional
`outputScreenMap` (e.g. `{"HDMI-1":"screen-home","HDMI-2":"screen-agenda"}`) on the same
override — a future extension, not built in the core.

## Orientation decision (dd9.6)

- **Canonical home:** per-kiosk **server config**, authored in the UI, applied device-side by
  the display-agent. (This resolves `dd9.6` toward option (b)/(c) with device-local winning as
  the escape hatch — consistent with the shipped rotation work.) Orientation/rotation is
  **stripped from / not authoritative in the un-scoped global response** for a kiosk that has a
  per-kiosk value; global remains a default.
- **`display_orientation_service`** (`main.py` lifespan, backend-local `xrandr`): make it
  **Mode-A-only** — no-op / skip when it can't reach a local display — so single-Pi setups keep
  working and Mode B doesn't error. (Not deleted; least-disruptive.)
- **Settings UI orientation control:** keep it, but it now writes the **per-kiosk override**
  (when a kiosk is selected) or the **global default** (unscoped). Relabel accordingly.

## UI surface

- A **Kiosks** view (extends the settings area; `DeviceSettings.vue` / `DisplaySettings.vue`
  are the neighbors) lists known kiosks from the `Kiosk` table: id, hostname, last-seen,
  apply status.
- Selecting a kiosk scopes the device-physical + content controls to that kiosk's override;
  unscoped edits write the global default. Prefer schema-driven rendering where the existing
  settings components already cover the field type (house rule: schema-driven UI first).

## Backward compatibility

- No `kiosk` param anywhere ⇒ no `Kiosk` lookup ⇒ `GET /api/config` returns today's global blob.
- Mode-A all-in-one Pi keeps working: `display_orientation_service` still applies locally
  (Mode-A-only guard is a no-op there), and a Mode-A install can run without a kiosk id.
- The device-local `CALVIN_DISPLAY_ROTATION` escape hatch keeps its current semantics.

## Affected code (anchors)

| Area | Path |
|---|---|
| Config route (`GET/PUT /api/config`) | `backend/app/api/routes/config.py` |
| Config storage | `backend/app/services/config_service.py`, `backend/app/models/db_models.py` (`ConfigDB`; new `Kiosk` model) |
| Backend-local display services | `backend/app/services/display_orientation_service.py`, `display_power_service.py`, `backend/app/main.py` lifespan |
| Display-agent (device-side applicator) | `deploy/kiosk-agent/calvin_display_agent.py` (+ tests) |
| Kiosk provisioning | `scripts/setup-kiosk.sh`, `deploy/calvin.env.example`, `/etc/default/calvin-kiosk` |
| Frontend config polling + kiosk id threading | `frontend/src/stores/config.js` (+ related stores), kiosk URL |
| Settings UI | `frontend/src/components/settings/categories/DeviceSettings.vue`, `DisplaySettings.vue`, new Kiosks view |
| Docs | `docs/setup/DEPLOYMENT_TOPOLOGIES.md` |

## Incremental delivery (maps to children)

1. **`dd9.2` (keystone):** `Kiosk` model + upsert-on-request; `CALVIN_KIOSK_ID` in
   `setup-kiosk.sh` (default recipe); query-param transport; frontend threads the id; server
   records/lists kiosks. *No behavior change without an id.*
2. **`dd9.3`:** `overrides` column + merged `GET /api/config?kiosk=<id>`; `deviceConfigVersion`
   /ETag; agent fast-poll + apply + confirmation POST-back.
3. **`dd9.6`:** move orientation authoring to per-kiosk/global-default; Mode-A-only guard on
   `display_orientation_service`; relabel the UI control.
4. **`dd9.1` follow-ups:** extend the agent's device-physical application to brightness /
   resolution / primary-output, driven by the same override fields.
5. **`dd9.4`:** `availableScreens` + `defaultScreenId` override + Kiosks UI scoping.
6. **`dd9.5`:** optional `outputScreenMap` for multi-output Pis.
7. **`dd9.7`:** SSE push channel replacing the version-poll for instant apply (also evaluate
   pushing config to the browser + live kiosk status).

## Testing strategy

- **Backend:** unit tests for layered `deepmerge(global, overrides)` incl. sparse + empty cases;
  `Kiosk` upsert/registry; `deviceConfigVersion` stability (same inputs → same hash) and change
  detection; `GET /api/config` unchanged when no id (regression guard for backward compat).
- **Agent:** extend `deploy/kiosk-agent/test_display_agent.py` — version-poll `304` fast path,
  apply-on-change, escape-hatch env precedence, confirmation POST-back.
- **Frontend:** config store threads `kiosk` id onto requests; Kiosks list renders registry.

## Open questions

None blocking. Deferred by design: SSE (`dd9.7`), multi-output mapping (`dd9.5`), and the exact
brightness backend (backlight sysfs vs `ddcutil`) which is a `dd9.1` follow-up detail.
