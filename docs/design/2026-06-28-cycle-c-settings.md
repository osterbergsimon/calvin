# Calvin — Cycle C1: Settings shell + Display

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Part of:** [Touch + Visual Redesign](./2026-06-28-touch-visual-redesign.md) (umbrella §7 "C — Settings").
**Builds on:** Cycle A primitives (`FocusPanel`, `SegmentedControl`, `ToggleSwitch`, `SelectPill`, tokens, `useTypeTheme`) and Cycle B (the new config keys `focusLightMode`, `focusLightDimOthers`, `displayName`, `touchControls`, `touchControlSize` that still need Settings rows).
**Reference mock:** [`mocks/mock-settings.png`](./mocks/mock-settings.png).

---

## 1. Scope & decomposition

Settings is the largest surface (~40 files: 6 categories, ~20 tabs, specialized + shared components). Per the decomposition decision, Cycle C is split:

- **C1 (this spec):** Build the new Settings **shell** (rail with focus-light, promoted search, breadcrumbs, eyebrow-sectioned ~72px touch rows, restyled controls) and prove it on the **Display** category. The other five rail entries render their **existing** category components inside the new shell, unchanged.
- **C2+ (future):** Migrate the remaining categories (Clock bar, Content, Plugins, Device, Upkeep) to the eyebrow-row format. (`PluginsCategory` collides with the parked `plugin-repository` WIP — reconciled whenever that lands.)

**Non-goals:** No change to the auto-save mechanism, the `settingsRegistry` search model, or the schema-driven plugin instance forms (`PluginFieldRenderer` / `instance_config_schema`) — those are preserved and only restyled later. Dashboard keyboard vocabulary stays frozen.

## 2. Shell architecture

`views/Settings.vue` is rebuilt to orchestrate the new shell; category internals modernize incrementally.

**New units (`components/settings/shell/`):**

| Unit | Responsibility |
|---|---|
| `SettingsTopBar.vue` | Left: `CAL·VIN` wordmark + **breadcrumb** (`Settings › <category> [› <section>]`). Right: save-status pill (from `useConfigForm.saveStatus`) + **Done** button (returns to dashboard). |
| `CategoryRail.vue` | The 6 categories (from `settingsRegistry.settingsCategories`, extended with a sub-area subtitle). Each entry is a `FocusPanel`-lit button (title + subtitle); active entry uses the focus-light. Tap or keyboard (arrows/Enter) selects; emits `select(categoryId)`. |
| `SettingsSearch.vue` | Promoted full-width search bar. Reuses `filterSettingsDestinations`; `/` focuses it; selecting a result emits `jump(destination)` → caller sets category + scrolls to the section anchor. |
| `SettingsSection.vue` | An **eyebrow** label (`LAYOUT`, `APPEARANCE`, …) + a panel grouping `SettingRow`s. Carries an `id` used as the scroll/anchor target and for the breadcrumb scroll-spy. |
| `SettingRow.vue` | The ~72px touch row: `label` + plain-language `description` (left), control via default slot (right). Token-styled, ≥44px control area, `:focus-visible`. |
| `NumberStepper.vue` | Small bounded-number control (− value +) with `min`/`max`/`step`; emits `update:modelValue`. Reused in C2 for font sizes. |
| `ThemePicker.vue` | A `SelectPill`-style row trigger showing the current theme (swatch + name); tapping opens a popover containing the existing theme cards (wraps `ThemeSelector`). Selecting a card emits the chosen `selectedTheme` and closes. |
| `TypefacePicker.vue` | A `SelectPill` bound to `useTypeTheme` — lists the three type themes (Instrument/Marquee/Station); selecting applies + persists the type theme. |
| `categories/DisplaySettings.vue` | The Display category rebuilt as eyebrow `SettingsSection`s of `SettingRow`s (see §4). |

**Breadcrumb (`SettingsTopBar`):** always shows `Settings › <active category label>`; appends `› <section label>` for the eyebrow section currently scrolled into view (scroll-spy over `SettingsSection` ids). Tapping a crumb scrolls back to top / the section. This wayfinding is the main "less intimidating" affordance, alongside the plain-language descriptions and eyebrow grouping.

**Transitional rendering:** the rail shows all 6 categories. Selecting **Display** renders `DisplaySettings` (new). Selecting any other category renders its **existing** component (`ClockBarCategory`, `ContentSourcesCategory`, `PluginsCategory`, `DeviceCategory`, `MaintenanceCategory`) inside the new shell, with their current tab strips, until C2 migrates them.

