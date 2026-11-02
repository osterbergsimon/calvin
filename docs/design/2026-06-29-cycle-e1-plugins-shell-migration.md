# Calvin — Cycle E1: Plugins settings category → new shell

**Status:** Design approved. Awaiting implementation planning.
**Date:** 2026-06-29
**Bead:** `calvin-e00` (Cycle 1 of 2). Cycle 2 = the salvaged repository browse/install feature (tag `salvage/plugin-repository`), deferred to its own spec.
**Builds on:** C1 shell + tokens, C2/C3 category migrations, calvin-hbp embedded-editor restyle. Branch `feat/design-settings-cycle-c`.
**Out of scope (own cycle, `calvin-4zj`):** settings-shell sticky chrome + breadcrumb discoverability/behavior. Not touched here.

---

## 1. Goal & scope

Bring the **Plugins** settings category onto the new shell so it matches Content/Device/Maintenance — the last category still wearing legacy dark styling inside the white shell. **Frontend-only, behavior-preserving.** No backend changes, no new behavior. The repository browse/install feature is explicitly a separate later cycle.

Two kinds of change, mirroring C2/C3 (category migration) + calvin-hbp (embedded-editor restyle):

1. **Category shell** — rebuild `PluginsCategory.vue`'s wrapper from two `CollapsibleSection`s into two `SettingsSection` eyebrows, and tokenize its own legacy colors. All data wiring, handlers, props, and modals stay byte-for-byte identical.
2. **Embedded-editor restyle** — token + surface swap (calvin-hbp depth) across the 5 specialized editors. Structure/behavior preserved.

**Non-goals:** No behavior change, no structural rebuild of the editors into `SettingRow`s, no row-conversion of installer fields. No change to `useConfigForm`, `settingsRegistry` search semantics, `PluginFieldRenderer`/`instance_config_schema` forms, or any backend route. No breadcrumb or sticky-shell work (→ `calvin-4zj`).

## 2. Targets

| File | lines | legacy tokens | hex/rgb | role |
|---|---|---|---|---|
| `frontend/src/components/settings/categories/PluginsCategory.vue` | 699 | 15 | 7 | category shell + orchestration (shell rebuild + tokenize) |
| `frontend/src/components/settings/specialized/PluginInstaller.vue` | 1177 | 36 | 45 | install (zip/github/local) UI — heaviest restyle |
| `frontend/src/components/settings/specialized/InstanceModal.vue` | 782 | 20 | 29 | per-instance editor modal |
| `frontend/src/components/settings/specialized/PluginCard.vue` | 523 | 12 | 17 | one plugin row (expand, config, actions) |
| `frontend/src/components/settings/specialized/PluginInstances.vue` | 362 | 16 | 6 | instance list under a plugin |
| `frontend/src/components/settings/specialized/PluginManager.vue` | 314 | 5 | 0 | installed-plugins list + type tabs |
| `frontend/src/views/Settings.vue` | — | — | — | add `plugins` to `SECTION_BY_CATEGORY_TAB` (search/deep-link only) |

`ConfirmModal` (uninstall) and `CollapsibleSection` are already on new tokens (restyled in calvin-hbp) — not re-touched.

## 3. Token mapping (canonical — reused from calvin-hbp R1 §3)

| Legacy | New | Use |
|---|---|---|
| `--text-primary` | `--ink` | primary text |
| `--text-secondary` | `--ink-2` | secondary/muted text, labels |
| `--text-tertiary` | `--ink-3` | faint text, hints |
| `--bg-primary` | `--bg-1` | the editor's own panel/base surface |
| `--bg-secondary` | `--bg-2` | nested cards, inset rows, inputs |
| `--bg-tertiary` | `--bg-2` | hover/active fills |
| `--border-color` | `--line` | borders, dividers (`--line-soft` for subtle inner separators) |
| `--accent-primary` | `--focus` | accents, active states (e.g. the type-tab underline), focus rings |
| `--shadow` | `--shadow` | unchanged |
| hardcoded hex/rgb | nearest semantic token | status → `--ok`/`--warn`/`--err`; surface → `--bg-*`; text → `--ink*`; scrims → `color-mix(in srgb, var(--ink) N%, transparent)` |

