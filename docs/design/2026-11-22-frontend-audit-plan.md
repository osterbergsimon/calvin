# Frontend audit: the fix plan (calvin-kajl)

Status: plan. It sequences the findings of the frontend audit of 2026-11-19 (audited at 8be250f3) into
builder-sized PRs. Every finding was rechecked against `origin/develop` at 41b3b6a3 by reading the code, with no
kiosk runs. **All 16 must-fix findings (M1-M16) and all 25 later findings (L1-L25) are still open.** The line
numbers below are the current ones.

Rules for every PR:
- Follow the [frontend doctrine](frontend-doctrine.md) and the [no-developer-words](2026-10-31-no-developer-words.md)
  rules. Copy in **bold** is exact.
- Screenshots come from the mocked e2e harness (`tests/e2e/phone/fixtures/api-mock.js`):
  - at 390 and 1280, light and Backlit;
  - plus 800×480 for anything on the wall.
- A PR marked **shared block** changes `components/ui/`, `base.css`, `theme.css` or `main.css`. Its
  screenshots include the UI gallery (`ui-gallery.html`) before and after.
- The SettingRow gap (calvin-4txw) is already being built and is not part of this plan.

## Order at a glance

| # | PR | Findings | Shared block | Owner |
|---|---|---|---|---|
| 1 | Focus ring contrast | M3 | yes | — |
| 2 | Forced colours | M2 | yes | — |
| 3 | Nested dialogs: Escape and the page behind | M1, L1 (short term) | yes | — |
| 4 | The wall for screen readers | M4, M10, M15, L12, L15 (BarLogo), L22 | no | — |
| 5 | The Settings shell for screen readers | M5, M9, M11, L8, L15 (top bar), L18 | no | — |
| 6 | Keyboard reach | M6, M12, M13, M16 | yes (`main.css`) | — |
| 7 | Plain words on the wall and in uploads | M7, M8, L13, L14, L19, L20 | no | — |
| 8 | CI guard | L24 | no (tests only) | — |
| 9 | `ui/` block details | L2-L7, L9, L10, L23 | yes | — |
| 10 | Hand-styled buttons and dead code | L16, L17 | no | — |
| 11 | Head and fonts | L21, L25 | yes (`index.html`, `fonts.js`) | — |
| O1-O4 | Needs the owner first | L11; today marker; photo frame pause; theme card check | — | **yes** |

PRs 1-3 are independent. PR 8 must come after 2, 4 and 5, because its new rules would fail before those fixes.
The rest can run in any order.

---

## PR 1. Focus ring contrast (M3), shared block

**Why.** In the light theme the focus ring is `--focus` `#e08a1e`. It reaches 2.68:1 on white and 2.37:1 on
`--bg-0`, below the 3:1 that a focus indicator needs. Backlit is fine.

**Fix.**
- `frontend/src/styles/theme.css`:
  - In `:root` (light), next to `--focus` (line 15), add
    `--focus-ring: color-mix(in srgb, var(--focus) 75%, var(--ink));`. That is `#af7021`: 4.07:1 on white and
    3.59:1 on `--bg-0`.
  - In `.dark` (line 277 onward), add `--focus-ring: var(--focus);`.
  - Both are on `<html>`, the same element where theme plugins set `--focus` (`useTheme.js`, `root.style`), so
    the mix resolves per theme.
- Replace `outline: 2px solid var(--focus)` with `outline: 2px solid var(--focus-ring)` everywhere. There are
  60 occurrences: `base.css`, the `ui/` blocks first, then the rest. The change is mechanical.
- Focus drawn with `box-shadow: 0 0 0 2px var(--focus)` changes the same way: `CalendarEventItem.vue:222, 231`,
  `CalendarTimedEvent.vue:108`, `CalendarRibbon.vue:183, 190`.
