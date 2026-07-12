# Display-agent apply architecture (dd9.9 + dd9.5) — design

- **Date:** 2026-07-12
- **Status:** Approved (brainstorm), pending implementation plan
- **Issues:** `calvin-dd9.9` (agent applies per-kiosk device-physical — **first slice, detailed here**),
  `calvin-dd9.5` (multi-output content routing — **outlined; own detailed spec later**)
- **Base branch:** `develop` (this doc lives on `feature/dd9.9-agent-apply`)
- **Builds on:** dd9.3 (per-kiosk effective config + `deviceConfigVersion`), dd9.6 (orientation is a
  per-kiosk override). Whole-epic model:
  [2026-07-11-per-kiosk-settings-model-design.md](2026-07-11-per-kiosk-settings-model-design.md).

## Problem

The per-kiosk override store serves device-physical settings (orientation, and future
brightness/output) in each kiosk's effective config, but nothing on the Pi *applies* them: the
backend can't reach a remote kiosk's display. The device-side **display-agent**
(`deploy/kiosk-agent/calvin_display_agent.py`) already polls config for the screen *schedule* and
applies rotation *once from an env var*, but it does not read or apply per-kiosk device-physical
config from the server. This design defines the agent's **apply architecture** and implements its
first consumer (orientation, dd9.9); dd9.5 (multi-output) reuses the same foundation.

## Constraints (the agent's world)

- **Pure Python 3 stdlib** — the kiosk Pi has no venv. `urllib`/`subprocess` only; no `requests`.
- **Idempotent, no-reboot** — apply via `xrandr` (works live). Re-apply only on change.
- **Fail-safe** — a fetch/apply failure must never crash the agent; log and continue the loop.
- **Testable** — `run(...)` already takes injectable `fetch`/`sleep`; add an injectable `applier`
  so the apply path is unit-testable without a real display.

## Shared architecture — the apply loop

### 1. Effective-config fetch (unify on the per-kiosk endpoint)

`fetch_config(backend_url)` currently GETs `${backend}/api/config` (global). Change it to fetch the
kiosk's **effective** config when a kiosk id is present:

- Read `CALVIN_KIOSK_ID` from env (dd9.2 writes it to `/etc/default/calvin-kiosk`).
- If set: `GET ${backend}/api/kiosks/{id}/config?khost=<hostname>` — the merged config incl. per-kiosk
  overrides and `deviceConfigVersion`.