After the swap, **no** legacy token and **no** hardcoded hex/rgb may remain in a restyled file — **except data-driven colors** (see §4).

## 4. Surface & layout conventions (canonical — reused from calvin-hbp R1 §4)

The editors render inside `SettingsSection` panels (`--bg-1`, `--line` border, 16px radius). To belong there:

- Editor outer wrappers are transparent / `--bg-1` (blend with the panel) — no competing nested panel border unless it genuinely groups.
- Nested cards / list items / inputs use `--bg-2` fills with `--line` (or `--line-soft`) borders.
- Buttons adopt the shell vocabulary: `min-height: 44px`, `--bg-2` ground, `--line` border, `border-color: var(--focus)` on hover, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. Primary/destructive actions may fill `--focus`/`--err` (e.g. the blue "Choose Zip File" CTA → `--focus`; uninstall/delete → `--err`).
- Inputs (text/number/select/file/url): `--bg-2` ground, `--line` border, `--ink` text, `--focus` focus ring; ≥44px touch height where practical.
- Typography: `--font-ui` for labels/controls, `--font-data` for version strings / IDs / numeric values.
- The plugin-type tabs (Calendar/Image/Service/Backend/Theme) inside the Installed list keep their structure; the active blue underline/accent → `--focus`.
- Respect `prefers-reduced-motion`; keep existing transitions, only tokenize their colors.

