# Calvin — Cycle C2: Settings categories (Clock bar · Device · Maintenance)

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Part of:** [Touch + Visual Redesign](./2026-06-28-touch-visual-redesign.md) (umbrella §7 "C — Settings").
**Builds on:** [Cycle C1](./2026-06-28-cycle-c-settings.md) — the Settings shell (`SettingsTopBar`, `CategoryRail`, `SettingsSearch`, `SettingsSection`, `SettingRow`) and controls (`SegmentedControl`, `ToggleSwitch`, `SelectPill`, `NumberStepper`, text-input row) proved on the Display category (`DisplaySettings.vue`), PR #60.
**Tracks:** `calvin-vym` (this migration), `calvin-hbp` (restyle the embedded editors later), `calvin-4k8` (regions editor, separate).

---

## 1. Scope

Cycle C1 built the shell and migrated one category (Display). C2 migrates **three** more to the same eyebrow-row pattern: **Clock bar**, **Device**, **Maintenance**. The remaining two categories — **Content** (calendar/photo/service CRUD) and **Plugins** (collides with the parked `wip/plugin-repository` WIP) — are out of scope and stay on their existing components inside the shell until a later cycle.

**Approach (chosen):** *migration + light IA cleanup* — rebuild each category's settings as eyebrow `SettingsSection`s of `SettingRow`s, reorganising where the old tab boundaries are awkward (called out per section in §4). Five **specialized editors are embedded as-is** this cycle (restyle deferred to `calvin-hbp`).

**Non-goals:** No change to `useConfigForm` auto-save, the `settingsRegistry` search model, the shell components, or the keyboard action vocabulary (`useKeyboardActions.js` is frozen). No new config keys. No restyle of the embedded editors.

## 2. Architecture

Three new category components, each mirroring `DisplaySettings.vue`:

| Component | Replaces | Props | Emits |
|---|---|---|---|
| `categories/ClockBarSettings.vue` | `ClockBarCategory.vue` | `config` | `update:config` |
| `categories/DeviceSettings.vue` | `DeviceCategory.vue` | `config`, `version`, `frontendVersion` | `update:config` |
| `categories/MaintenanceSettings.vue` | `MaintenanceCategory.vue` | `config`, `gitRepoUrl`, `gitBranch` | `update:config`, `update:gitRepoUrl`, `update:gitBranch` |

Each is `<SettingsSection>`s of `<SettingRow>`s; plain settings use the shell controls, specialized editors are wrapped in a row/section but keep their internals. `Settings.vue` swaps each old wrapper for the new one (exactly as it renders `DisplaySettings` for `dashboard`), passing the same props it already passes today. The per-category tab machinery (`TabNavigation`, `SettingsTab`, `usePersistedSettingTab`) is dropped for these three; the old tab components under `tabs/` are deleted **only** once nothing references them (see §6).