- **Unchanged:** buttons, selection, the Tabs underline and `ProgressBar` keep `--focus`. Only the ring changes.
- **Doctrine.** In `docs/design/frontend-doctrine.md`:
  - line 66: add `--focus-ring` to the colour row ("focus ring only");
  - line 192: change the Focus-visible row to `outline: 2px solid var(--focus-ring)`.

**Tests.** `tests/unit/styles/themeContrast.spec.js` checks that `--focus-ring` is at least 3:1 against
`--bg-0`, `--bg-1` and `--bg-2` in every built-in theme, light and dark.

**Screenshots.** The UI gallery with a focused Button, SegmentedControl, ToggleSwitch and TextField, at 390,
light and Backlit. Also a focused calendar event chip on the wall at 800×480, light.

## PR 2. Forced colours (M2), shared block

**Why.** With Windows High Contrast on, nothing in `frontend/src` has a `forced-colors` rule except
`SwitchGrid.vue`. As a result:
- switches vanish;
- the selected segment and the active tab look like the rest;
- focus drawn only with `box-shadow` disappears.

**Fix.** Add a scoped `@media (forced-colors: active)` block in each of these files:

| File | Rule |
|---|---|
| `ui/ToggleSwitch.vue` (`.tog` from line 26) | `.tog { border: 1px solid ButtonText; } .tog::before, .tog::after { background: ButtonText; } .tog.on { background: Highlight; } .tog.on::before, .tog.on::after { background: HighlightText; }` (match whichever pseudo-element draws the knob) |
| `ui/SegmentedControl.vue` (`.seg__btn.on`, line 84) | `.seg__btn.on { outline: 2px solid Highlight; outline-offset: -2px; }` |
| `ui/Tabs.vue` (`.tabs__tab.is-active`, lines 175-180) | `.tabs__tab.is-active::after { background: Highlight; }`, or if the underline is a border, `border-color: Highlight` |
| `CalendarEventItem.vue:222-244`, `CalendarRibbon.vue:183-190`, `CalendarTimedEvent.vue:108`, `ui/FocusPanel.vue:56, 82`, `ui/PasswordField.vue:121`, `PluginFieldRenderer.vue` (the input focus rule) | the focused or `.focused` selector gets `outline: 2px solid Highlight; outline-offset: 2px;` |
| `ui/OnScreenKeyboard.vue:643` | `:deep(.hg-button.hg-button-shift.k--on) { outline: 2px solid Highlight; }` |

- I decided the question left open in the audit (the focus light under forced colours): the `Highlight` outline
  is enough. `FocusPanel` needs nothing more.

**Tests.** One Playwright case per block in `tests/e2e/ui-gallery.spec.js` with
`page.emulateMedia({ forcedColors: "active" })`. It asserts that the switch track has a non-transparent
border, and that the selected segment and active tab have an outline or underline. PR 8 adds the snapshot.

**Screenshots.** The UI gallery under forced colours, at 1280: before and after.

## PR 3. Nested dialogs (M1, L1 short term), shared block

**Why.** Pressing Escape on a confirm shown over the pages editor closes both dialogs. This also happens with
"Replace what's in this region?" and with the clock bar editor over the pages editor.

**Fix.**
- `ui/Dialog.vue` (listener at lines 147-187): keep a module-level `openStack` of dialog ids.
  - Push the id when a dialog opens. Remove it when the dialog closes or unmounts.
  - `onKeydown` returns at once unless this dialog is the top of the stack.
  - Use the existing `titleId` counter as the id.
- `ui/Dialog.vue:42`: the "×" text glyph becomes `IconButton :icon="mdiClose"`. Keep the same accessible label.
- While any dialog is open, set `inert` on the siblings of the dialog's teleport root, and remove it when the
  last dialog closes. This means the screen reader cursor can't leave the dialog.
- Moving to native `<dialog>` + `showModal()` (the rest of L1) is not in this PR.

