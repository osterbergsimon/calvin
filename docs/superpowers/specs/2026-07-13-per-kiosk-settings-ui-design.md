# Per-Kiosk Settings UI — Design Spec

**Date:** 2026-07-13
**Status:** Approved for planning
**Epic:** `calvin-dd9` (per-device / per-kiosk settings model)

## Problem

The Kiosks settings view (`frontend/src/components/settings/categories/KiosksSettings.vue`)
is a master-detail: a "Kiosks" list on the left, and per-selected-kiosk editors on the
right as a flat vertical stack of `SettingsSection`s. Today the detail stack holds two
editors (Orientation, Content). The layered config model already plumbs four more
per-kiosk settings that the on-device display agent applies but that have **no per-kiosk
UI**: display schedule, brightness, and display output/resolution. As these land, the
flat stack becomes an endless scroll and loses any sense of what matters day-to-day.

This spec defines the information architecture and interaction design for the per-kiosk
detail panel so it stays coherent as editors are added, and closes the highest-value gap
(per-kiosk schedule) within that frame.

## Product constraints (confirmed with owner)

- **Scale: 1–3 kiosks.** The master list is short; the detail panel is the star. Do not
  over-invest in fleet features (search/filter/bulk).
- **Cadence: mixed, content-forward.** Physical settings (orientation, output/resolution,
  brightness) are set once at provisioning — group and de-emphasize them. **Content is the
  most-tuned setting and must be the most surfaced/reachable thing in the panel.** Schedule
  is mid-cadence.
- **Offline-aware.** Kiosks are physical Raspberry Pis that go offline. Apply-status
  (online/offline + whether the device has applied the current hardware config) must be
  visible, not buried.
- **Design system is fixed.** Reuse the existing Calvin settings components. No new palette,
  no new typefaces. Exactly one new *presentational* primitive is permitted
  (`KioskStatusHeader`).

## Load-bearing architectural fact

`device_config_version(merged)` (`backend/app/services/kiosk_registry.py:101`) hashes only
`DEVICE_PHYSICAL_KEYS` = orientation, orientationFlipped, applyDisplayRotation,
displayScheduleEnabled, displaySchedule, displayBrightness, displayOutput, displayResolution.

Therefore the apply-status handshake covers **hardware + schedule only**. Content
(`availableScreens`, `defaultScreenId`) is **deliberately excluded from the version hash** —
it is picked up silently at the next check-in, matching the existing per-save copy. The
status header is honestly scoped to "Hardware config" and content stands on its own per-save
messaging. **This requires no backend change.**

## Chosen direction: A + status ideas from B

Reordered flat stack, priority-fixed, with a collapsed hardware drawer, an always-on status
header, and an offline-with-pending badge on the master list. (Alternatives considered:
full tabbed detail — deferred as the forward path once more editor groups land; overview-card
+ drill-in — rejected as over-built for 1–3 kiosks.)

### Detail-panel order (top to bottom)

1. **`KioskStatusHeader`** — kiosk id, online/last-seen, and hardware-config Applied/Pending.
2. **Content** — `SettingsSection`, first, always expanded. Screens shown (`ChipMultiSelect`)
   + default screen (`SelectPill`). Unchanged behavior; just promoted to the top.
3. **Display schedule** — `SettingsSection`. Enabled toggle (`ToggleSwitch`) + 7-day on/off
   grid (`DisplayScheduleGrid`). NEW per-kiosk editor (see below).
4. **Display hardware** — a `CollapsibleSection` drawer, **collapsed by default**, holding the
   set-once physical editors. Ships with the existing Orientation editor moved inside; brightness
   and output/resolution editors drop in here as follow-on slices.

### Master list

Each kiosk card keeps its id/hostname/last-seen and online dot, and gains an
**offline-with-pending badge** (`⚠`) shown when the kiosk is offline **and** its
`lastAppliedVersion` differs from the current desired `deviceConfigVersion`. This surfaces
"this Pi hasn't applied my hardware change yet" at a glance.

## Components

### New: `KioskStatusHeader` (presentational)

`frontend/src/components/settings/shared/KioskStatusHeader.vue`

Props:
- `kioskId: String`
- `online: Boolean`
- `lastSeen: String | null`
- `appliedVersion: String | null` — device's `lastAppliedVersion`
- `desiredVersion: String | null` — current `deviceConfigVersion` for the merged config

Renders a single strip using existing status-pill styles:
- Identity: `kioskId`.
- Presence: `● Online · seen 12s ago` / `○ Offline · seen 3h ago` (reuse the component's
  existing `isOnline` + `relativeTime` helpers; do not fork the 120s window or copy).
- Hardware-config status, derived purely from version compare:
  - `appliedVersion === desiredVersion` → `Hardware config ✓ Applied`.
  - differ, online → `Hardware config · Pending (applies shortly)`.
  - differ, offline → `Hardware config · Pending — applies when this kiosk reconnects`.
  - `appliedVersion == null` → `Hardware config · Not yet reported`.

No side effects, no fetching — the parent supplies both versions.