**Reused as-is:** Cycle-A `SegmentedControl` / `ToggleSwitch` / `SelectPill` / `FocusPanel`; `useConfigForm` (auto-save); `settingsRegistry` (search/destinations); `ThemeSelector` (inside `ThemePicker`); `PluginFieldRenderer` / `InstanceModal`; the five not-yet-migrated category components.

## 3. Control vocabulary

Map a setting's shape to the right primitive:

- **boolean** → `ToggleSwitch`
- **2–3 mutually exclusive** → `SegmentedControl`
- **longer enum / list** → `SelectPill`
- **bounded number** → `NumberStepper`
- **theme** → `ThemePicker` (pill → card popover)
- **type theme** → `TypefacePicker` (`SelectPill`)

Every row reads/writes its existing `configStore` key through the current `update:config` → `useConfigForm` debounced auto-save path. No new config-update logic; the only net-new config keys are listed in §5.

## 4. Display category → eyebrow sections

`DisplaySettings.vue` migrates **all** current Dashboard-category settings into eyebrow sections of touch rows, and surfaces the Cycle A/B keys that shipped without UI.

- **LAYOUT**
  - Orientation — `SegmentedControl` (Landscape/Portrait) → `orientation`
  - Flip 180° — `ToggleSwitch` → `orientationFlipped`
  - Apply display rotation — `ToggleSwitch` → `applyDisplayRotation`
  - Multi-screen layout — the existing `dashboardScreens` editor, embedded as-is (specialized; not rebuilt in C1).
- **CALENDAR**
  - Calendar view — `SelectPill` (Month / Week / Day / Rolling) → `calendarViewMode` *(existing key, newly surfaced)*
  - Weeks to show — `NumberStepper` → `calendarWeeks` *(NEW key, §5; applies to the rolling view)*
  - Week starts on — `SelectPill` (7 days) → `weekStartDay`
  - Show week numbers — `ToggleSwitch` → `showWeekNumbers`
  - Time format — `SegmentedControl` (24h/12h) → `timeFormat`
  - Max visible events — `NumberStepper` → `maxVisibleEvents`
  - Highlight holidays — `ToggleSwitch` → `showRedDays`
  - Weekend days — existing multi-day selector, restyled → `weekendDays`
- **APPEARANCE**
  - Theme — `ThemePicker` → `selectedTheme`
  - Theme mode — `SelectPill` (Light/Dark/Auto/Time; reveals `darkModeStart`/`darkModeEnd` `NumberStepper`s when Time) → `themeMode`
  - Typeface — `TypefacePicker` → type theme (via `useTypeTheme`)
  - Focus light — `SelectPill` (Off / On when navigating / Always) → `focusLightMode` *(new key, first UI)*
  - Dim other regions — `ToggleSwitch` → `focusLightDimOthers` *(new key, first UI)*
  - Hide controls in kiosk mode — `ToggleSwitch` → `showUI` (inverted) 
  - Touch controls — `SelectPill` (Auto / Always on / Off) → `touchControls` *(new key, first UI)*
  - Touch control size — `SegmentedControl` (Small/Medium/Large) → `touchControlSize` *(new key, first UI)*
  - Display name — text input row → `displayName` *(new key, first UI; the clock-bar room label, surfaced here as device identity)*
- **NOTIFICATIONS**
  - Enable feedback — `ToggleSwitch` → `keyboardFeedbackEnabled`
  - Feedback style — `SegmentedControl` (Normal/Small) → `keyboardFeedbackMode`
  - Auto-hide delay — `NumberStepper` → `modeIndicatorTimeout`
- **PLUGIN DISPLAY**
  - Meal-plan card size — `SegmentedControl` (Small/Medium/Large) → `mealPlanCardSize`

## 5. New config + feature additions

| Key | Type | Default | Meaning |
|---|---|---|---|
| `calendarWeeks` | number | `4` | Number of weeks rendered in the **rolling** calendar view. |

- `calendarWeeks` is added like prior keys: a `ref` + `configRegistry` entry (frontend) and tolerated by the backend config payload; the row binds via the existing auto-save path.
- **`CalendarView` rolling-grid change:** the rolling view's day-grid builder renders `calendarWeeks` weeks starting from the current week (clamped to a sensible range, e.g. 1–12). Month/Week/Day views are unchanged. This is the only net-new *rendering* behavior in C1.
- All other "new" rows (`focusLightMode`, `focusLightDimOthers`, `touchControls`, `touchControlSize`, `displayName`, `calendarViewMode`) surface **existing** keys — no new behavior.