- If unset: `GET ${backend}/api/config` (today's global behavior — backward compatible).

One fetch now feeds **both** the schedule and device-physical, so the schedule becomes per-kiosk too
(a feature: different kiosks can have different on/off times).

### 2. Version-gated device-physical apply

The agent tracks the last-applied `deviceConfigVersion` (from dd9.3, present in the config body). On
each poll:
- read `cfg["deviceConfigVersion"]`;
- if it differs from the last one the agent applied → run the device-physical apply step, then store
  the new version;
- if unchanged → skip (no `xrandr` churn).

This reuses the server-computed hash — no extra request, no local diffing of individual keys. (The
`ETag`/`If-None-Match` → 304 optimization is deliberately skipped: the agent already fetches the full
config for the schedule, so the version rides along in the body.)

State: a small in-memory `last_applied_version` in the loop (reset on agent restart, so a restart
re-applies once — correct and cheap). POST-back of `last_applied_version` to the server is **deferred**
(management-UI/confirmation slice) — dd9.9 tracks locally only.

### 3. Escape-hatch precedence

`CALVIN_DISPLAY_ROTATION` env (device-local break-glass) **wins** over the server orientation:
- if the env is set (non-empty) → apply that xrandr value, ignore the server's orientation;
- else → apply the orientation derived from the effective config.

This preserves dd9.1's device-local override as the top precedence layer:
**device-local env > per-kiosk override > global default** (the last two are already resolved
server-side by dd9.3's merge; the agent only adds the env layer on top).

## dd9.9 — orientation apply (first slice, detailed)

Add device-physical apply to the loop, with **orientation** as the one consumer.

- **Trigger:** on a `deviceConfigVersion` change (per §2), and once at startup.
- **Precedence:** if `CALVIN_DISPLAY_ROTATION` env set → use it (existing startup behavior, now also
  the winning layer in the loop). Else derive from config.
- **Gate:** only apply if `applyDisplayRotation` (config, default True) is truthy.
- **Mapping** (server config → xrandr rotate value) — match `display_orientation_service` exactly:
  ```
  if orientationFlipped:      rotation = "inverted"
  elif orientation == "portrait": rotation = "left"
  else:                       rotation = "normal"   # landscape / unknown
  ```
  (config keys read tolerantly for both camelCase and snake_case, like the existing `cfg_get`.)
- **Apply:** reuse `apply_rotation(rotation, output)` + `detect_primary_output()` (or
  `CALVIN_DISPLAY_OUTPUT` env). These already exist.
- **Structure:** extract an `apply_device_physical(cfg, *, applier=apply_rotation, env=os.environ)`
  function (pure-ish, injectable applier) called from `run()` when the version changed. Keep it small
  and separate from the schedule reconcile.

### Data flow (dd9.9)

```
loop (run):
  cfg = fetch_config(backend)            # /api/kiosks/{id}/config (effective) or /api/config
  if cfg["deviceConfigVersion"] != last_applied_version:
      apply_device_physical(cfg)         # orientation -> xrandr (env escape hatch wins)
      last_applied_version = cfg["deviceConfigVersion"]
  reconcile_schedule(cfg, now)           # existing on/off logic, now per-kiosk
  sleep(until next boundary or refresh)
```

### Testing (dd9.9)

Reuse the existing dependency-injection test pattern (`run(..., fetch=fake, sleep=fake, iterations=N)`,
inject a fake `applier`):
- orientation change (version bump) → applier called once with the mapped xrandr value; portrait→left,
  landscape→normal, flipped→inverted.
- unchanged version across polls → applier NOT called again (version-gating works).
- `CALVIN_DISPLAY_ROTATION` env set → env value applied, server orientation ignored.
- `applyDisplayRotation=false` → no apply.
- fetch failure → loop continues, no crash (existing behavior preserved).
- `CALVIN_KIOSK_ID` set → `fetch_config` targets `/api/kiosks/{id}/config`; unset → `/api/config`.

## dd9.5 — multi-output content routing (outline only; own spec later)

Reuses this loop + effective-config fetch, and adds a distinct, larger dimension:
- An **`outputScreenMap`** override, e.g. `{"HDMI-1": "screen-home", "HDMI-2": "screen-agenda"}`.
- The agent configures the **X multi-output layout** (`xrandr` per output) and launches **a Chromium
  per output**, each pointed at its assigned screen (URL carries the kiosk id + which screen/output).
- This is meatier (multi-Chromium lifecycle + X layout + content routing) and gets its **own
  brainstorm → spec → plan** when we reach it. The only commitment here: the apply loop and the
  effective-config fetch are the foundation it builds on.

## Affected code (dd9.9)

| Area | Path |
|---|---|
| Effective-config fetch (kiosk-id aware) | `deploy/kiosk-agent/calvin_display_agent.py` (`fetch_config`) |
| Version-gated apply + `apply_device_physical` | `deploy/kiosk-agent/calvin_display_agent.py` (`run`, new fn) |
| Reuse rotation apply | `apply_rotation` / `detect_primary_output` (existing) |
| Tests | `deploy/kiosk-agent/test_display_agent.py` |
| Docs | `docs/setup/DEPLOYMENT_TOPOLOGIES.md` (agent now applies per-kiosk orientation) |

No server/API change (dd9.3 already serves everything). No new dependency (stdlib).

## Non-goals

- POST-back `last_applied_version` to the server (management-UI/confirmation slice).
- Brightness / output-selection / resolution apply (follow-on; overlaps dd9.1; brightness needs
  backlight sysfs or `ddcutil`).
- The full dd9.5 multi-output build (own spec/plan).

## Open questions

None blocking. Brightness/output and the POST-back are deliberately deferred; dd9.5 is outlined and
will get its own detailed design.