**Data-driven colors are preserved, NOT tokenized** (same rule as C3 calendar source colors): any color that originates from plugin/theme metadata or represents plugin-supplied data (status dots derived from a plugin's own state, theme preview swatches, plugin-type accent colors that come from the plugin) stays as-is. Only **UI chrome** hex is tokenized. When ambiguous, treat a color as data if it varies per plugin/instance, as chrome if it's fixed UI furniture.

## 5. Section structure (IA)

`PluginsCategory.vue` template becomes:

```
<SettingsSection id="install" title="Install">
  <PluginInstaller ... />            <!-- unchanged props/emits -->
</SettingsSection>

<SettingsSection id="installed" title="Installed Plugins">
  <PluginManager ... />              <!-- unchanged props/emits -->
</SettingsSection>

<InstanceModal ... />                <!-- overlay, restyled -->
<ConfirmModal ... />                 <!-- overlay, already new-token -->
```

- Section ids: `install`, `installed` → rendered as `section-install`, `section-installed` by `SettingsSection`.
- The two top-level areas become always-visible eyebrow sections (matching the rest of the shell). Per-plugin expand/collapse already lives **inside** `PluginManager`/`PluginCard` (`expandedPlugins`), so collapsibility stays at the right granularity and is unaffected.
- The emoji icons (📦/🔌) from the old `CollapsibleSection` headers are dropped; the eyebrow label carries the section name, consistent with C2/C3 (which use plain uppercase eyebrows, no icons).

## 6. Settings.vue wiring (search / deep-link only)

Add a `plugins` entry to `SECTION_BY_CATEGORY_TAB`:

```js
plugins: {
  install: "install",
  installed: "installed",
},
```

**What this actually buys us:** it makes `plugins` a member of `MIGRATED_CATEGORIES`. The existing `settingsRegistry` `plugins` row carries **no `tab`** (and no `tabKey`), so a jump to it sets `activeCategory = 'plugins'` and lands at the top of the category — which is correct (Install is the first section). The `install`/`installed` sub-entries are dormant until a destination carries one of those `tab` values; they exist so section-anchored behavior resolves cleanly. Concrete effects this cycle:

- `plugins` joins `MIGRATED_CATEGORIES`, so the onJump / initial-load paths skip the legacy `tabKey` sessionStorage fallback for it (a no-op for the current tab-less entry, but the correct migrated-category contract).
- It readies Plugins for the `calvin-4zj` scroll-spy un-gate (which keys off `MIGRATED_CATEGORIES`) — once that lands, Plugins gets section breadcrumbs for free because it now uses `SettingsSection`.

The `settingsRegistry` entry itself is **unchanged** (no new search rows). Splitting it into section-anchored rows (e.g. "Install a plugin" → `install`) is a possible follow-up, explicitly **out of scope** here to keep search behavior stable.

**Not in scope here:** the breadcrumb scroll-spy is still hardcoded `dashboard`-only after this cycle — that un-gate is `calvin-4zj`. Once `calvin-4zj` lands, Plugins gets section breadcrumbs for free because it now uses `SettingsSection` (which emits `.settings-section` + `.settings-section__eyebrow`).

## 7. Behavior preservation

Pure restyle + shell-wrapper swap. No change to:

- Props/emits between `PluginsCategory` and every child editor (the full handler set: install/list/zip/force-update/restart, toggle-enabled/uninstall, save-config/test-connection/fetch-now/custom-action, add/edit/delete/toggle/order instances, image upload/delete).
- `PluginFieldRenderer` and `instance_config_schema`-driven config forms (the per-plugin settings UI auto-generated from schema).
- `useConfigForm` auto-save, `configStore`/`webServices`/`images` store usage.
- `settingsRegistry` search rows and keywords.
- Modal open/close/save flows (`InstanceModal`, uninstall `ConfirmModal`).

The only template change permitted beyond styling is the `CollapsibleSection` → `SettingsSection` wrapper swap in `PluginsCategory.vue` and the `Settings.vue` map addition. Child editors change CSS/token values only (and at most class-name swaps), never template logic.

## 8. Testing

- Existing specs stay green: `PluginManager.spec.js`, `PluginInstanceToggle.spec.js`, and anything under `frontend/tests/unit/components/plugins/`. The diff is style + wrapper-swap, so behavior tests are unaffected.
- **No new behavior tests** — nothing behavioral changes (the breadcrumb behavior change lives in `calvin-4zj`, with its own test).
- Per-file verification gate:
  ```bash
  cd frontend
  grep -nE '\-\-(accent-primary|text-primary|text-secondary|text-tertiary|bg-primary|bg-secondary|bg-tertiary|border-color)|#[0-9a-fA-F]{3,8}\b|rgba?\(' <file>
  ```
  Expected: only data-driven colors remain (each must be justified in the task report as plugin/theme data); zero chrome legacy tokens/hex. `--shadow` is allowed.
- Full suite `npx vitest run` green (same count as before); `npx eslint src` 0/0.
- **On-device is the real gate:** open Settings → Plugins. Both sections (Install, Installed Plugins) read as light shell (`--bg-1` panels, `--line` borders, `--focus` accents) with no dark legacy blocks; the type tabs, plugin cards, instance lists, install flow, and the instance modal all render light; toggles/expand/install/test/uninstall still work; the per-plugin schema config forms still render and save. Toggle light/dark theme to confirm tokens resolve in both.

## 9. Decomposition (for the plan)

1. `PluginsCategory.vue` shell rebuild (CollapsibleSection→SettingsSection) + tokenize its 15/7 + `Settings.vue` `SECTION_BY_CATEGORY_TAB` plugins entry — one task (coupled).
2. `PluginInstaller.vue` restyle (heaviest: 1177 lines / 36 legacy / 45 hex).
3. `InstanceModal.vue` restyle (782 / 20 / 29).
4. `PluginCard.vue` restyle (523 / 12 / 17).
5. `PluginInstances.vue` restyle (362 / 16 / 6).
6. `PluginManager.vue` restyle (314 / 5 / 0) — includes the type-tab accent.

Tasks 2–6 are independent (different files); each its own commit, verified by grep + suite + lint. Task 1 first (establishes the shell the editors render into).

## 10. Deferred

- **Cycle 2 — repository browse/install feature** (`calvin-e00` carries the salvage plan; tag `salvage/plugin-repository`): new `repository.py` endpoints, the `github.py` DRY refactor (extract `_download_and_extract_github_repo`/`_resolve_repo_url_to_path`/`_enrich_with_installed_status`/`_cleanup_repo_temp`), no-restart install (`load_plugin_types_for_single`), `pluginRepositoryUrl` config, browse UI, port `test_plugin_repository.py`. Re-implement fresh on current develop; do **not** merge the WIP branch. Its own spec.
- **`calvin-4zj`** — settings-shell sticky chrome + breadcrumb discoverability/behavior + scroll-spy un-gate. Its own spec.