## 6. Preservation (behavior unchanged)

- **Auto-save** — `useConfigForm` debounced save + save-status pill; every row emits `update:config` exactly as today.
- **Search & deep-link** — `settingsRegistry` reused; Display's former *tabs* become *section anchors*, so search results and `?setting=<id>` jump to the category and scroll to the section. Keyword index preserved.
- **Plugin instance forms** — `PluginFieldRenderer` / `InstanceModal` untouched.
- **Other 5 categories** — existing components inside the new shell.
- **Keyboard** — Settings uses standard web keys; Cycle-A controls are keyboard-operable with `:focus-visible`. The dashboard 7-button vocabulary (incl. `mode_settings`) is untouched.

## 7. Testing

Vitest + `@vue/test-utils`. New units each get specs:
- `CategoryRail` — renders 6 entries, marks/focus-lights the active, emits `select`, keyboard nav.
- `SettingRow` — label/description render, control slot, ≥44px, `:focus-visible`.
- `SettingsSection` — eyebrow label + `id` anchor + rows.
- `SettingsSearch` — filters via `settingsRegistry`, emits `jump`, `/` focuses.
- `NumberStepper` — increment/decrement, min/max clamp, emits `update:modelValue`.
- `ThemePicker` — trigger opens popover, selecting a card emits `selectedTheme`, outside-click/Escape closes.
- `TypefacePicker` — lists 3 type themes, selection calls `useTypeTheme`.
- `SettingsTopBar` — breadcrumb reflects category (and section), Done emits/navigates, save-status reflects `useConfigForm`.
- `DisplaySettings` — sections render; each control bound to the right `configStore` key; the new keys (`focusLightMode`/`focusLightDimOthers`/`touchControls`/`touchControlSize`/`displayName`/`calendarViewMode`/`calendarWeeks`) emit correct `update:config`.
- `CalendarView` — rolling view renders `calendarWeeks` weeks; clamp; month/week/day unchanged.

Existing specs stay green: `SettingItem`, `settingsRegistry`, `useConfigForm`, `usePersistedSettingTab`, the dashboard keyboard/mode/layout suites.

## 8. Risks

- **Search-anchor remap** for Display (former tabs → section ids); implement scroll-to-section and update the Display destinations' targets so deep-links still land.
- **Theme semantics** — keep two rows (Theme = `selectedTheme` via picker; Theme mode = `themeMode`) rather than conflating into the mock's single pill, to match current behavior.
- **`dashboardScreens` editor** — embedded as-is; restyle deferred.
- **WIP collision** — `PluginsCategory` not migrated in C1; reconciled when the `plugin-repository` WIP lands (C2).
- **`calendarWeeks` rendering** — verify the rolling grid math (week start alignment, week numbers, today highlight) holds for arbitrary counts.

## 9. Quality floor

- Tokens only (no hardcoded hex/font); tabular figures where data is shown.
- ≥44px touch targets; `:focus-visible` preserved; `prefers-reduced-motion` respected by the focus-light + popovers.
- Responsive: the rail + content must not break narrow widths.

## 10. C1 outcomes & C2 follow-ups (post-implementation)

C1 shipped the shell + Display category. Resolved/deferred during build + final review:

- **Restart/Reload admin actions** — the old header system menu was removed (mock is clean); by decision the actions (Restart Backend / Restart Frontend / Reload UI) were relocated into the **Maintenance** category (`UpdatesTab` "System" section, with confirm). **Done in C1.**
- **Multi-screen / regions editor (`dashboardScreens`)** — spec §4 wanted it embedded in LAYOUT; deferred to **C2** (extract the screen/region picker out of `DashboardLayoutTab` into its own component and place it in the Display LAYOUT section; update search anchors). Region editing is temporarily unreachable from the new shell.
- **`weekendDays`** — multi-select row deferred to **C2**.
- **SelectPill `aria-label`** — `SelectPill` has no `ariaLabel` prop, so DisplaySettings' enum pills rely on the adjacent `SettingRow` label + the selected option text. **C2:** add an `ariaLabel` prop to `SelectPill` and pass row labels.
- **Typeface applied at app boot** — `TypefacePicker` now calls `loadTypeTheme()` on mount, but the app root never applies the saved type theme at startup (pre-existing gap). **C2/follow-up:** call `loadTypeTheme()` once at app init (e.g. `main.js`/root) so the persisted typeface is active on the dashboard, not only after opening Settings.