**Tests.** Unit: two nested Dialogs, where Escape closes only the inner one and a second Escape closes the
outer. Unit: `inert` is set while open and cleared after the last dialog closes. e2e: Escape on "Delete page?"
over the pages editor leaves the editor open.

**Screenshots.** The close button in the gallery dialog, light and Backlit.

## PR 4. The wall for screen readers (M4, M10, M15, L12, L15, L22)

| ID | File:line | Change |
|---|---|---|
| M4 | `ClockBarHorizontal.vue:7-9`, `ClockBarVertical.vue:7-9` | Replace `role="status" aria-label="Status bar" aria-live="polite"` with `role="region" aria-label="Clock bar"`. The bar is not a live region |
| M10 | `StatusRail.vue:10-14` | On each tile, remove `role="status"`, `tabindex="0"` and the two `@keydown` handlers. Keep `@click`. The rail (line 2) stays the one live region, and the close button stays the keyboard path |
| M15 | `CalendarEventItem.vue:14-15` | Add `role="button"` and remove `:title="eventTitle"`. On the clipped continuation chip, use `:aria-label="eventTitle"` |
| L12 | `PhotoSlideshow.vue:95` | `alt=""`, because the frame is ambient |
| L12 | `ImageWithCaption.vue:3` | `alt=""` when the title shows. Add `aspect-ratio` on `.image-caption__img`, or `width`/`height` from the payload when given |
| L15 | `BarLogo.vue:6` | Add `role="img"` beside `aria-label="Calvin"` |
| L22 | `StatusRenderer.vue` (`.status__icon`), `MetricDashboard.vue` (`.metric-dashboard__icon`) | `aria-hidden="true"` on the icon element |

**Tests.**
- Unit:
  - the clock bar has `role="region"` and no `aria-live`;
  - a status tile has no tabindex;
  - the event chip has `role="button"`;
  - the slideshow image has empty alt;
  - the plugin icons are hidden.
- The axe run passes.

**Screenshots.** None needed. Nothing visible changes, except the caption image no longer shifting.

## PR 5. The Settings shell for screen readers (M5, M9, M11, L8, L15, L18)

| ID | File:line | Change |
|---|---|---|
| M5 | `settings/shell/CategoryRail.vue:2, 14` | `<nav aria-label="Settings categories">` with no role, wrapping `<ul class="category-rail__list" role="list">` and one `<li>` per category. Remove `role="listitem"` from the FocusPanel button. Reset the `ul` margin and padding in the rail's CSS |
| M9 | `index.html:10`, `router/index.js` | `<title>Calvin</title>`. `router.afterEach(to => { document.title = to.meta.title ? \`${to.meta.title} – Calvin\` : "Calvin"; })`. Meta titles: settings **Settings**, guest share **Shared photos**, dashboard none |
| M11 | `settings/shell/SettingsTopBar.vue:38-52` | `<Button size="sm" :icon="mdiCellphone" data-action="phone">`**Use your phone**`</Button>` with no `aria-label`, and `<Button variant="primary" size="sm" data-action="done">`**Done**`</Button>`. Delete `.settings-topbar__phone*` and `.settings-topbar__done*`, except the phone-hiding `@media` rule |
| L8 | `settings/shell/SettingsSearch.vue:34-45` | A plain `<ul aria-label="Search results">` of buttons, with no `listbox`/`option` roles. `aria-hidden="true"` on the `<kbd>`, and drop its `aria-label`. One mounted visually hidden polite line: **{n} results** / **1 result** / **No results** |
| L15 | `SettingsTopBar.vue:15` | Add `role="img"` beside `aria-label="Calvin"` |
| L18 | `App.vue`, Settings | Wrap the router view in `<main>`. Settings gets a visually hidden `<h1>Settings</h1>` |

**Tests.**
- Unit:
  - the rail renders a `nav` with buttons named after the categories;
  - search has no `listbox`, and the count line;
  - one `main` exists;
  - the title is "Settings – Calvin" on `/settings`.
