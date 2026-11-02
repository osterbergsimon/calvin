# Calvin — Calendar sources + refresh editor rebuild (shell-native)

**Status:** Design (autonomous sprint — designer decisions documented for morning review).
**Date:** 2026-06-30
**Bead:** `calvin-03m`. Branch `feat/design-settings-cycle-c`.
**Builds on:** the shell (SettingsSection/SettingRow/ToggleSwitch/NumberStepper/ConfirmModal), C1–E3.

---

## 1. Goal & scope

Rebuild `CalendarSourcesTab.vue` (724 lines, currently a `CollapsibleSection`-based form) into a clean shell-native CRUD editor for calendar sources, plus the global refresh control. **Behavior preserved exactly** — every store/API call, data shape, and the per-source **data color** stay as-is; only the UI/structure is rebuilt. The component stays at the same path and keeps the same props/emits, so `ContentSettings` wiring is unchanged.

**Non-goals:** no backend changes; no change to the calendar store/API; no shared "source-manager" abstraction (image/services are ordering-only and out of scope — see `calvin-5io`). Calendar data colors are NOT tokenized.

## 2. Contracts to preserve (verbatim — the rebuild MUST use these)

- **Store** `useCalendarStore` (`@/stores/calendar`): `fetchSources()`; `updateSource(sourceId, fullUpdatedObject)` — used for color / show_time / enabled, sends the **whole** updated source object; `sources` reactive ref.
- **API** `@/services/calendarApi`: `addCalendarSource(sourceObject)` and `deleteCalendarSource(sourceId)` — called **directly** (not via store); **each must be followed by a full `fetchSources()` re-fetch** (the established sync flow).
- **Plugin types** `pluginsApi.getPlugins({ plugin_type: "calendar" })` → populate the type `<select>` (enabled calendar plugins; keep the hardcoded fallback list on API error).
- **Running status** `usePlugins().pluginInstances` → derive each source's running dot by matching `instance.id === source.id` (read-only ●/○).
- **Per-source fields:** `id` (created as `` `${type}-${Date.now()}` ``), `type`, `name`, `ical_url`, `enabled`, `color` (**data hex** — keep `getColorValue` named→hex normalization, default `#2196f3`; never a token), `show_time` (default `true`: treat `show_time !== false` as on).
- **Refresh:** the global interval lives on `props.config.calendarRefreshInterval` (int 5–120); on change `emit("update:config", { calendarRefreshInterval: value })` — NOT in the store. Component keeps `defineProps({ config })` + `defineEmits(["update:config"])`.

## 3. New UI (shell-native), inside the existing `Calendars` SettingsSection panel

`ContentSettings` already wraps this component in `<SettingsSection id="content-calendars" title="Calendars">`, so the rebuild renders panel content (no new top-level section; no `CollapsibleSection`).

1. **Add a calendar source** — a compact add form at the top:
   - Type: a shell-styled `<select>` (dynamic calendar plugin types; fallback list). (A select, not SegmentedControl — the type set is open/dynamic.)
   - Name: shell text input. URL: shell text input with the per-type dynamic placeholder/help text (preserve current per-type hints).
   - "Add calendar" button (shell primary, `--focus` fill, ≥44px), disabled until name + URL non-empty. On add: build the source object (id `` `${type}-${Date.now()}` ``, color default, show_time true), `calendarApi.addCalendarSource(...)`, then `fetchSources()`, then clear the form. Surface errors in a shell status line.
2. **Source list** — per-source **cards** (`--bg-2` + `--line`, ≥44px controls), one per `sources` entry:
   - Header: `name` (`--ink`, `--font-ui`) + a type badge + running dot (●=`--ok`/○=`--ink-3`, derived).
   - Color: `<input type="color">` bound via `getColorValue(source.color)`; on change → `updateSource(id, { ...source, color: hex })`. (The native color input value stays raw hex — data.)
   - "Show times": `ToggleSwitch` bound to `source.show_time !== false`; on change → `updateSource(id, { ...source, show_time: v })`.
   - Enabled: `ToggleSwitch` bound to `source.enabled`; on change → `updateSource(id, { ...source, enabled: v })`.
   - Remove: a destructive button (`--err`) → opens `ConfirmModal`; on confirm → `deleteCalendarSource(id)` then `fetchSources()`.
   - Empty state (no sources): a shell `--ink-3` hint.
3. **Refresh** — a `SettingRow` ("Refresh interval", description) at the bottom of the panel with a `NumberStepper` (min 5, max 120, step 5) bound to `config.calendarRefreshInterval`, emitting `update:config`. **Add a "Refresh now" action** (shell button) that calls `calendarStore.refreshEvents()` — this surfaces an existing store method not previously exposed; show a brief "Refreshing…/Refreshed" status. (New affordance; behavior-additive, no contract change.)

All new chrome uses new shell tokens only; the per-source `color` and the `getColorValue` palette are **data** and stay as raw hex.

## 4. Testing

- Preserve/refresh any existing `CalendarSourcesTab` spec; rewrite assertions tied to the old `CollapsibleSection` structure.
- New component tests (Vitest + @vue/test-utils, mocked store/api — mirror existing settings component-test harnesses): add-source calls `addCalendarSource` then `fetchSources`; color change calls `updateSource` with the full object + new hex; show_time and enabled toggles call `updateSource`; remove (after confirm) calls `deleteCalendarSource` then `fetchSources`; refresh interval change emits `update:config`; "Refresh now" calls `refreshEvents`. Assert the **data color is preserved** (a source with a named color round-trips through `getColorValue` without tokenization).
- Gates: full `npx vitest run` green; `npx eslint src` 0/0; grep — no legacy tokens/hex in the rebuilt file **except** the `getColorValue` data palette + the `#2196f3` default (justified as data).
- On-device (controller): add a source, edit its color, toggle show-times/enable, remove it; change the interval; click Refresh now.

## 5. Decomposition (for the plan)

1. **Rebuild `CalendarSourcesTab.vue`** — new shell-native template + script (preserving all §2 contracts), tokenized styles. One cohesive task (it's one component; the add-form, card list, and refresh row are interdependent).
2. **Tests** — update existing + add the §4 behavior tests. (May fold into task 1 if the harness makes TDD natural; otherwise a second task.)

## 6. Notes
- `getColorValue` named→hex map and the `#2196f3` default MUST be carried over verbatim (the backend may still return named colors).
- Keep the add/delete → `fetchSources()` re-sync; keep `updateSource` sending the whole object.
- Do not introduce `CollapsibleSection`; use flat shell structure within the existing panel.
