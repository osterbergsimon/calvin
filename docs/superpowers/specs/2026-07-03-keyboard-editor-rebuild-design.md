# Keyboard mappings editor — rebuild (shell-native, unified) — Design

**Issue:** calvin-1bp · **Follow-up:** calvin-py5 (retire obsolete `mode_*` actions) · **Date:** 2026-07-03

## Problem

`KeyboardTab.vue` (542 lines) was restyled but not rebuilt in calvin-hbp. It keeps a
key-centric, flat-dropdown model: one row per key with a single `<select>` of ~45
actions and a clear ×; standard keyboards add keys from a 60-item dropdown. Problems:

- **Discoverability** — 45 actions in one flat list, grouped only by source-code comments. Unscannable.
- **Mental model** — no representation of the physical device; you edit key-by-key instead of seeing all buttons at once.
- **Incoherent keyboard model** — two "keyboard types" (`7-button`, `standard`) are stored, filtered, and resolved separately, yet the 7-button remote merely emits digits 1–7, which are already a subset of a normal keyboard. The type split is artificial.
- **Obsolete actions front-and-center** — mode-switch actions (`mode_calendar/photos/web_services/cycle/spare`) predate the screens/regions model and no longer mean what their labels say (see Findings).

## Goals

1. Rebuild the editor around the **physical device** (see all buttons at a glance) with a **grouped, searchable, generic-first action picker**.
2. **Unify the keyboard model**: one keyboard, one mapping table. Drop `keyboard_type` everywhere (DB, API, config, runtime) with a one-time migration.
3. **Press-to-capture** binding: press a button (remote or full keyboard) to add/rebind it — replaces the key-picker dropdown.
4. Preserve current runtime behavior and the default mapping exactly.

## Non-goals / constraints

- **`useKeyboardActions.js` is frozen.** No actions added, removed, renamed, or re-behaved. The picker only changes how the *existing* action set is presented.
- Retiring `mode_cycle`/`mode_spare` and renaming the screen-jumps is **out of scope** → tracked in **calvin-py5** (depends on this shipping first).
- No new keyboard hardware support beyond "any key the browser reports."

## Findings that shaped the design (traced in code)

- **Runtime resolution is frontend-side.** `KeyboardHandler.vue` listens to browser `keydown`, normalizes `event.code` → `KEY_*` via a static `keyCodeMap`, and looks up `mappings[activeType][keyCode]`. The physical 7-button remote emits digits 1–7 → `KEY_1..KEY_7`.
- **`keyboard_type` is not intrinsic.** It only (a) filters which keys the editor shows, (b) namespaces two stored maps, (c) selects the live map. Nothing hardware-specific.
- **The home dashboard is 100% screens/regions-driven.** `Dashboard.vue` renders the active screen's regions; `modeStore.currentMode` does not gate what is shown. `currentMode`/`fullscreenMode` only drive the fullscreen overlay, `NotificationSystem` hints, and a *fallback* in generic-action resolution (`getModeForActiveRegion()` takes precedence). Therefore:
  - `mode_calendar/photos/web_services` — the `setMode()` half is vestigial; the useful half is `activateFirstScreenContainingKind()` = "jump to first screen containing that region kind." No-op if no such screen.
  - `mode_cycle` — effectively dead on the dashboard (cycles an invisible mode; only side effect is routing to `/settings`).
  - `mode_spare` — no-op by design.
  - `mode_settings` — works, essential, default-bound to `KEY_7`.
- **`keyCodeMap` is partial.** Unmapped keys fall through to raw `event.code` (`KeyA`, `F5`), which mismatches the stored `KEY_A` format. Press-to-capture of arbitrary keys requires a shared normalizer.

## Design

### Data model — unify away `keyboard_type`

Single mapping table keyed by `KEY_*`.