### Data flow for versions (no backend change)

- `appliedVersion`: already on the kiosk object from `GET /api/kiosks` (`lastAppliedVersion`).
- `desiredVersion`: from `GET /api/kiosks/{id}/config` → `deviceConfigVersion`
  (`backend/app/api/routes/kiosks.py:76-81`). Fetched for the selected kiosk.

Add a store action `fetchDeviceConfigVersion(id)` to `frontend/src/stores/kiosks.js` that
GETs `/api/kiosks/{id}/config` and returns `deviceConfigVersion` (network-first, tolerate
failure by returning `null` — the header degrades to "Not yet reported"/omits the pill rather
than blocking the panel). `select(id)` calls it alongside `fetchOverrides(id)`.

The master-list badge needs `desiredVersion` per listed kiosk. At this scale (1–3 kiosks) the
frontend fetches `deviceConfigVersion` for each listed kiosk on list load via
`fetchDeviceConfigVersion(id)` (the same action the header uses) and caches it on the kiosk
row; the badge is then a pure `offline && appliedVersion !== desiredVersion` compare. A kiosk
whose desired version could not be fetched shows no badge (fail-open — never a false alarm). Do
not add a bulk backend endpoint.

### Reuse: `CollapsibleSection` ↔ `SettingsSection` style reconcile

`CollapsibleSection.vue` predates the current shell and renders its own `<h2>`/border and a
`.settings-section` class that visually collides with `SettingsSection.vue`'s eyebrow-panel
style. Add a `variant="drawer"` (or equivalent) so the Display-hardware drawer sits flush with
the sibling sections. This reconcile is in scope; do not restyle `CollapsibleSection`'s existing
callers.

### New per-kiosk editor: Display schedule

Mirrors the established per-kiosk editor conventions (identical to Orientation/Content):
- Effective value = per-kiosk override if present, else global default
  (`displayScheduleEnabled`, `displaySchedule` from the config store).
- Enabled `ToggleSwitch` + `DisplayScheduleGrid` (the same component `DeviceSettings.vue`
  uses for the global schedule — this editor is its per-kiosk twin).
- Inherited-vs-set tag via `SettingRow` `description`: `‹inherited from global›` /
  `‹set for this kiosk›`.
- Read-modify-write save preserving unrelated override keys; own aria-live `role="status"`
  line; honest online/offline/failure copy (`Changes apply when this kiosk reconnects`).
- `Reset schedule` removes only `displayScheduleEnabled` + `displaySchedule`, disabled when
  neither is overridden. Keys constant `SCHED_KEYS`.

### Moved: Orientation editor

The existing Orientation `SettingsSection` (SegmentedControl + 2 ToggleSwitch, `ORI_KEYS`,
`reset-orientation`) moves **inside** the Display-hardware `CollapsibleSection`. Behavior,
keys, tags, status line, and reset are unchanged — only its container and position change.

## Interaction details

- **On kiosk switch (`select(id)`):** collapse the Display-hardware drawer, clear all transient
  editor status lines (`savedMsg`/`contentMsg`/schedule status), then load overrides and the
  desired config version.
- **Content is king:** Content is first and always expanded — zero clicks to reach the daily task.
- **Offline honesty:** the standing state lives in `KioskStatusHeader`; per-save copy is unchanged;
  the master list shows `⚠` for offline-with-pending.

## Out of scope (documented follow-on slices)

These drop into the Display-hardware drawer later, each its own slice; not built here:
- **Brightness editor** (`displayBrightness`) — `calvin-743`. Reuses `RangeSlider`.
- **Output + resolution editor** (`displayOutput`, `displayResolution`).
- **Full tabbed detail (Direction B)** — gated on adding a 6th/7th editor group or multi-tenant.

No backend changes in this spec.

## Testing

Vitest component tests for `KiosksSettings.vue` and `KioskStatusHeader.vue`:
- Status header renders Applied when versions match; Pending (online copy) when they differ and
  online; Pending (reconnect copy) when they differ and offline; "Not yet reported" when
  `appliedVersion` is null.
- Detail-panel order: Content precedes Schedule precedes the collapsed Display-hardware drawer;
  Content is expanded, drawer collapsed on selection.
- Schedule editor: inherited tag when no override; set tag after change; save preserves unrelated
  keys; reset removes only `SCHED_KEYS` and is disabled when nothing overridden; save-failure path
  shows the failure status.
- Master list: `⚠` badge appears for an offline kiosk whose applied≠desired, absent otherwise.
- On kiosk switch: drawer collapses and transient status clears.
- `CollapsibleSection` drawer variant does not regress its existing callers (snapshot/style check).

## Success criteria

- The detail panel reads Status → Content → Schedule → (collapsed) Display hardware.
- Per-kiosk schedule is fully editable with the established override/inherited/reset conventions.
- Apply-status is visible for the selected kiosk and flagged in the list for offline-with-pending,
  scoped honestly to hardware config, with zero backend changes.
- All existing Orientation/Content behavior is preserved through the move/reorder.