- e2e: on `/settings`, `getByRole("button", { name: "Content" })` resolves.

**Screenshots.** The top bar at 390 and 1280, light and Backlit: the two buttons now come from `Button`.

## PR 6. Keyboard reach (M6, M12, M13, M16), shared block (`main.css`)

| ID | File:line | Change |
|---|---|---|
| M6 | `plugins/renderers/CardGrid.vue:16-24`, `ItemList.vue:8-17` | Keep the `<li>`. When `isClickable(...)`, its content goes inside a `<button type="button" class="… calvin-plugin-clickable">` that has the click. `main.css:194-202`: `.calvin-plugin-clickable` resets button chrome (`font: inherit; color: inherit; background: none; border: 0; padding: 0; text-align: inherit; width: 100%`) and keeps the row's grid, so the hover and focus rules apply |
| M12 | `settings/specialized/ThemeSelector.vue:7-20` | The grid gets `role="radiogroup" aria-label="Theme"`. Each card gets `role="radio"`, `aria-checked`, `aria-disabled` for unselectable themes, and a roving tabindex (0 on the checked card). Arrow keys move and select, as in `SegmentedControl`. Add `@keydown.space.prevent` |
| M13 | `settings/specialized/AddWebPageButton.vue:5-6` | Replace `:disabled` and `title` with `:aria-disabled="candidates.length === 0 ? 'true' : undefined"` and an early return. Add an `InlineNote` under it, linked by `aria-describedby`: **Turn on a plugin that shows web pages first, in Settings › Plugins.** |
| M16 | `settings/shared/ClockBarEditor.vue:207, 215` | `:aria-disabled="!canMoveEarlier ? 'true' : undefined"` (and the same for Later) instead of `:disabled`, with an early return in both handlers. `Button.vue:120` already styles it |

**Tests.**
- Unit:
  - a clickable card is a button and an unclickable one is not;
  - theme cards have arrow keys and `aria-checked`;
  - Add a web page is focusable with the note when there are no candidates;
  - Move later at the end keeps focus.
- The renderer gallery snapshot shows no layout change.

**Screenshots.** The card-grid and item-list in the renderer gallery at 800×480, light and Backlit, with a row
focused. The theme picker at 390.

## PR 7. Plain words on the wall and in uploads (M7, M8, L13, L14, L19, L20)

| ID | File:line | Now | New |
|---|---|---|---|
| M7 | `IframeRenderer.vue:3` | no title | `:title="schema.title \|\| 'Web page'"` |
| M7 | `service/IframeViewer.vue` iframe | no title | a `title` prop from `EmbedOverlay`: **Page from {host}**, else **Web page** |
| M8 | `IframeRenderer.vue:41` | It blocks being shown inside another page (X-Frame-Options/CSP). | **This site doesn't allow being shown inside Calvin.** |
| M8 | `IframeRenderer.vue:63` | Retry (hand-styled) | `<Button variant="secondary">`**Try again**`</Button>` |
| M8 | `IframeRenderer.vue` open link | `<a class="iframe-renderer__open">` | `<ExternalLink :href="url">`**Open in a new window**`</ExternalLink>`, and drop the `.iframe-renderer__open*` CSS |
| M8 | `IframeViewer.vue:22` | Cannot Display Service | **This site won't open here** (keep `FRAME_BLOCKED_TITLE` when blocked) |
| M8 | `IframeViewer.vue:27-29` | …(CORS/X-Frame-Options). | **This site doesn't allow being shown inside Calvin.** |
| M8 | `IframeViewer.vue:36, 39, 42` | Show QR Code / Open in New Window / Retry | `Button` **Show QR code** / `ExternalLink` **Open in a new window** / `Button` **Try again** |
| M8 | `WeatherForecast.vue:82-83` | `{{ data.error }}` / `{{ data.message }}` | `<EmptyState compact :inset="false" message="Couldn't get the weather." help="It will try again soon." />`, and log `data.error` with `logError` |
| L13 | `PhotoSlideshow.vue:52, 105`; `ThemeSelector.vue:4` | Loading images... / Loading themes... | **Loading photos…** / **Loading themes…** |
| L14 | `WebServiceViewer.vue:12, 21, 72-73, 85-86, 93-94` | Close Fullscreen (ESC) / Web Services / Previous Service / Next Service / Enter Fullscreen | Remove the `title` duplicates. Panel **Web pages**; **Previous web page**; **Next web page**; **Full screen**. Exit stays **Exit fullscreen** to match Photos and Calendar |
| L14 | `NotificationSystem.vue:114-115` | Next Service / Previous Service | **Next web page** / **Previous web page** |
| L19 | `settings/auth/AuthLockScreen.vue:30-31` | …Check that the server is running and this device is on the same network. | **Settings can't check whether you're signed in. Check that Calvin is running and this device is on the same network.** |
| L20 | `PluginSections.vue:21-22` | `<button class="btn-upload">` Choose Files / Uploading... | `<Button :loading="uploading" loading-label="Uploading…">`**Choose photos**`</Button>` |
| L20 | `PluginsCategory.vue:599-608` | Successfully uploaded 3 images; error clears after 10 s | **Uploaded {n} photos.** / **Uploaded 1 photo.**; the error is `friendlyError(err, "upload these photos")`, kept until the next try, in a mounted polite `InlineNote` |

