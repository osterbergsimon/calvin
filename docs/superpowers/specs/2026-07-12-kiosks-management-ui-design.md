# Kiosks management UI (list + orientation editor) — design

- **Date:** 2026-07-12
- **Status:** Approved (brainstorm), pending implementation plan
- **Issue:** epic `calvin-dd9` (the management-UI surface; new child to file)
- **Base branch:** `develop` (this design lives on `feature/kiosks-management-ui`)
- **Builds on:** dd9.2 (`GET /api/kiosks`), dd9.3 (`GET/PUT /api/kiosks/{id}/overrides`), dd9.6/dd9.9
  (orientation is a per-kiosk override the display-agent applies).

## Problem

Everything to configure a kiosk exists in the API, but there is no UI: per-kiosk overrides can only
be set with `curl`. This slice adds a **Kiosks** settings view that lists known kiosks and lets an
operator set the selected kiosk's **orientation** override — the first, end-to-end-usable increment
of per-kiosk management. Content assignment (`availableScreens`/`defaultScreenId`) and the confirmed
apply-status are follow-ons.

## Design principle (frontend-design)

This view lives inside Calvin's existing settings shell (`CategoryRail`, `SettingsSection`,
`SettingRow`, `SegmentedControl`, `ToggleSwitch`) — **reuse the existing design tokens/components; do
not introduce a new palette or type.** The one considered, subject-true element is the **apply-status
signature**: this UI manages *physical screens over a network*, so it makes each kiosk's connection
state visible rather than pretending config is applied instantly.

## Components / files

| Unit | Path | Responsibility |
|---|---|---|
| Kiosks store | `frontend/src/stores/kiosks.js` (new) | fetch list + per-kiosk overrides; save overrides; network-first + cache fallback |
| Kiosks category view | `frontend/src/components/settings/categories/KiosksSettings.vue` (new) | master–detail: kiosk list + selected-kiosk orientation editor |
| Category registration | `frontend/src/components/settings/settingsRegistry.js`, `frontend/src/views/Settings.vue` | add the `kiosks` category entry + id→component mapping |
| Tests | `frontend/tests/unit/stores/kiosks.spec.js`, `frontend/tests/unit/components/KiosksSettings.spec.js` (new) | store + view behavior |

## 1. Kiosks store (`stores/kiosks.js`)

Pinia store, axios, following `stores/webServices.js`'s network-first + `utils/cache.js` fallback
pattern:
- `kiosks` (ref, list) + `loadKiosks()` → `axios.get("/api/kiosks")` → `{kiosks:[...]}`; on network
  failure fall back to cached list (TTL cache), on success update cache.
- `fetchOverrides(id)` → `axios.get(/api/kiosks/${id}/overrides)` → `{id, overrides}`; returns the
  raw override layer (or `{}`). `404` (unknown kiosk) → treat as `{}` (not yet overridden).
- `saveOverrides(id, overrides)` → `axios.put(/api/kiosks/${id}/overrides, {overrides})` (replaces the
  whole layer). Updates the store's cached copy on success.
- IDs are URL-path components — `encodeURIComponent(id)` in the URLs.

## 2. Kiosks category view (`KiosksSettings.vue`) — master–detail

```
 Kiosks ─────────────────────────────────────────────
  ┌ kitchen-3f9a2c ───────────────────── ● Online ┐   ← select
  │ raspberrypi · seen 4s ago                      │
  └────────────────────────────────────────────────┘
  ┌ hallway-b71e04 ──────────────────── ○ Offline ┐
  │ pi-hallway · seen 6h ago                       │
  └────────────────────────────────────────────────┘

  ▸ kitchen-3f9a2c — Orientation ─────────────────────   ← editor (selected)
     Orientation    [ Landscape | Portrait ]  ‹inherited from global›
     Flip 180°      ( ●──  off )
     Apply rotation ( ──● on )
                                        [ Reset to global ]
     Saved. This kiosk applies orientation at its next check-in (~30s).
```

- **List:** one card per kiosk (from `loadKiosks()`): id (primary), reported hostname (secondary),
  relative last-seen ("seen 4s ago"), and the **status pill**. Selecting a card loads its overrides
  and reveals the editor.
