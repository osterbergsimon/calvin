# Settings categories reorganisation: spec

Status: approved by the owner, ready to build as its own issue. Land it **after** the CLV-9 follow-ups and the
keyboard-layout work (calvin-sjhb), because it moves the same Settings files. Mockup:
[mocks/settings-reorg/reorg.html](mocks/settings-reorg/reorg.html) (PNG: `mocks/settings-reorg/png/r1.png`).

Frontend only. **No setting is added, removed or renamed in config.** Sections move between categories; a few
section titles and category labels change.

## 1. Why

- **Display** mixed four jobs: the physical screen (orientation, flip, rotation), layout (screens & regions),
  looks (theme, typeface) and touch controls. Its name also clashed with Device › "Display power", so "turn
  the screen off at night" had two plausible homes.
- **Adding a source happened in two places.** Calendars and photos were added in Content Sources, but web
  pages were added under Plugins ("Add a web service") and ordered back in Content.
- **Device was a grab-bag.** "Notifications" is the key-press feedback overlay (keyboard), and "Hardware" is
  only version numbers (they belong next to Updates).
- **Clock Bar** was a whole category for three short sections.
- 8 categories needed about 650px of rail height. 7 fit in about 560px.

## 2. The new categories (rail order)

Category **ids are kept** where a category survives, so stored state, deep links and tests keep working.
Only `clock-bar` goes away.

| # | id | Label | Subtitle | Icon |
|---|---|---|---|---|
| 1 | `content` | **Content** | Calendars · photos · web pages | 📦 |
| 2 | `dashboard` | **Dashboard** | Screens · clock bar · theme · touch | 📐 |
| 3 | `device` | **Screen & keyboard** | Orientation · power · keyboard | 🖥️ |
| 4 | `kiosks` | **Kiosks** | Per-device settings | 📺 |
| 5 | `plugins` | **Plugins** | Install · manage | 🔌 |
| 6 | `maintenance` | **System** | Updates · backup · diagnostics | ⚙️ |
| 7 | `security` | **Security** | Admin password · allowed origins · network access | 🔒 |

- `defaultSettingsCategoryId` becomes `"content"`. A first visit lands where setup starts.
- `isKnownSettingsCategory` gets an alias map `{ "clock-bar": "dashboard" }`, so a stored
  `settings_category` or an old link with `clock-bar` opens Dashboard instead of falling back.

## 3. Section moves (exact)

Section ids (`SettingsSection id=…`) **don't change**. Only their parent category, their order, and in a few
cases their title change.

**Content** (`ContentSettings.vue`), unchanged order, one retitle and one addition:
1. `content-calendars` Calendars
2. `content-calendar-display` Calendar display
3. `content-photos` Photos
4. `content-images` Image sources
5. `content-services`, retitled **Web pages & services**. Add a button **Add a web page** (`.btn--primary`
   style used elsewhere in Content) in the section header row, above `ServicesTab`. It opens the **same flow**
   the `plugins-services` destination opens today (the add-instance modal for the web-service plugin); reuse
   it, don't fork it. When there are no service instances, the section shows the existing empty-state
   pattern with that button.

**Dashboard** (`DisplaySettings.vue`, rename the file `DashboardSettings.vue`):
1. `regions` Screens & regions
2. `clock-bar-clock`, retitled **Clock**
3. `clock-bar-layout`, retitled **Clock bar layout**
4. `clock-bar-items`, retitled **Clock bar items**
5. `appearance` Appearance (Theme, Theme mode, Typeface, Settings UI size, Display name), unchanged
6. `kiosk-touch`, retitled **Touch & controls** (all of its rows stay, including Touchscreen and Dashboard size)

Move the three clock-bar sections' markup and logic out of `ClockBarSettings.vue` into a component
`ClockBarSections.vue` rendered inside Dashboard. Delete the `clock-bar` category component and its `v-if`
in `Settings.vue`.

**Screen & keyboard** (`DeviceSettings.vue`):
1. `layout` (from Display), retitled **Screen orientation**: Orientation, Flip 180°, Apply display rotation
2. `device-power`, retitled **Screen power**
3. `device-keyboard` Keyboard (on-screen keyboard, layout rows, keyboard type & mappings, reboot combo)
4. `device-notifications`, retitled **Key-press feedback** (same rows: Enable feedback, Feedback style,
   Auto-hide delay)