- `tests/unit/copy/noDevWords.spec.js`: add `x-frame|csp|cors|iframe` to the regex.
- `IframeViewer.vue` leaves the `controlLint` allowlist (`tests/unit/styles/allowlists/content.js`).

**Tests.** The copy guard, and unit checks of each new string and of the iframe titles.

**Screenshots.** The blocked-frame state of both iframe views and the weather error, at 800×480, light and
Backlit. The plugin upload row at 390.

## PR 8. CI guard (L24), tests only

Run it after PRs 2, 4 and 5, which fix what these rules would flag.
- `tests/e2e/a11y/fixtures/axe-audit.js`: keep the tag run (`AXE_TAGS`, line 18; builder at line 39).
  - Add a second pass, `new AxeBuilder({ page }).withRules(["aria-allowed-role", "landmark-unique"])`, with the
    same include and exclude, and merge its violations into the result. `withRules` replaces the tag filter, so
    the rules can't be added to the first builder.
  - Update the comment at line 17.
- `tests/e2e/ui-gallery.spec.js`: add a forced-colours snapshot of the gallery at 1280
  (`emulateMedia({ forcedColors: "active" })`), light.
- The `--focus-ring` contrast pair is in PR 1's `themeContrast.spec.js`. Check that it runs in CI.

**Screenshots.** The new baseline snapshot only.

## PR 9. `ui/` block details (L2-L7, L9, L10, L23), shared block

| ID | File:line | Change |
|---|---|---|
| L2 | `ui/SegmentedControl.vue:12` | `:tabindex="o.value === modelValue \|\| (selectedIndex < 0 && i === 0) ? 0 : -1"` |
| L3 | `ui/NumberStepper.vue:7, 17` | `` :aria-label="`Decrease ${ariaLabel}`" `` / `` `Increase ${ariaLabel}` ``. At a bound, `aria-disabled="true"` and no change |
| L4 | `ui/RangeSlider.vue` (the input) | `` :aria-valuetext="`${clamped}${unit}`" `` |
| L5 | `ui/PasswordField.vue:27` | Remove `aria-pressed` and keep the flipping Show/Hide label |
| L6 | `ui/IconButton.vue:9, 41` | When `active`, append a visually hidden **(changed)** to the accessible name |
| L7 | `ui/SelectPill.vue` | Close the list on `focusout` when the new focus is outside both the panel and the trigger |
| L9 | `ui/OnScreenKeyboard.vue:168-175` | Add `{ attribute: "aria-pressed", value: shiftOn ? "true" : "false", buttons: "{shift}" }`. Remove `role="button"` and `tabindex` from `.osk-space-label`, and give the layout picker its own key path |
| L10 | `SecuritySettings.vue:33`, `security/AdminAccessSection.vue:22`, `shared/DefaultEditNote.vue:3`, `plugins/overlays/EmbedOverlay.vue:18`, `tabs/content/PhotoUpload.vue:29` | Keep each `role="status"` element mounted and toggle its text, instead of `v-if` on the region |
| L23 | `shared/DisplayCheckDialog.vue:1719` | Wrap the spinner `animation:` in `@media (prefers-reduced-motion: no-preference)` |