**Backend**
- **DB migration (Alembic):** collapse `keyboard_mappings` to one logical set. Keep **only the currently-active type's** rows — read `config.keyboardType` (default `"7-button"`) and discard the other type's rows entirely (the inactive type was never live, so nothing that was in effect is lost). Then drop the `keyboard_type` column (SQLite batch op; uniqueness becomes `key_code`).
- **`keyboard_mapping_service`:** drop the `keyboard_type` parameter throughout. `get_mappings() -> dict[str, str]`, `set_mappings(dict)`, `set_mapping(key_code, action)`, `remove_mapping(key_code)`.
- **API (`routes/keyboard.py`):** `GET /keyboard/mappings` → `{ "mappings": { KEY_x: action } }` (flat, no type wrapper, no `?keyboard_type=`). `PUT /keyboard/mappings/{key_code}` and `DELETE /keyboard/mappings/{key_code}` for per-key edits. `POST /keyboard/mappings` accepts the flat map (bulk).
- **Config:** remove `keyboardType` (Pydantic field, snake_case mapping in `config.py`, `main.py` default). Incoming `keyboardType` is ignored for back-compat (no error).
- **`main.py _initialize_keyboard_mappings`:** seed the single default map (the existing 7-button map, unchanged):
  `KEY_1→generic_prev, KEY_2→generic_expand_close, KEY_3→generic_next, KEY_4→region_next, KEY_5→screen_prev, KEY_6→screen_next, KEY_7→mode_settings`.

**Frontend**
- **`stores/keyboard.js`:** `mappings` becomes flat `{ KEY_x: action }`; drop `keyboardType`. Actions: `fetchMappings()`, `setMapping(key, action)`, `removeMapping(key)`, `updateMappings(map)`.
- **`KeyboardHandler.vue`:** resolve via `mappings[keyCode]` (no type). Reboot combo unchanged.

### Shared key-code normalizer

Extract `utils/keyCode.js` → `normalizeKeyCode(event) -> "KEY_*"`, used by **both** `KeyboardHandler` (resolution) and the capture flow (binding), so stored and resolved codes always match. Generic families:
`Digit(\d)`→`KEY_$1`, `Key([A-Z])`→`KEY_$1`, `F(\d+)`→`KEY_F$1`, plus named specials (arrows, Space, Enter, Escape, Home/End, Page*, etc.). Replaces the inline `keyCodeMap`.

### Editor — device board (layout B)

`KeyboardTab.vue` becomes a thin container; the UI splits into focused components under `settings/tabs/layout/keyboard/`:

- **`KeyBindingBoard.vue`** — the device view. Tiles for `KEY_1..KEY_7` (the remote), each showing its assigned action (or "unassigned"). Below, an **"Other keys"** strip listing any bound non-1–7 keys as chips (letter/arrow/symbol/F-key + action). A **capture affordance** ("＋ press a button") in both areas.
- **`KeyBindingTile.vue`** — one tile/chip: key label + action label + edit (✎) / clear (×). A light **conflict indicator** when the same action is bound to another key (non-blocking; duplicates remain allowed, matching current behavior).
- **`ActionPicker.vue`** — popover anchored to the key being edited. Header shows the captured/edited key (`KEY_S → choose an action`). Search box. Tiered, **generic-first** list:
  - **Generic · context-aware (recommended, pre-expanded, highlighted):** Next, Previous, Expand/Close, Refresh — each with a one-line "adapts to…" note.
  - **Navigation:** Screen Next/Prev, Region Next/Prev, Screen 1–7, **Open Settings**.
  - **Collapsed:** "Jump to a screen — Calendar/Photos/Services" (the adapted `mode_*` screen-jumps), "Per-mode actions" (calendar/photos/web-service specifics), "Legacy" (`mode_cycle`, `mode_spare`, aliases).
  - Every action in the frozen set is reachable via search or a disclosure — nothing removed, just de-emphasized.
- **`utils/keyboardActionsCatalog.js`** — UI-only metadata: for each action value, a human label, optional description, group, and tier. This is the single source of picker structure; it references the frozen action values but lives entirely in the frontend.