- **Apply-status (v1):** derived from `lastSeen` recency only — `● Online` when last-seen is within a
  freshness window (≤ 2 minutes), else `○ Offline`. (The confirmed `◐ Applying… → ● Up to date` state
  needs the agent to POST back its applied `deviceConfigVersion`; that is a **follow-on** — see
  Non-goals. Do **not** fake it.)
- **Empty state:** *"No kiosks have connected yet. A kiosk registers itself the first time it loads the
  dashboard."*
- **Load/error states:** a fetch error shows the cached list with a quiet "Showing last known kiosks
  (offline)" note, matching the store's cache-fallback.

## 3. Orientation editor (selected kiosk)

Edits the kiosk's override layer using the **effective value + Reset** model (decision A):

- **Effective value shown** = the kiosk's override if present, else the **global default** (from the
  config store: `orientation` / `orientationFlipped` / `applyDisplayRotation`).
- **Controls:** `SegmentedControl` Orientation (Landscape / Portrait); `ToggleSwitch` Flip 180°
  (`orientationFlipped`); `ToggleSwitch` Apply rotation (`applyDisplayRotation`).
- **Inherited vs set clarity:** each control shows `‹inherited from global›` when the kiosk has no
  override for that key, and `‹set for this kiosk›` once it does. This keeps model A honest — the
  operator always knows whether they're seeing the global default or a per-kiosk value.
- **On change:** read-modify-write — merge the changed orientation key(s) into the kiosk's existing
  overrides and `saveOverrides(id, merged)`. (dd9.3's `PUT` replaces the layer, so we send the full
  merged object; other override keys, e.g. future `availableScreens`, are preserved.)
- **Reset to global:** a quiet secondary action, **enabled only when an orientation override exists**;
  it removes the three orientation keys from the override layer and saves, so the kiosk inherits the
  global default again.
- **Honest async copy** (the physical rotation genuinely lags the save):
  - after save (online kiosk): *"Saved. This kiosk applies orientation at its next check-in (~30s)."*
  - after save (offline kiosk): *"Saved. Changes apply when this kiosk reconnects."*
  - No "Done ✓" — the server accepted the config; the screen hasn't necessarily turned yet.

## Data flow

```
open Kiosks category → store.loadKiosks() (network-first, cache fallback) → render list + status
select kiosk → store.fetchOverrides(id) → editor shows effective orientation (override ?? global)
change a control → merge into overrides → store.saveOverrides(id, merged) → status→"Saved…" copy
Reset to global → drop orientation keys → saveOverrides → controls show ‹inherited from global›
(display-agent, dd9.9, applies the new orientation on the Pi within a poll cycle)
```

## Error handling

- `loadKiosks` network failure → cached list + offline note (never a blank screen).
- `saveOverrides` failure → keep the editor's edited values, show *"Couldn't save to the server. Check
  the connection and try again."* (interface voice; actionable), do not silently drop the edit.
- Unknown-kiosk `404` on `fetchOverrides` → treated as empty overrides (a just-seen kiosk with no
  overrides yet).

## Testing strategy

- **Store (`kiosks.spec.js`):** `loadKiosks` returns the list and caches it; network failure falls back
  to cache; `fetchOverrides` maps `404 → {}`; `saveOverrides` PUTs `{overrides}` and updates the cache;
  URL encoding of ids.
- **View (`KiosksSettings.spec.js`):** renders the list + relative last-seen; empty state when no
  kiosks; status pill Online vs Offline by last-seen window; selecting a kiosk shows the editor with
  the **effective** orientation (override over global); changing orientation calls `saveOverrides` with
  the merged layer (preserving unrelated keys); `Reset to global` removes only the orientation keys and
  is disabled when no override exists; inherited/set tags reflect override presence; post-save copy
  shown.
- All new tests via Vitest; the view uses the existing shell components (already tested).

## Non-goals (follow-ons)

- **Content assignment editor** (`availableScreens`/`defaultScreenId`, incl. a screen multi-select +
  default picker) — the next UI slice.
- **Confirmed apply-status** (`◐ Applying… → ● Up to date`) — needs the display-agent to POST back its
  applied `deviceConfigVersion` and a server endpoint to record it (the deferred confirmation loop).
  File as a follow-on; v1 ships Online/Offline + honest post-save copy.
- **Editing global config** from here (that's the existing Device/Display categories), and multi-screen.

## Open questions

None blocking. The apply-status is deliberately scoped to Online/Offline for v1; the confirmed-apply
upgrade is a filed follow-on so the signature can grow without faking state now.