**Tests.** A unit test per row (names, value text, tabindex with a null value, focusout closes, shift
pressed, region stays mounted). The reduced-motion case in the gallery spec.

**Screenshots.** The gallery at 390, light, for the stepper and the slider. Nothing else is visible.

## PR 10. Hand-styled buttons and dead code (L16, L17)

- **L16:**
  - `shared/DefaultEditNote.vue:5, 13`: `Button variant="link" size="sm"` **Change them too**, and
    `IconButton :icon="mdiClose" label="Dismiss this note"` in place of the "×" button.
  - `PluginActions.vue:7`, `RebootCombo.vue` and `ActionPicker.vue`: use `Button` (`PluginSections.vue` is done in
    PR 7).
  - `controlLint`: flag any `<button class=…>` in a template outside `components/ui/`, not only class names with
    "btn".
- **L17:** delete `settings/specialized/OrderingManager.vue`, its export (`specialized/index.js:10`), its spec
  (`tests/unit/components/settings/OrderingManager.spec.js`) and its two allowlist entries
  (`tests/unit/styles/allowlists/plugins.js:14, 32`).

**Screenshots.** The DefaultEditNote at 390, light and Backlit.

## PR 11. Head and fonts (L21, L25), shared

- **L21:**
  - `index.html:8`: two metas, `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#eef1f4">`
    and the dark one with `#0e1316`. `useTheme.js` keeps them in step with the chosen theme.
  - `index.html:12`: drop the `preconnect` to `/api`.
- **L25:** `styles/fonts.js:6, 8, 15, 19`: drop the 700 imports. No app CSS uses weight 700: only
  `dev/RendererGallery.vue:373`, which changes to `var(--weight-title)`.

**Tests.** The build passes. A unit check that `fonts.js` imports no 700 or 800 face.

**Screenshots.** None.

---

## Needs the owner first (O1-O4)

These need a decision or a mock before a builder starts. Each becomes its own spec, then its own PR.

1. **O1. Switch and field boundaries (L11).** In light, the switch's off track is 1.79:1 and the field borders
   (`--line`, `theme.css:7`) are 1.29:1. Both are below the 3:1 that control boundaries need.
   - `color-mix(in srgb, var(--ink) 55%, var(--bg-1))` = `#82878a` gives 3.63:1 on white and 3.20:1 on
     `--bg-0`, but every field and switch looks heavier.
   - It ties in with the doctrine's open question about the toggle knob. I'll mock both in the gallery for the
     owner.
2. **O2. The today marker vs the focus cursor.** Today is drawn in orange (`CalendarView.vue:1837-1846,
   2053-2070`). On the wall, the keyboard focus cursor is also an orange ring, so the two look alike. Options: an
   `--ink` ring for today, or a filled date number. Mock first.
3. **O3. A pause control for the photo frame.** The slideshow advances on its own with no visible pause (WCAG
   2.2.2). Where a pause control goes on a wall without clutter needs a mock.
4. **O4. A check mark on the theme cards** (after PR 6's roles), so the state isn't shown by colour alone. It is
   a small mock and optional.