**"Modes" is dropped as a first-class group** (per Findings) — `mode_settings` is promoted into Navigation as "Open Settings"; the screen-jumps and vestigial actions move to collapsed tiers.

### Press-to-capture flow

- **`useKeyCapture.js`** composable. Entering capture sets a shared flag (small module-level reactive or a field on the keyboard store, e.g. `captureActive`).
- **`KeyboardHandler.vue`** checks `captureActive` **first** in `onKeyDown`: if active, it `preventDefault()`s, resolves the key via `normalizeKeyCode`, hands it to the capture callback, and **does not dispatch any action**. (Search `<input>` already suppresses actions via the existing INPUT guard.)
- Flow: click "press a button" (or a tile's ✎) → capture arms → user presses key → `ActionPicker` opens for that key. **Escape cancels** capture. If the captured key is already bound, the picker shows its current action and rebinds.
- Selecting an action calls `store.setMapping(key, action)` → per-key `PUT`. Clearing a tile calls `store.removeMapping(key)` → `DELETE`. The board is a pure reflection of `store.mappings`.

## Data flow

```
press "＋" → useKeyCapture arms (captureActive=true)
   → KeyboardHandler intercepts next keydown, normalizeKeyCode(event) → KEY_x, no action dispatched
   → ActionPicker(KEY_x) opens (grouped, generic-first, searchable)
   → user picks action → store.setMapping(KEY_x, action) → PUT /keyboard/mappings/KEY_x
   → store.mappings updates → board re-renders → KeyboardHandler resolves live
```

## Migration & back-compat

- One-time Alembic data+schema migration keeps the active type's map, discards the inactive type's rows, and drops the `keyboard_type` column.
- API/config quietly ignore the retired `keyboardType`; old clients hitting `?keyboard_type=` still get the (now single) map.
- Default map preserved verbatim; existing deployments keep their bindings (active type's).

## Testing

- **Backend:** update `keyboard.py` route tests + `keyboard_mapping_service` tests to the flat model; add a migration test (two maps → merged single map, active-type precedence); `_initialize_keyboard_mappings` seeds once.
- **Frontend unit:** `keyCode.normalizeKeyCode` (families + specials); `keyboardActionsCatalog` (every frozen action appears exactly once, generic tier first); `stores/keyboard` (setMapping/removeMapping/flat fetch).
- **Frontend component:** `useKeyCapture` (arms, intercepts, Escape cancels, no action dispatched during capture); `ActionPicker` (search, tier expand, select); `KeyBindingBoard` (1–7 tiles + Other-keys strip; conflict indicator).
- **E2E:** existing `keyboard-navigation.spec.js` stays green (runtime behavior unchanged).
- **Gates:** eslint, prettier, full FE + BE suites, ruff/mypy.

## Component/file summary

| File | Change |
|---|---|
| `backend/.../alembic` migration | new — merge maps, drop `keyboard_type` |
| `backend/app/services/keyboard_mapping_service.py` | drop type param; add `remove_mapping` |
| `backend/app/api/routes/keyboard.py` | flat map; per-key PUT/DELETE |
| `backend/app/api/routes/config.py`, `main.py` | remove `keyboardType`; single-map seed |
| `frontend/src/utils/keyCode.js` | new — shared normalizer |
| `frontend/src/utils/keyboardActionsCatalog.js` | new — picker metadata (UI-only) |
| `frontend/src/stores/keyboard.js` | flat map; per-key actions |
| `frontend/src/components/KeyboardHandler.vue` | use normalizer + flat resolve |
| `frontend/src/components/settings/tabs/layout/KeyboardTab.vue` | rebuilt container |
| `.../layout/keyboard/KeyBindingBoard.vue`, `KeyBindingTile.vue`, `ActionPicker.vue` | new |
| `frontend/src/composables/useKeyCapture.js` | new |
| `useKeyboardActions.js` | **untouched (frozen)** |