5. ~~`device-hardware`~~, which moves to System

**Kiosks**: unchanged.

**Plugins** (`PluginsCategory.vue`): sections unchanged (`plugins-install`, `plugins-installed`). Only the
subtitle changes, and the `plugins-services` destination moves to Content (§4).

**System** (`MaintenanceSettings.vue`):
1. `maintenance-updates` Updates
2. `device-hardware` (from Device), retitled **Versions & status**: Backend version, Frontend version,
   System status
3. `maintenance-system`, retitled **Restart**
4. `maintenance-backup`, `maintenance-restore`, `maintenance-auto-backup` (BackupSettings), unchanged
5. `maintenance-diagnostics` Diagnostics

**Security**: unchanged (`security-admin`, `security-sealed`, `security-origins`).

## 4. Registry (`settingsRegistry.js`)

- Destination **ids stay the same**: QR codes, `EmptyState` buttons, search and the CLV-9 links
  (`?setting=device-reboot`, `maintenance-updates`, …) keep working.
- Update `category`, `path` and `tabKey` for the moved destinations:

| destination id | new category | new path |
|---|---|---|
| `dashboard-layout` | `device` | Screen & keyboard / Screen orientation |
| `dashboard-regions` | `dashboard` | Dashboard / Screens & regions |
| `dashboard-ui` | `dashboard` | Dashboard / Appearance |
| `dashboard-kiosk` | `dashboard` | Dashboard / Touch & controls |
| `clock-bar-appearance` | `dashboard` | Dashboard / Clock |
| `clock-bar-items` | `dashboard` | Dashboard / Clock bar items |
| `content-*` | `content` | Content / … (path prefix "Content", not "Content Sources") |
| `plugins-services` | `content` | Content / Web pages & services (`tab: "content-services"`), label **Add a web page** |
| `device-power` | `device` | Screen & keyboard / Screen power |
| `device-keyboard`, `device-reboot` | `device` | Screen & keyboard / Keyboard |
| `device-notifications` | `device` | Screen & keyboard / Key-press feedback |
| `device-hardware` | `maintenance` | System / Versions & status |
| `maintenance-*` | `maintenance` | System / … |

- `tabKey` follows the new category (each category's existing key; the clock-bar key goes away).
- Keywords: keep all existing ones, and add the old names so search still finds things by what people
  remember: "display" on Dashboard and Screen orientation, "clock bar" on the clock sections,
  "device" and "hardware" on Versions & status, "maintenance" on System, "notifications" on Key-press
  feedback, "content sources" on Content.

## 5. Copy that names categories

Every user-facing string that names a Settings place must use the new names. Grep `frontend/src` for
`Content Sources`, `Clock Bar`, `Clock bar`, `Maintenance`, `Device ›`, `Display ›`, `Settings ›`. One known
case: the photos empty state says "Upload photos in Settings › Content Sources › Image sources." That
becomes **Upload photos in Settings › Content › Image sources.** Update `docs/` user guides that name
categories in the same PR.

## 6. Layout and behaviour

- No visual change to the rail or sections beyond labels: same `CategoryRail`, `SettingsSection` and
  `SettingRow`. The measured rail scrolling from `fix/settings-rail-overflow` stays.
- Scroll-spy (`settingsSectionSpy`) and the top-bar location label pick up the new titles automatically. Check
  that the eyebrow for Dashboard's clock sections reads "Clock", "Clock bar layout", "Clock bar items".
- Phone width: unchanged (the rail stacks above the content).

## 7. Tests

- Registry: every destination's `category` exists; no destination points at `clock-bar`; the destination ids
  set is identical before and after (snapshot the id list); `plugins-services` resolves to Content.
- `isKnownSettingsCategory("clock-bar")` resolves to `dashboard`; the default category is `content`.
- `Settings.vue`: `?setting=device-reboot` opens Screen & keyboard and scrolls to Keyboard;
  `?setting=device-hardware` opens System › Versions & status; `?setting=clock-bar-items` opens Dashboard.
- Each category component renders its sections in the order in §3 (assert the section id order).
- Search: "clock bar", "display", "maintenance" and "notifications" still return results.
- Existing category specs (`DisplaySettings.spec.js`, `ClockBarSettings.spec.js`, `DeviceSettings.spec.js`,
  `MaintenanceSettings.spec.js`, `ContentSettings.spec.js`) move with their sections.
