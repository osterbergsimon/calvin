# Calvin — Cycle B: Dashboard

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Part of:** [Touch + Visual Redesign](./2026-06-28-touch-visual-redesign.md) (umbrella spec §6, §8 "B — Dashboard").
**Builds on:** Cycle A foundation — tokens (`theme.css`), type themes (`useTypeTheme`), and `ui/` primitives (`FocusPanel`, `SegmentedControl`, `ToggleSwitch`, `SelectPill`).
**Reference mock:** [`mocks/mock-nobar.png`](./mocks/mock-nobar.png) (final dashboard direction).

---

## 1. Goal

Apply the focus-light design language to the live dashboard and add a **parallel touch layer**, without changing the keyboard action vocabulary. Touch and keyboard converge on the same shared state and the same handlers; touch is a second way to drive what already exists, not a second system.

## 2. Core architectural insight

Region focus is **already clean shared state**: `activeScreen.activeRegionId` (on the active dashboard screen, persisted via the config store). The keyboard moves it (`region_next/prev` → `cycleActiveDashboardRegion`). The visual highlight renders off it.

Therefore:
- **Touch** sets the same `activeRegionId` (tap a region) and calls the same `generic_*` handlers (tap a control).
- The **focus-light** is a richer render of that same state.
- The **keyboard path is untouched** — same actions, same functions, same persistence.

This is the whole design: one state, one set of handlers, two input grammars, one light.

## 3. Scope

**In scope (Cycle B):**
- Promote the active-region highlight to the **focus-light** (lit active region; configurable dimming of others).
- **Tap-to-focus** and **tap-item-to-act** direct manipulation.
- **Contextual region controls** (‹ › ↻ ⤢) on the focused region, mapped to existing handlers by region kind.
- **Dialog scrim** with backdrop-dismiss and dim-behind (blur optional).
- Horizontal **clock-bar** full restyle: wordmark, optional room label, **screen dots**, restyled clock/date, weather + connection, **admin overflow menu**, settings gear.
- **Inactivity fade/bloom** of touch chrome (and of the focus-light in `interaction` mode), reusing the existing inactivity machinery.
- Three new config keys with sensible defaults.

**Out of scope (deferred):**
- **Swipe gestures** (within-region next/prev, on-stage screen change) — a later cycle. Every action remains reachable via the contextual controls and dots, so nothing is stranded.
- **Vertical clock-bar structural restyle** — vertical bars inherit the new tokens (color/type) but keep their current structure this cycle.
- **Settings UI** — Cycle C. The new config keys ship in Cycle B with sensible defaults; their Settings rows are added in Cycle C.
- **Keyboard vocabulary changes** — explicitly forbidden (umbrella spec §2 non-goal).

## 4. Interaction states

The dashboard has three interaction states, layered over the existing inactivity machinery (`usePhotoFrameMode.resetInactivityTimer`, `configStore.shouldShowUI`, `configStore.photoFrameTimeout`):

| State | Trigger | Appearance |
|---|---|---|
| **Ambient (idle)** | no recent interaction | Calm content. **No** lit region, **no** dimming, **no** touch chrome. Just the calendar/photo split (or whatever the screen shows). Closest to today's resting state. |
| **Active** | a keypress moved focus, or a finger touched the screen | Focus-light blooms on the active region; contextual controls + dots + admin-overflow visible; (others dim if configured). |
| **Photo-frame** | inactivity beyond `photoFrameTimeout` (existing) | Existing photo-frame slideshow takes over (unchanged by this cycle). |

