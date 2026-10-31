# Frontend consistency audit (2026-10-31)

Owner request: "we need a proper FE audit on things like the .btn issue; it's not scalable."
Method: `frontend/scripts/ui-audit.py` parses every `.vue` `<style>` block and template (126 files, `dev/` excluded)
and counts hand-rolled versions of shared patterns **outside `components/ui/`**. "Distinct looks" means distinct
combinations of background / border / radius / padding / font-size / weight, i.e. how many visual variants exist.
The script is in the repo, so these numbers can be re-run and must only go down. Target components and rules come
from [the frontend doctrine](../frontend-doctrine.md).

## 1. Summary

| Pattern | Hand-rolled rules | Files | Distinct looks | Should be | Priority |
|---|---|---|---|---|---|
| **Buttons** | 60 | 32 | **39** | `Button` (4 variants × 2 sizes) + `IconButton` | P1 |
| **Cards / panels / boxes** | 117 | 57 | **103** | `SettingsSection` panel, `ListRow`, `Card` (`--radius-card`), dialogs | P1 |
| **Notices / errors / hints / banners** | 57 | 33 | **33** | `InlineNote` (neutral/warn/err/ok) + `Banner` (page-level) | P1 |
| **Text inputs / selects** | 23 | 16 | 19 | `TextField`, `PasswordField`, `SelectPill`, `NumberStepper` | P1 |
| **Overlays / dialogs** (`position: fixed`) | 19 | 18 | 15 | `Dialog` shell (title, body, actions, scrim, focus trap), `Sheet`, `Popover`; toasts stay in `NotificationSystem` | P2 |
| **Headings** | 32 | 28 | 19 | 3 roles: section eyebrow, `--text-title`, `SettingGroup` label | P2 |
| **Empty states** | 15 | 14 | 14 | `EmptyState` (exists, under-used) | P2 |
| **Tags / badges** | 9 | 6 | 9 | `Tag` (CLV-51 left these) | P3 |

Values that should be a short fixed set:

| Thing | Found | Should be |
|---|---|---|
| `z-index` values | **28 distinct** (0…10000, incl. 9999, 1003, 2100) | 5 layers (`--z-raised/sticky/dialog/osk/toast`) |
| `box-shadow` | **51 distinct** | 2 (`--elev-1`, `--elev-2`) + focus rings |
| `font-weight` | 400, 500, 550, 600, 650, 700 | 400 / 500 / 600 |
| Transition durations | 10 (0.12s … 0.5s, 120ms, 180ms) | `--dur-fast` 120ms, `--dur` 200ms |
| Breakpoints | 479, 480, 600, 720, 768px | 600 (phone) and 1024 (wide), via one mixin or container queries |
| Raw spacing (padding/margin/gap without tokens) | **627** declarations | role tokens (`--gap-*`, `--panel-pad-*`) |
| Native controls outside `ui/` | 62 `<input>`, 15 checkboxes, 5 number, 3 `<select>`, 2 colour, 1 textarea | wrapped `ui/` controls; native only inside them |
| Emoji used as icons in templates | 17 in 16 files | `mdi` icons (emoji render differently per OS and kiosk font) |
| Settings files with their own `<style>` | **62** | layout-only, then none (doctrine §3.1) |

Re-implemented components: 5 files build their own switch, 2 their own tabs, 4 their own modal and 3 their own
popover or menu. 9 files implement `role="dialog"` separately: ConnectionStatus popover, ThemePicker,
AdminSignInDialog, EmbedOverlay, HandoffOverlay, ActionPicker, ScreenRegionEditor, ProviderPicker, Settings.

## 2. What this means

- **Every new feature re-solves "what does a button / box / error look like".** With 39 button looks and 103 box
  looks, any new setting is guaranteed to differ from its neighbours. Specs can't prevent it, because there is
  nothing to point at.
- **Tokens didn't fix it.** Most of these rules already use tokens. The variation is in *which* token and *which*
  combination. Shared components fix that; more tokens don't.