**Control vocabulary** (unchanged from C1 §3): boolean → `ToggleSwitch`; 2–3 exclusive → `SegmentedControl`; longer enum → `SelectPill`; bounded number → `NumberStepper`; free text → token-styled `<input>` row. Conditional rows reveal/hide with `v-if` on the governing config value (matching the old tabs' behaviour).

**Token policy:** every newly-built row uses the **new semantic tokens** only (`--ink`, `--ink-2/3`, `--bg-0/1/2`, `--line`, `--focus`, `--ok`, `--warn`, `--err`, font-role tokens) — no legacy tokens (`--accent-primary`, `--text-*`, `--bg-secondary`, `--border-color`) and no hardcoded hex/rgb. The two hardcoded status colors in `HardwareTab` (`#4caf50`/`#f44336`) become `--ok`/`--err`. Embedded editors keep their current (legacy-token) styling for now — they remain functional because `theme.css` still defines the legacy tokens alongside the new ones; their restyle is `calvin-hbp`.

## 3. Embedded editors (as-is this cycle → `calvin-hbp`)

These five keep their internal markup; only their *containing* row/section is new:

1. `ClockBarFontSizePicker` — clock-bar sizing (horizontal **and** vertical instances, the vertical one with its live `ClockBarVertical` preview).
2. `ClockBarItemsTab` — clock-bar status-tile editor (self-managed state; no `config` prop).
3. The per-day **display-power schedule grid** — extracted verbatim from `PowerTab` into a new `DisplayScheduleGrid.vue` (markup/styling unchanged, a lift-and-shift) so it can be embedded while the surrounding power settings become new rows. `PowerTab`'s simple settings (schedule-enable, timezone, timeout, manual control) are *not* embedded — they are rebuilt as rows (§4.2), and `PowerTab` is then retired.
4. `KeyboardTab` — keyboard type + remapping UI (the *UI* may be restyled later; the action set stays frozen).
5. The **update-status + health block** — embedded via `UpdatesTab` (see §4 Maintenance).

## 4. Section maps

Section ids are globally unique (prefixed by category) so the breadcrumb scroll-spy and `?setting=` anchors don't collide. Each row lists its **control** and **config key**; `[embed]` marks a specialized editor.

### 4.1 Clock bar — `ClockBarSettings.vue`

Old: *Appearance* tab (`ClockSettingsTab`, three collapsibles) + *Bar Items* tab (`ClockBarItemsTab`).

- **CLOCK** (`section-clock-bar-clock`)
  - Show date — `ToggleSwitch` → `clockShowDate`
  - Show seconds — `ToggleSwitch` → `clockShowSeconds`
  - Show Calvin logo — `ToggleSwitch` → `clockBarShowLogo` *(default true: `config.clockBarShowLogo !== false`)*
  - Show weather — `ToggleSwitch` → `clockBarShowWeather`
  - Show in kiosk mode — `ToggleSwitch` → `clockBarShowInKiosk`
  - *IA cleanup:* toggles from the old "Clock display" + "Appearance" + "Visibility" collapsibles collapse into one group.
- **BAR LAYOUT** (`section-clock-bar-layout`)
  - Horizontal layout — `SelectPill` (Single line / Two lines) → `clockBarLayout`
  - Horizontal sizing — `[embed ClockBarFontSizePicker]` (binds `clockBarFontSize`, `clockBarDateFontSize`, `clockBarPadding`)
  - Vertical layout — `SelectPill` (Upright / Compact time / Compact time & date) → `clockBarVerticalLayout`
  - Vertical sizing — `[embed ClockBarFontSizePicker + preview]` (binds `clockBarVerticalFontSize`, `clockBarVerticalDateFontSize`, `clockBarVerticalPadding`)
- **BAR ITEMS** (`section-clock-bar-items`)
  - `[embed ClockBarItemsTab]`

### 4.2 Device — `DeviceSettings.vue`

Old tabs: Power & Display (`PowerTab`) · Keyboard (`KeyboardTab`) · Reboot Combo (`RebootComboTab`) · Hardware (`HardwareTab`).

- **DISPLAY POWER** (`section-device-power`)
  - Power schedule — `ToggleSwitch` → `displayScheduleEnabled`
    - ↳ when on: Daily schedule — `[embed DisplayScheduleGrid]` → `displaySchedule` (array); Timezone — `SelectPill` (System default + the existing zone list) → `timezone`
  - Screen timeout — `ToggleSwitch` → `displayTimeoutEnabled`
    - ↳ when on: Timeout — `NumberStepper` (0–3600, step 60, seconds) → `displayTimeout`
  - Manual control — two action buttons (Turn display on / off) calling `useSystem().turnDisplayOn/Off`
- **KEYBOARD** (`section-device-keyboard`)
  - `[embed KeyboardTab]` (props `config`, emits `update:config`)
- **REBOOT COMBO** (`section-device-reboot`)
  - First key — `SelectPill` (KEY_1…KEY_7) → `rebootComboKey1`
  - Second key — `SelectPill` (KEY_1…KEY_7) → `rebootComboKey2`
  - Hold duration — `NumberStepper` (1000–60000, step 1000, ms) → `rebootComboDuration`
  - Live "Hold {key1} + {key2} for {n}s to reboot" — read-only info row
- **HARDWARE** (`section-device-hardware`) — read-only info rows
  - Backend version (`version` prop) · Frontend version (`frontendVersion` prop) · System status (●/○ from `useConnectionStore().isBackendOnline`, colored `--ok`/`--err`)
  - *IA cleanup:* the old Hardware tab (3 read-only lines) is demoted to a compact info section at the bottom of Device.

### 4.3 Maintenance — `MaintenanceSettings.vue`

Old tabs: Updates (`UpdatesTab`) · Diagnostics (`DebugTab`). The **System** (restart/reload) block added to `UpdatesTab` in C1 moves out into its own section here.

- **UPDATES** (`section-maintenance-updates`)
  - `[embed UpdatesTab]` — git repository URL + branch, "check / apply update" trigger, update status, and backend-health summary stay together as one cohesive embed (props `gitRepoUrl`/`gitBranch`, emits `update:gitRepoUrl`/`update:gitBranch`).
  - **Change to `UpdatesTab`:** remove the `System` `CollapsibleSection` (Restart Backend / Restart Frontend / Reload UI) that C1 added; those move to the SYSTEM section below. `UpdatesTab` returns to update-only.
- **SYSTEM** (`section-maintenance-system`) — newly-built action rows (the relocated C1 work)
  - Restart backend — action row → `useSystem().restartBackend()` (confirm via `ConfirmModal`)
  - Restart frontend — action row → `useSystem().restartFrontend()` (confirm via `ConfirmModal`)
  - Reload UI — action row → `window.location.reload()` (no confirm)
- **DIAGNOSTICS** (`section-maintenance-diagnostics`)
  - Console logging — `ToggleSwitch` → `consoleLogEnabled` *(default true: `?? true`)*
    - ↳ when on: Log level — `SelectPill` (Error only / Warnings & errors / Info, warnings & errors / All logs) → `consoleLogLevel`
  - Config polling interval — `NumberStepper` (5–300, step 1, seconds) → `configPollInterval`

## 5. Search, deep-link & breadcrumb

`settingsRegistry` already has destinations for these categories keyed by `tab` + `tabKey`. C2:

- Keeps the destinations and their `keywords`; updates `path` strings to read naturally against the new sections where helpful (no behaviour change).
- Generalises `Settings.vue` so section-scroll on `onJump` applies to the migrated categories, not just `dashboard`. Replace the `destination.category === "dashboard"` gate with a check against the set of migrated categories, and extend the tab→section lookup to a **per-category** map (the same `tab` string, e.g. `appearance`, exists in more than one category, so the lookup must be keyed by `(category, tab)` → unique `section-*` id from §4).
- For still-unmigrated categories (`content`, `plugins`), the existing `tabKey` sessionStorage path is preserved unchanged.

The breadcrumb scroll-spy (`IntersectionObserver` over `.settings-section`) needs no change — it works for any category that renders real `SettingsSection`s, which all three now do. `useConfigForm` auto-save is untouched: rows emit `update:config` exactly as the old tabs did; Maintenance also re-emits `update:gitRepoUrl`/`update:gitBranch` as today.

## 6. Cleanup

- After the three new components are wired and green, delete the replaced wrappers (`ClockBarCategory.vue`, `DeviceCategory.vue`, `MaintenanceCategory.vue`) and any tab component no longer referenced anywhere (`ClockSettingsTab.vue`, `RebootComboTab.vue`, `HardwareTab.vue`, `DebugTab.vue`, `PowerTab.vue` — its grid now lives in `DisplayScheduleGrid.vue` and its other settings are rebuilt as rows).
- Components that stay live (still referenced by an embed or another category): `ClockBarItemsTab`, `ClockBarFontSizePicker`, `ClockBarVertical`, `KeyboardTab`, `UpdatesTab` (embedded for UPDATES), the new `DisplayScheduleGrid`, and `useSystem`.
- `DashboardCategory.vue` was already orphaned by C1 — out of scope here; leave it.
- Removing a tab component is only safe after a repo-wide reference check (it may be imported by a not-yet-migrated category).

## 7. Testing

- One Vitest spec per new component (modelled on `DisplaySettings.spec.js`), asserting: the eyebrow sections render (`#section-…`), a representative row's control emits the correct `{ key: value }` patch, and a conditional reveal toggles (Device timeout seconds; Maintenance log level). Embedded editors are stubbed.
- `MaintenanceSettings.spec.js` additionally asserts the SYSTEM rows: confirming Restart Backend calls `restartBackend`; and that git URL/branch edits re-emit `update:gitRepoUrl`/`update:gitBranch`.
- Preservation specs stay green: `settingsRegistry.spec.js`, `useConfigForm.spec.js`, `SettingsShell.spec.js`, and `UpdatesTab.spec.js` (updated for the removed System section).
- Full suite (`npx vitest run`) and `npx eslint src` clean.
- On-device pass at the end: rail → each of the three categories; breadcrumb scroll-spy; search jump into each; the new rows; and that every embedded editor still functions (clock sizing + preview, bar items, power schedule, keyboard remap, update/health).

## 8. Deferred

- `calvin-hbp` — restyle the five embedded editors into the new vocabulary/tokens.
- `calvin-4k8` — regions editor in Display LAYOUT (separate, not part of this slice).
- Content + Plugins category migration — a later cycle (Plugins after `wip/plugin-repository` reconciles).