The **focus-light and touch chrome bloom and recede together**, both gated on the **interaction window** — defined as `configStore.shouldShowUI`, the same signal the clock bar already uses (`useClockBar`'s `shouldShow`). In kiosk this is exactly the bloom/recede behavior wanted: any touch or keypress calls `resetInactivityTimer()` → `showUITemporarily(...)` opens the window, and inactivity closes it. In non-kiosk/dev `shouldShowUI` may stay true, so the light stays visible — acceptable. This replaces the old hardcoded 2.5s `ACTIVE_HIGHLIGHT_MS` timer entirely. (`resetInactivityTimer` is already wired for `touchstart`, `keydown`, etc.)

**Exception — `always` focus-light mode** (see §5): the light stays on the active region permanently, independent of the interaction window. Touch chrome still fades.

## 5. Configuration (new keys)

All defaults preserve a sensible resting experience and are documented for migration. Settings rows land in Cycle C; Cycle B ships the keys + behavior.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `focusLightMode` | `'interaction' \| 'always' \| 'off'` | `'interaction'` | `interaction`: light blooms on interaction, recedes when idle. `always`: active region stays lit. `off`: never highlight (pure ambient). |
| `focusLightDimOthers` | boolean | `true` | When the light is active, do unfocused regions recede (opacity + slight desaturation)? `true` = the spec's "lit control panel" signature; `false` = glow on active only, others stay full-brightness. |
| `displayName` | string | `''` (empty → hidden) | Optional room/display label shown next to the wordmark in the clock bar. |

## 6. Components & units

### New

**`composables/useTouchCapability.js`**
- Returns a reactive `isTouch` derived from `matchMedia('(pointer: coarse)')`, updated on change.
- Single source of truth for "show touch chrome." On the 24" non-touch unit `isTouch` is `false`.

**`components/dashboard/RegionControls.vue`**
- Props: `regionKind` (`'calendar' | 'photos' | 'service'`).
- Renders the contextual control cluster for the focused region. Each button calls the **existing** handler for that kind (see §7). Buttons that don't apply to a kind are not rendered (e.g. refresh for photos).
- The expand/fullscreen verb (⤢) is `--focus`-filled (primary, per mock); prev/next/refresh are quiet `cbtn`-style 46px buttons.
- Emits no new domain logic — it is a touch surface over existing actions.

**`components/ui/ScreenDots.vue`**
- Props: `screens` (array), `activeScreenId`.
- Renders one dot per dashboard screen; active dot uses `--focus`. Tap a dot emits `select-screen(id)` → caller sets active screen via the existing screen path (`setActiveDashboardScreen` / the same mutation `screen_next` uses).
- Hidden when there is only one screen.

**`components/ui/DialogScrim.vue`**
- Reusable backdrop for dialog-style overlays. Props: `blur` (boolean, default `false`).
- Renders a dim scrim (cheap opacity layer) over the content behind; `blur` adds `backdrop-filter: blur()` as a progressive enhancement.
- Emits `dismiss` on backdrop tap. Reduced-motion safe (instant under `prefers-reduced-motion`).

**`components/dashboard/AdminOverflow.vue`** (or an overflow affordance integrated into `BarActionCluster`)
- A `⋯` button that toggles a small popover containing the admin buttons (mode toggle, orientation, side-view, UI-hide). The settings **gear stays visible outside** the overflow.
- The overflow trigger is part of the touch chrome and fades with the interaction window.
- Closes on outside tap / action / Escape (reuse the SelectPill outside-click + Escape pattern from Cycle A).

### Modified

**`components/DashboardRegion.vue`**
- Wrap region content in the Cycle-A `FocusPanel`, driven by `activeRegionId` (focused vs dimmed). Respect `focusLightMode` (`off` → never focused-styled) and `focusLightDimOthers` (controls the dim treatment).
- Emit `focus-region(id)` on tap of region chrome/background.
- Host `RegionControls` in the region header when the region is focused **and** `isTouch` **and** the interaction window is open.

**`views/Dashboard.vue`**
- Replace the 2px-outline + 2.5s-fade highlight (`ACTIVE_HIGHLIGHT_MS`, `activeRegionHighlightVisible`, the `watch` + timer) with the focus-light driven by interaction state + `focusLightMode`.
- Handle `focus-region` taps → set `activeRegionId` (same mutation `region_next` uses).
- Provide `isTouch` and interaction-window state down to regions and the clock bar.
- Keep the existing `MinimalUIOverlay` path.

**`components/ClockBarHorizontal.vue`** (+ `BarLogo`, `BarActionCluster`)
- Full restyle to the mock: left = wordmark + optional room label + `ScreenDots`; center = tabular clock (`--font-display`) + date (`--font-data`); right = weather + connection (`PluginStatusbarItems`) + `AdminOverflow` + settings gear.
- Keep all existing admin functions (now behind the overflow); retokenize.
- Vertical bars (`ClockBarVertical.vue`): inherit new tokens only, no structural rework.

**`composables/useClockBar.js` / `stores/config.js`**
- Add `displayName`, `focusLightMode`, `focusLightDimOthers` config keys with defaults and persistence, following the existing config-key pattern.

### Reused as-is (no rewrite)
- `useKeyboardActions.js` — frozen vocabulary; RegionControls/dots/taps call its existing handlers/resolvers.
- The `generic_next/prev/refresh/expand` resolvers and the per-mode handlers.
- `usePhotoFrameMode.resetInactivityTimer` + `configStore.shouldShowUI` — drive the fade/bloom.
- Cycle-A `FocusPanel` — the focus-light primitive.

## 7. Per-region control mapping

`RegionControls` maps each button to the **existing** handler for the region kind (the same functions the keyboard `generic_*` resolvers dispatch to). No new navigation logic.

| Region | ‹ prev | › next | ↻ refresh | ⤢ expand / fullscreen |
|---|---|---|---|---|
| **calendar** | `calendar_prev` | `calendar_next` | `calendar_refresh` | `calendar_expand` |
| **photos** | `images_prev` | `images_next` | — (not rendered) | `photos_enter_fullscreen` |
| **service** | `web_service_prev` | `web_service_next` | `service_refresh` | `web_service_enter_fullscreen` |

## 8. Tap & direct-manipulation rules

- **Tap a region** (background/header/chrome) → that region becomes active (`activeRegionId`); the light follows. Identical end-state to keyboard `region_next`.
- **Tap an actionable item** → focuses the region **and** performs the item action:
  - calendar event → select + open detail (`selectEvent` / `calendar_expand` path),
  - photo → fullscreen (`photos_enter_fullscreen`).
- **Tap a dialog scrim** → close the dialog via the **same** collapse handler the keyboard uses (`calendar_collapse` / `clearSelectedEvent`).
- **Fullscreen overlays** (photo / service) get a touch-visible close affordance (✕ / ⤢); keyboard exits unchanged.
- Every touch calls `resetInactivityTimer()` (already wired), keeping chrome + light alive.

## 9. Touch-chrome gating

- Touch chrome (region controls, screen dots, admin overflow, fullscreen close affordance) renders only when `isTouch` **and** the interaction window is open (`shouldShowUI`, per §4).
- On the 24" non-touch unit, `isTouch === false` → **zero** touch chrome; the dashboard is visually unchanged for the keyboard user except the focus-light's richer look.
- The **focus-light itself is NOT touch-gated** — it serves the keyboard unit too (its origin). Worst case of a wrong touch-detection is "touch buttons don't appear," never "keyboard unit breaks." A config override for touch detection can be added in Cycle C if the hardware needs it.

## 10. Testing

Vitest + `@vue/test-utils` + jsdom, matching Cycle A conventions (`tests/unit/...`, run via `npx vitest run`).

- **`RegionControls`** — per-kind button sets; each button calls the correct handler; refresh not rendered for photos; ⤢ is the primary/filled control.
- **`useTouchCapability`** — `isTouch` reflects `matchMedia` coarse vs fine and updates on change.
- **`ScreenDots`** — renders N dots, marks the active one, tap emits `select-screen`; hidden for a single screen.
- **`DialogScrim`** — backdrop tap emits `dismiss`; `blur` prop toggles the filter; reduced-motion path is instant.
- **`AdminOverflow`** — toggles open/closed; outside tap + Escape close; gear remains outside the overflow.
- **`DashboardRegion`** — tap emits `focus-region`; `FocusPanel` reflects `activeRegionId`; `focusLightMode` (`off`/`interaction`/`always`) and `focusLightDimOthers` produce the expected classes/state.
- **Clock bar** — room label shows when `displayName` set, hidden when empty; dots present; existing clock-bar tests stay green.
- **Keyboard regression (the proof)** — existing `useKeyboardActions`, mode-store, and layout tests stay green **unmodified**: evidence the vocabulary and persistence didn't move.

## 11. Risks & mitigations

- **Pi blur performance.** `backdrop-filter: blur()` is GPU-expensive on a Raspberry Pi. Mitigation: **dim is the baseline** (cheap opacity scrim); blur is an opt-in progressive enhancement on `DialogScrim` that degrades gracefully. Verify on-device during the build.
- **Touch detection reliability** in the locked-down kiosk browser. `pointer: coarse` should be correct on the 15" panel. Because the focus-light isn't gated on it, failure mode is benign (no touch buttons), never a broken keyboard unit. Optional Cycle-C config override.
- **Config-key migration.** Three new keys; defaults chosen so existing installs get a sensible resting experience (`interaction` light + dim on; empty room label). Document defaults; ensure config load tolerates their absence.
- **Replacing the highlight timer.** Removing `ACTIVE_HIGHLIGHT_MS` and its `watch`/timeout must not orphan state or break the active-region tests. The replacement reads the same `activeRegionId`; update/extend the relevant tests rather than leaving the old timer dead.

## 12. Quality floor

- `:focus-visible` preserved everywhere (the 24" is keyboard-driven).
- `prefers-reduced-motion` respected by the focus-light transition and the scrim.
- ≥44px touch targets on all new controls (46–48px default, per umbrella §4.5).
- No hardcoded hex/font in new components — tokens only (Cycle-A constraint).
- Theme contrast stays legible at a distance; the light's `--focus` is themeable.
- Narrow widths must not break.