- **Overlays are a correctness risk, not just looks.** 28 z-index values and 9 dialog implementations are how the
  OSK/dialog stacking bugs (CLV-9 review) happened. Each dialog also re-implements its own focus trap and Escape
  handling.

## 3. Plan (maps onto the doctrine's migration)

**P1: the shared blocks, then the worst files.**
1. Build in `components/ui/`, each with a gallery entry (`ui-gallery.html`) and unit tests:
   - `Button` (primary / secondary / ghost / danger / link; md / sm; icon; loading);
   - `TextField`;
   - `InlineNote` (tones);
   - `Card`;
   - `ListRow`;
   - `Dialog` (title, body, actions, scrim, focus trap, Escape, `--z-dialog`, OSK-aware via `dialog-above-osk`).
2. Add the lints with today's offenders as a shrinking allowlist: `controlLint` (buttons and inputs),
   `roleLint` (z-index, shadow, weight, duration literals and primitives), `settingsNoStyle`.
3. Migrate **one category per PR**, worst first (matrix below): Plugins (installer, `InstanceModal`, picker), the page editor and its
   inspectors, Screens, the sign-in dialog and lock screen, Security, System, Content, then the dashboard surfaces. Each PR deletes the file's local control styles
   and removes it from the allowlists, with before/after shots from the mocked e2e harness at 1280 and 390.

**P2:** `Dialog` adoption for the 9 dialog implementations; `EmptyState` everywhere; headings to 3 roles; z-index,
shadow, weight and duration to the fixed sets; one breakpoint set.

**P3:** remaining badges to `Tag`; emoji → `mdi`; native controls wrapped.

**Done when** `ui-audit.py` reports, outside `components/ui/`:
- 0 hand-rolled buttons, inputs, notices and dialogs;
- ≤ 3 distinct card looks (panel, list row, card);
- ≤ 5 z-index values and ≤ 2 shadows;
- 0 settings `<style>` blocks beyond layout.

The script output goes into each migration PR description.

## 4. Per-file worklist

Files with the most hand-rolled patterns first. The full machine-readable output (selectors, values) comes from
running the script.

