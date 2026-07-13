# Kiosks content-assignment editor — design

- **Date:** 2026-07-13
- **Status:** Approved (brainstorm), pending implementation plan
- **Issue:** epic `calvin-dd9` (the content-assignment UI follow-on named in dd9.11's design)
- **Base branch:** `develop` (this design lives on `feature/kiosks-content-assignment-ui`)
- **Builds on:** dd9.3 (`GET/PUT /api/kiosks/{id}/overrides`), dd9.4 (per-kiosk `availableScreens`/`defaultScreenId`
  accepted + merged server-side), dd9.11 (the Kiosks settings view + orientation editor this extends).

## Problem

dd9.4 landed the backend for per-kiosk content assignment (`availableScreens` allowlist + `defaultScreenId`
boot screen), and the frontend already *consumes* it (`filterAvailableScreens` / `resolveKioskActiveScreen`
in `utils/layout.js`, and `effectiveDashboardScreens` in the config store). But there is no way to *author*
it — an operator can only set these fields with `curl`. This slice adds the authoring UI: a **Content**
editor in the existing Kiosks settings view that lets an operator choose which dashboard screens a selected
kiosk may show and which one it boots into. It is the content-assignment follow-on that dd9.11's design
listed as "the next UI slice."

## Design principle

Extend the existing Kiosks view (dd9.11) and its established editing model — **effective value + Reset**,
per-control inherited/set tags, read-modify-write save, honest async copy — rather than inventing a new
pattern. Reuse the shell (`SettingsSection`/`SettingRow`) and the existing input components
(`ChipMultiSelect`, `SelectPill`). No new palette, no new store surface.

The one substantive stance (operator decision, approved): **the UI enforces the consistency the backend
does not.** The server does type-only validation — it will store an empty `availableScreens` (which the
kiosk then fails *open* on, showing all screens) and a `defaultScreenId` that is not in `availableScreens`
(which the kiosk silently skips). Rather than surface those confusing states, the editor prevents them.

## Components / files

| Unit | Path | Responsibility |
|---|---|---|
| Content editor | `frontend/src/components/settings/categories/KiosksSettings.vue` (modify) | add a third `SettingsSection` — the per-kiosk content editor — plus its script logic |
| Tests | `frontend/tests/unit/components/KiosksSettings.spec.js` (modify) | content-editor behavior |

No store change: `useKiosksStore().fetchOverrides` / `saveOverrides` already carry arbitrary override keys,
and `useConfigStore()` already exposes `dashboardScreens`.

## Locked contract (from the backend + config store — verified in develop)

- Wire keys (camelCase, per-kiosk overrides only): `availableScreens: string[] | absent`,
  `defaultScreenId: string | absent`.
- `PUT /api/kiosks/{id}/overrides` **replaces** the whole override layer (body `{ overrides }`); so a save
  must send the full merged object to preserve unrelated keys (e.g. the orientation keys).
- Backend validation is **type-only**: `availableScreens` must be a list; `defaultScreenId` must be a
  string. No membership/existence checks. (Guaranteed by `test_overrides_rejects_bad_available_screens_type`
  and `test_overrides_accepts_content_assignment`.)
- Screens catalog: `config.dashboardScreens = { version, activeScreenId, screens: [{ id, name, layout, … }] }`.
  A screen is identified by `id`; `name` is its display label. Global default screen = `activeScreenId`.
- Client resolution is fail-open (`utils/layout.js`): empty/unknown `availableScreens` → all screens; a
  `defaultScreenId` outside the available set is ignored. The editor keeps overrides consistent so these
  fallbacks never have to fire from operator-authored data.

## The Content editor (selected kiosk)

A third `SettingsSection`, `id="kiosks-content"`, title `` `${selectedId} — Content` ``, rendered under the
Orientation section when `selectedId` is set.

### Catalog + degenerate state

- Screen options are built from `config.dashboardScreens.screens` as `[{ value: id, label: name }]`, in
  catalog order.
- **If the catalog has fewer than 2 screens**, render a hint in place of the controls:
  *"Add more screens in Display → Screens & regions to assign different content per kiosk."* With one screen,
  per-kiosk content assignment is meaningless; do not show controls that can only produce the inherited state.

### Control 1 — Screens shown (`ChipMultiSelect`)

- **Effective value** = `overrides.availableScreens` if the key is present, else **all** catalog screen ids
  (inherited = all screens shown, matching the backend fail-open).
- **Tag** (`SettingRow` `description`): `‹inherited from global›` when the key is absent, `‹set for this
  kiosk›` when present.
- **Guardrail — never empty:** the operator cannot deselect the last screen. If an emitted selection is
  empty, reject it and show the hint *"Pick at least one screen, or Reset to show all."* (do not save).
- **Normalization — all == inherited:** if the emitted selection contains **every** catalog screen id, treat
  it as inherited: remove the `availableScreens` key from the layer (and re-evaluate the default guardrail
  below). This keeps overrides sparse and flips the tag back to `‹inherited from global›`, honestly telling
  the operator "this kiosk shows the same screens as global."
- **Otherwise:** store the selected subset as `availableScreens`.

### Control 2 — Default screen (`SelectPill`)

- **Options** = the currently-effective available set only (the subset from Control 1, or all screens when
  inherited) — so the operator can never pick a default outside the available set.
- **Effective value** = `overrides.defaultScreenId` if present, else `config.dashboardScreens.activeScreenId`
  (the global default).
- **Tag:** inherited vs set, as above.
- **On change:** store the chosen id as `defaultScreenId` (merged into the layer).

### Cross-control guardrail — default must stay in the available set

When a change to **Screens shown** removes the screen that is the current *effective* default,
`defaultScreenId` is dropped from the layer in the **same save** (reverts to inherited). This makes it
impossible to persist a `defaultScreenId` outside `availableScreens`. If the global `activeScreenId` itself
is not in a newly-restricted available set, the default simply shows as inherited and the kiosk's client
resolver falls to "first available" — no override is stored for it.

### Save + Reset

- **Save** is read-modify-write: compute the next override layer from the current `overrides.value` plus the
  changed content key(s) (applying the normalization + guardrails above), then `saveOverrides(selectedId,
  next)`. The full merged layer is sent, so orientation keys and any other unrelated keys survive.
- **Reset content to global:** a secondary action that removes `CONTENT_KEYS = ["availableScreens",
  "defaultScreenId"]` from the layer and saves. **Disabled** when neither key is currently overridden.
  (Separate from the orientation section's "Reset to global"; each editor resets only its own keys.)

### Honest async copy

Content is server-side config (not device-physical), applied when the kiosk next fetches its config:

- after save (online kiosk): *"Saved. This kiosk picks up content changes at its next check-in (~30s)."*
- after save (offline kiosk): *"Saved. Changes apply when this kiosk reconnects."*
- on save failure: *"Couldn't save to the server. Check the connection and try again."* (keep the edited
  values visible; do not silently drop the edit) — same wording as the orientation editor.

The Content section has its **own** `role="status"` `aria-live="polite"` status line, backed by a separate
ref (e.g. `contentMsg`) — distinct from the orientation editor's `savedMsg` — so a content save announces
under the Content controls, not under Orientation. Selecting a different kiosk clears it (as `select()`
already clears `savedMsg`).

## Data flow

```
select kiosk → fetchOverrides(id) → editor shows effective content:
    availableScreens ?? all screen ids   |   defaultScreenId ?? global activeScreenId
change "Screens shown" →
    empty?        → reject + hint, no save
    all selected? → drop availableScreens (inherited); if default now inherited-consistent, leave it
    subset        → set availableScreens; if effective default not in subset, drop defaultScreenId
  → read-modify-write → saveOverrides(id, merged) → "Saved…" copy
change "Default screen" → set defaultScreenId (option list already limited to available) → save
Reset content to global → drop CONTENT_KEYS → save → controls show ‹inherited from global›
(kiosk client, utils/layout.js, applies the allowlist + default on its next config fetch)
```

## Error handling

- `saveOverrides` failure → keep the editor's edited values, show the failure copy above; do not revert the
  control or silently drop the edit.
- Missing/empty catalog (`dashboardScreens` absent or `screens` empty/one) → the degenerate-state hint; no
  controls, no save path.
- A kiosk whose stored `availableScreens`/`defaultScreenId` reference ids no longer in the catalog: the
  effective value computeds intersect against the current catalog for display, so stale ids are shown as
  deselected/ignored; the next save writes back a catalog-consistent layer. (Read tolerates stale data; the
  UI never *authors* an inconsistent layer.)

## Testing strategy

Mirror `KiosksSettings.spec.js`'s harness (`selectFirst` helper: stub `loadKiosks`/`fetchOverrides`/
`saveOverrides`, seed `useConfigStore()`, emit a child component's `update:modelValue` via
`findComponent(...).vm.$emit`, assert on `saveOverrides.toHaveBeenCalledWith`). Seed the config store with a
≥2-screen `dashboardScreens` catalog. Cover:

- **Effective over inherited:** with no content override, "Screens shown" shows all catalog ids selected and
  the tag reads inherited; "Default screen" shows the global `activeScreenId`, tag inherited.
- **Set a subset:** emitting a subset from `ChipMultiSelect` saves `availableScreens: [subset]` merged with a
  pre-existing unrelated key (e.g. `orientation`) preserved; tag flips to set.
- **Select-all normalizes to inherited:** emitting all ids removes `availableScreens` from the saved layer.
- **Can't-empty guardrail:** emitting `[]` does not call `saveOverrides` and shows the "pick at least one"
  hint.
- **Default limited to available:** the `SelectPill` options equal the effective available set (not the full
  catalog) when a subset is set.
- **Auto-drop default:** with `defaultScreenId` set to a screen, emitting a "Screens shown" subset that
  excludes it saves a layer without `defaultScreenId`.
- **Set default:** emitting from `SelectPill` saves `defaultScreenId` merged, preserving unrelated keys.
- **Reset content:** removes only `CONTENT_KEYS` (leaves orientation keys), and the button is disabled when
  no content override exists.
- **Degenerate state:** with a single-screen catalog, the hint renders and the controls do not.
- **Honest copy:** online vs offline post-save wording; failure wording on a rejected `saveOverrides`.

All new tests via Vitest; the view uses already-tested shell/input components.

## Non-goals (follow-ons)

- **Per-screen content *editing*** (regions, sources, layout) — that stays in Display → Screens & regions;
  this editor only *assigns* existing global screens to kiosks.
- **Confirmed apply-status** for content (a kiosk reporting it has picked up the new content set) — same
  deferred confirmation loop as the orientation apply-status; out of scope here.
- **Per-kiosk screen *ordering*** (a kiosk showing the allowed screens in a custom order) — the allowlist is
  a set; order follows the global catalog. File as a follow-on if wanted.
- **Backend membership/existence validation** — the UI guarantees consistency for authored data; hardening
  the API against arbitrary `curl` payloads is a separate backend concern.

## Open questions

None blocking. The select-all-normalizes-to-inherited behavior and the auto-drop-default guardrail were
explicitly approved in brainstorming.
