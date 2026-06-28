# Calvin — Cycle C3: Content Sources category

**Status:** Design approved (direction). Awaiting implementation planning.
**Date:** 2026-06-28
**Part of:** [Touch + Visual Redesign](./2026-06-28-touch-visual-redesign.md) (umbrella §7 "C — Settings").
**Builds on:** [Cycle C1](./2026-06-28-cycle-c-settings.md) (shell + Display) and [Cycle C2](./2026-06-28-cycle-c2-settings-categories.md) (Clock bar / Device / Maintenance). PR #60.
**Tracks:** `calvin-e00` (Content + Plugins migration — this spec covers **Content only**); `calvin-hbp` (restyle embedded editors later).

---

## 1. Scope

Migrate the **Content Sources** category to the C1 shell using the established eyebrow-`SettingsSection`/`SettingRow` pattern, embedding the heavy CRUD/list editors as-is. **Plugins is out of scope** — it collides with the parked `wip/plugin-repository` WIP and waits for that reconcile (still tracked by `calvin-e00`). After C3, every settings category except Plugins uses the new shell.

**Non-goals:** No change to `useConfigForm` auto-save, `settingsRegistry` search, or the keyboard vocabulary (`useKeyboardActions.js` frozen). No new config keys. No restyle of the embedded editors.

## 2. Architecture

One new component `categories/ContentSettings.vue`, mirroring the C1/C2 category components: `defineProps({ config: Object! })` + `emit("update:config", patch)`, composed of eyebrow `SettingsSection`s of `SettingRow`s. **No `onMounted`/plugin pre-load** — unlike the old `ContentSourcesCategory` wrapper (which called `loadPlugins()` on mount), the embedded `ImagesTab`/`ServicesTab` each already self-load via their own `onMounted(loadPlugins)`, so the wrapper's load is redundant and is dropped.

`Settings.vue` swaps `ContentSourcesCategory` for `ContentSettings` (same `:config`/`@update:config` wiring) and adds `content` to the section-jump map. The per-category tab machinery (`TabNavigation`/`SettingsTab`/`usePersistedSettingTab`) is dropped for Content.

**Token policy:** newly-built rows use **new semantic tokens only** (`--ink`/`--ink-*`/`--bg-*`/`--line`/`--focus`/`--ok`/`--warn`/`--err`/font-role) — no legacy tokens, no hardcoded hex/rgb. Embedded editors keep their current styling (restyle = `calvin-hbp`); they remain functional because `theme.css` still defines the legacy tokens.

## 3. Embedded editors (as-is this cycle → `calvin-hbp`)

Wrapped in a section but internals unchanged:

1. `CalendarSourcesTab` (`tabs/content/CalendarSourcesTab.vue`) — calendar-source CRUD + refresh settings (config-driven; cohesive, embedded whole like Maintenance's `UpdatesTab`).
2. `ImagesTab` (`tabs/content/ImagesTab.vue`) — image-source ordering (self-managed via `usePlugins`).
3. `ServicesTab` (`tabs/content/ServicesTab.vue`) — service-source ordering (self-managed via `usePlugins`).

## 4. Section map

Section ids are globally unique. `[embed]` marks a specialized editor.

### `ContentSettings.vue`

- **CALENDARS** (`section-content-calendars`)
  - `[embed CalendarSourcesTab]` — `:config="config"` / `@update:config="patch => emit('update:config', patch)"`.
- **PHOTOS** (`section-content-photos`) — rebuilt rows (the real migration):
  - Rotation interval — `NumberStepper` (min 5, max 3600, step 1; seconds) → `photoRotationInterval`
  - Image display mode — `SelectPill` (Smart / Fit / Fill / Crop / Center) → `imageDisplayMode`
  - Randomize image order — `ToggleSwitch` (default false via `?? false`) → `randomizeImages`
  - Photo-frame mode — `ToggleSwitch` (model `config.photoFrameEnabled || config.photoFrameMode`); on change emits **both** `photoFrameEnabled` and `photoFrameMode` (backend + UI compatibility, matching the old `handlePhotoFrameModeChange`)
    - ↳ when on (`photoFrameEnabled || photoFrameMode`): Photo-frame timeout — `NumberStepper` (min 5, max 3600, step 1; seconds) → `photoFrameTimeout`
- **IMAGE SOURCES** (`section-content-images`)
  - `[embed ImagesTab]` (no props/emits — self-managed)
- **SERVICES** (`section-content-services`)
  - `[embed ServicesTab]` (no props/emits — self-managed)

The `SelectPill` options for `imageDisplayMode`: `smart`→"Smart", `fit`→"Fit", `fill`→"Fill", `crop`→"Crop", `center`→"Center".

## 5. Search, deep-link & breadcrumb

The four `content-*` destinations already exist in `settingsRegistry` with `tab` values `calendars`/`photos`/`images`/`services`. C3 adds a `content` entry to `Settings.vue`'s `SECTION_BY_CATEGORY_TAB`:

```
content: {
  calendars: "content-calendars",
  photos: "content-photos",
  images: "content-images",
  services: "content-services",
}
```

Because `MIGRATED_CATEGORIES` is derived from `Object.keys(SECTION_BY_CATEGORY_TAB)`, adding `content` automatically switches it from the `tabKey` sessionStorage path to section-scroll (in both `onJump` and the external `?setting=` watch). Registry destination `path`/`keywords` stay. The breadcrumb scroll-spy needs no change. `useConfigForm` auto-save is preserved (rows emit `update:config` as the old tabs did).

## 6. Cleanup

- After `ContentSettings` is wired and green, delete `categories/ContentSourcesCategory.vue` and `tabs/layout/PhotosTab.vue` once a repo-wide reference check shows zero remaining importers.
- Keep `CalendarSourcesTab`, `ImagesTab`, `ServicesTab` (embedded), and the `usePlugins` composable.
- Delete/adjust any spec that imported a deleted component; preserve coverage of still-living code (mirror the C2 `ContentSourcesCategory.spec.js` lesson — if a deleted spec also asserted live behavior, migrate that assertion).

## 7. Testing

- `ContentSettings.spec.js` (modelled on the C2 category specs): the four eyebrow sections render (`#section-content-…`); a Photos row emits the correct `{key: value}` patch (e.g. `randomizeImages`); the photo-frame timeout reveal toggles with `photoFrameEnabled`; embedded editors stubbed.
- Preservation specs stay green: `settingsRegistry.spec.js`, `useConfigForm.spec.js`, `SettingsShell.spec.js` (extended to assert `content` → `ContentSettings`).
- Full suite (`npx vitest run`) + `npx eslint src` clean.
- On-device pass: rail → Content; breadcrumb scroll-spy; search jump into each section; the Photos rows; and that the embedded Calendars/Images/Services editors still function.

## 8. Deferred

- `calvin-e00` remains open for **Plugins** (after `wip/plugin-repository` reconcile).
- `calvin-hbp` gains three embeds (`CalendarSourcesTab`, `ImagesTab`, `ServicesTab`).