| File | Hand-rolled (B buttons · I inputs · C cards · N notices · H headings · E empty · O overlays · T tags) |
|---|---|
| `components/settings/shared/ScreenRegionEditor.vue` | B C N H O T |
| `components/settings/specialized/InstanceModal.vue` | B I C N H O |
| `components/auth/AdminSignInDialog.vue` | B C N H O |
| `components/settings/categories/PluginsCategory.vue` | B C N H O |
| `components/settings/categories/ScreensSettings.vue` | B I C N E |
| `components/settings/shared/regions/RegionInspector.vue` | B I C H E |
| `components/settings/shared/regions/ScreenInspector.vue` | B I C H E |
| `components/settings/specialized/PluginInstaller.vue` | B I C N H |
| `components/settings/specialized/ProviderPicker.vue` | C N H E O |
| `components/ConnectionStatus.vue` | C H O T |
| `components/EventDetailPanel.vue` | C H E O |
| `components/PluginSections.vue` | B N H E |
| `components/dashboard/SetupWelcomeCard.vue` | B C N H |
| `components/plugins/renderers/IframeRenderer.vue` | B C N H |
| `components/settings/auth/AuthLockScreen.vue` | B C N H |
| `components/settings/categories/DashboardSettings.vue` | B I C N |
| `components/settings/categories/security/ApiKeysSection.vue` | I N H E |
| `components/settings/specialized/PluginInstances.vue` | B C H E |
| `components/settings/tabs/clock-bar/ClockBarItemsTab.vue` | B C N H |
| `components/settings/tabs/layout/keyboard/ActionPicker.vue` | I C H E |
| `components/settings/tabs/layout/keyboard/KeyBindingTile.vue` | B C N T |
| `components/PluginFieldRenderer.vue` | B I N |
| `components/dashboard/CalendarViewOptions.vue` | B C T |
| `components/plugins/overlays/HandoffOverlay.vue` | C N O |
| `components/service/IframeViewer.vue` | B N H |
| `components/settings/categories/BackupSettings.vue` | B C N |
| `components/settings/categories/DefaultScreenSettings.vue` | I C N |
| `components/settings/categories/SecuritySettings.vue` | I N E |
| `components/settings/shared/ConfirmModal.vue` | B H O |
| `components/settings/shell/SettingsSearch.vue` | I C N |
| `components/settings/shell/SettingsTopBar.vue` | C N T |
| `components/settings/specialized/PluginCard.vue` | B C H |
| `components/settings/specialized/SourceList.vue` | B C E |
| `views/Dashboard.vue` | C N O |
| `views/Settings.vue` | C N O |
| `components/CalendarView.vue` | C E |
| `components/NotificationSystem.vue` | C O |
| `components/PluginActions.vue` | B N |
| `components/StatusRail.vue` | C O |
| `components/dashboard/ServiceRegionViewOptions.vue` | B C |
| `components/plugins/overlays/EmbedOverlay.vue` | C O |
| `components/plugins/renderers/CardGrid.vue` | H E |
| `components/settings/categories/MaintenanceSettings.vue` | B N |
| `components/settings/shared/AddKioskPanel.vue` | I C |
| `components/settings/shared/ClockBarFontSizePicker.vue` | I C |
| `components/settings/shared/CollapsibleSection.vue` | C H |
| `components/settings/shared/DisplayScheduleGrid.vue` | I C |
| `components/settings/specialized/OrderingManager.vue` | C H |
| `components/settings/specialized/ThemeSelector.vue` | C T |
| `components/settings/specialized/WhereItShows.vue` | H E |
| `components/settings/tabs/content/CalendarSourcesTab.vue` | B C |
| `components/settings/tabs/content/PhotoUpload.vue` | B N |
| `components/settings/tabs/layout/keyboard/RebootCombo.vue` | C N |
| `components/settings/tabs/system/UpdatesTab.vue` | B C |
| `components/CalendarRibbon.vue` | C |
| `components/ClockBarHorizontal.vue` | C |
| `components/ClockBarVertical.vue` | C |
| `components/DashboardPanel.vue` | H |
| `components/DashboardRegion.vue` | C |
| `components/MinimalUIOverlay.vue` | O |
| `components/PhotoSlideshow.vue` | O |
| `components/WebServiceViewer.vue` | O |
| `components/dashboard/AdminOverflow.vue` | C |
| `components/dashboard/RegionViewOptions.vue` | C |
| `components/plugins/WebComponentHost.vue` | N |
| `components/plugins/renderers/ImageWithCaption.vue` | H |
| `components/plugins/renderers/StatusRenderer.vue` | N |
| `components/service/ServiceViewer.vue` | N |
| `components/settings/categories/security/AdminAccessSection.vue` | N |
| `components/settings/shared/KioskSoftwarePointer.vue` | B |
| `components/settings/shared/KioskStatusHeader.vue` | C |
| `components/settings/shared/PageThumbnail.vue` | C |
| `components/settings/shared/TabNavigation.vue` | B |
| `components/settings/shell/CategoryRail.vue` | H |
| `components/settings/shell/CollapsibleSettingsSection.vue` | C |
| `components/settings/shell/SettingsSection.vue` | C |
| `components/settings/shell/ThemePicker.vue` | C |
| `components/settings/specialized/AddWebPageButton.vue` | B |
| `components/settings/specialized/PluginManager.vue` | C |
| `components/settings/tabs/content/ServicesTab.vue` | C |
| `components/settings/tabs/layout/KeyboardTab.vue` | O |
| `components/settings/tabs/layout/keyboard/KeyBindingBoard.vue` | C |
| `components/settings/tabs/system/UpdateSourceRows.vue` | I |