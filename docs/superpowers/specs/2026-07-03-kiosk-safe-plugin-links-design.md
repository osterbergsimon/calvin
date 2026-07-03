# Kiosk-safe plugin links — design

**Date:** 2026-07-03
**Status:** Approved (brainstorming) — ready for implementation plan
**Area:** frontend plugin renderers + per-region view options (fits plugin contract 1.0, no contract change, no backend change)
**Beads:** closes `calvin-1nl` (the design decision it asks for); first consumer of `calvin-39g` (wire `RegionViewOptions` into service regions).

## Problem

Plugin display renderers surface clickable links that navigate the browser **away from the dashboard**. Today only two built-in renderers emit them — `card-grid` and `item-list` — both via a per-item `click_url_path` that fires `window.open(url, "_blank")`. The reference case is the **mealie** plugin: each meal card links to a recipe page on the user's Mealie host.

Calvin's primary target is a **wall-mounted Raspberry Pi with a touchscreen**. A tap on such a card fires `window.open` and strands the display on an off-dashboard page (often login-walled, no browser chrome), with no easy way back. This is an operational failure, not an aesthetic one.

But links have real value: a recipe is something you actually want to *read on your phone while cooking*. The goal is to preserve that value without ever stranding the wall.

## Framing

On a wall display, a link is better understood as **"hand this to a personal device"** than **"navigate the wall."** The wall is an index/launcher; your phone is the reader. This reframing makes a QR-based handoff the natural default rather than a compromise.

**Key architectural decision: a tapped link never navigates the wall directly.** It always opens a **dismissable on-dashboard overlay**. Navigation, if it happens at all, is an *explicit second action* (an "Open ↗" button inside the overlay), never an accidental card tap. This defuses the trap **by construction** — no runtime "am I a kiosk?" detection is required.

### Why no kiosk/interactive mode branching

An earlier draft branched behavior on kiosk-vs-interactive. That was dropped. Calvin has no real "kiosk mode" today — `showUI` is a "hide chrome sometimes" flag, not a mode, and a proper navigable kiosk mode (selective chrome, screen navigation) is a **separate future discussion**. So link behavior is **mode-independent**: it is intrinsic to the link and its config, identical in every environment. The overlay is graceful everywhere (scan on the wall, click "Open" on a desktop), so no environment-specific logic is needed.

## Goals

- A tapped plugin link can **never** accidentally strand the display.
- Preserve link value via a QR **handoff** overlay (scan → open on your phone).
- Let a plugin **hint** its default link action; let the user **override** it per region via the existing tune-popover mechanism.
- Fit **plugin contract 1.0** with **no contract or validation change** for the plugin-authored part.
- Keep plugins self-contained — a plugin declares *what a link is*, never *what the host does about it*.

## Non-goals (explicitly out of scope)

- **True kiosk mode** (navigable screens + selective chrome). Separate future work; this design does not depend on or introduce it.
- **Web-component self-navigation.** A `web-component` plugin runs arbitrary JS and can call `window.location`/`window.open`, bypassing every host guard. We **document a contract rule** ("route links through the host bridge; do not self-navigate") but do not sandbox it here.
- **Global kill-switch knob.** Safe-by-default + per-region `off` covers the need; a global knob can be added later if a real case appears.
- **iframe `embed` in interactive contexts as a distinct behavior.** Behavior is mode-independent; `embed` always means the iframe overlay.

## The model

### Resolved action (per link, always)

```
per-region override  →  plugin hint  →  default ("handoff")
   (region.view.linkAction)   (item.link_action)     ("handoff")
```

Actions:

| Action | Behavior |
|---|---|
| `handoff` (default) | Open the **HandoffOverlay**: destination title + host, a QR code, and an **"Open ↗"** button. |
| `embed` | Open the **EmbedOverlay**: an iframe of the destination. On load failure/timeout → fall back to the HandoffOverlay. |
| `off` (override-only) | The item is **not clickable**. No overlay, no navigation. Item content still renders. |

- **Default when nothing is set anywhere → `handoff`.** So every existing plugin (mealie included, which ships no hint) is automatically safe.
- The **"Open ↗"** button performs the actual `window.open`. On the wall you'd scan the QR instead; on a desktop you click Open. Navigation is thus always a deliberate two-step action. A future true-kiosk mode may choose to hide this button.

### 1. Plugin hint — `item.link_action` (no contract change)

Plugins may add an optional `link_action` to the `item` spec of a `card-grid`/`item-list` display schema, alongside the existing `click_url_path`:

```python
"item": {
    "label_path": "$.type",
    "value_path": "$.name",
    "click_url_path": "$.url",
    "link_action": "handoff",   # or "embed"; optional
}
```

**This requires no contract or validation change.** Confirmed against `backend/app/plugins/definitions.py`: `_validate_schema_kind` only checks `kind` presence + whitelist, `panel_variant`, and absence of retired legacy keys. It does **not** whitelist keys and does **not** recurse into `item`. `display_schema` is typed `dict[str, Any]` (extra keys pass through untouched to the frontend). We only teach the renderers (via the composable below) to read `item.link_action`. Constraint: `link_action` must not collide with a retired legacy key name in `_LEGACY_DISPLAY_KEYS`.

Plugin authors would not hint `"off"` (there is no reason to ship a dead link); `off` exists only as a user override.

### 2. `useLinkOpen()` composable + renderer refactor

Extract the duplicated `open()` helper in `CardGrid.vue` and `ItemList.vue` into a single composable `useLinkOpen()` (frontend). It:

1. Resolves the URL (existing `click_url_path` logic).
2. Resolves the action: `regionLinkAction ?? item.link_action ?? "handoff"`, where `regionLinkAction` is the per-region override (§4) threaded in as a prop.
3. Dispatches: `handoff` → open HandoffOverlay; `embed` → open EmbedOverlay; `off` → render as non-clickable (no handler, no `--clickable` affordance).

`CardGrid.vue` and `ItemList.vue` call the composable instead of their own `window.open`. Every current and future link-emitting built-in renderer inherits the behavior for free. The `IframeRenderer` error-fallback anchor is also routed through the composable for consistency.

The override value reaches the renderers by prop-threading through the existing region chain: `DashboardRegion` → `WebServiceViewer` → `ServiceViewer` → `SchemaRenderer` → `CardGrid`/`ItemList`. `SchemaRenderer` currently forwards only `schema`/`data`/`pluginId`/`context`; we add one prop (`linkAction`) alongside `pluginId`. Renderers keep their pure `schema`+`data`(+`linkAction`) contract — no store coupling — which preserves testability and the dev `RendererGallery`.

### 3. Overlays

Both overlays are dismissable (tap-anywhere / close button / idle auto-dismiss). The touchscreen makes dismissal reliable.

- **HandoffOverlay** — on-dashboard modal showing destination **title + host**, a **QR code**, and an **"Open ↗"** button. QR is generated **client-side** (small `qrcode` npm dep) — no backend endpoint needed. Uses the `calvin-plugin-*` body classes / Calvin surface styling.
- **EmbedOverlay** — modal hosting an **iframe** of the destination, reusing the existing `IframeViewer` infrastructure, with a close button. On iframe load failure or a timeout (many targets set `X-Frame-Options`/CSP `frame-ancestors` and will not embed), it **falls back to the HandoffOverlay** ("couldn't embed — scan or open"). This covers a plugin author (or user) choosing `embed` for a destination that refuses framing.

### 4. Per-region override (a service-region tune option — the `calvin-39g` mechanism)

The override is a **per-region view option**, set live from a tune popover on the dashboard, following the calendar's per-region week-number/event-density precedent (`calvin-g9p`) exactly. It is **not** a plugin-config field and **not** host-injected instance plumbing — an earlier draft proposed that; it's dropped in favor of the established region mechanism the user pointed at.

**Storage — `region.view.linkAction`.** Per-region overrides already live in the layout tree's `region.view` block (`frontend/src/utils/layout.js`), persisted transparently inside `dashboardScreens` (the whole `screens` tree round-trips as an opaque dict via `config.py`; **no backend change**). Today `layout.js` attaches a `view` block only for `kind === "calendar"` (`calendarViewFor`) and `setRegionView` is guarded by `region.kind === "calendar"`. We add a minimal service view:

- `clampServiceView(view)` — validate-or-omit, mirroring `clampCalendarView`. It keeps `linkAction` only when it's one of `"handoff" | "embed" | "off"`; **absent = inherit** (fall through to the plugin hint). No other keys.
- `serviceViewFor(region)` — attaches `view` for `kind === "service"` in `normalizeDashboardLayout` / split normalization.
- Un-guard `setRegionView` so a `service` region routes its patch through `clampServiceView` (branch on `region.kind`).

**Write — the existing store action, unchanged.** `configStore.updateRegionView(regionId, patch)` (`config.js`) already writes any region patch and persists via `updateConfig`. Passing `{ linkAction: undefined }` clears the override → inherit (same convention as `weekNumbers`/`maxVisibleEvents`).

**UI — `ServiceRegionViewOptions.vue` (new), copying `CalendarViewOptions.vue`.** Props `regionId` + `view`. Wraps `RegionViewOptions` (the generic tune trigger + popover shell). Exposes one control — **Link behavior**, a segmented Default / QR handoff / Open in-app / Off (`Default` = clear override = inherit the plugin hint). Reads `props.view?.linkAction`; on change calls `updateRegionView(regionId, { linkAction })` (or `undefined` for Default). Mounted in `WebServiceViewer.vue`'s `#actions` slot alongside `RegionControls` (mirroring how `CalendarViewOptions` sits in the calendar header). **Rendered only when the service's `display_schema.kind` is link-capable** (`card-grid`/`item-list`) — otherwise the tune option is irrelevant and hidden.

**Read-back.** `DashboardRegion` already has `region.view`; it passes `:link-action="region.view?.linkAction"` (and `:region-id` / `:view`) into `WebServiceViewer` → `ServiceViewer` → `SchemaRenderer` → renderers. `useLinkOpen()` treats a missing value as "fall through to the plugin hint."

**mealie** needs no change: with no override and no hint it defaults to `handoff`; a user sets a specific Mealie region to **Open in-app** (`embed`) purely by tapping its tune icon and choosing it.

## Affected files

**Frontend (calvin repo) — all changes; no backend changes:**

*Link rendering / overlays:*
- `frontend/src/composables/useLinkOpen.js` — **new**: URL + action resolution (`regionLinkAction ?? item.link_action ?? "handoff"`) + dispatch to overlays.
- `frontend/src/components/plugins/overlays/HandoffOverlay.vue` — **new**: title/host + client-side QR + "Open ↗".
- `frontend/src/components/plugins/overlays/EmbedOverlay.vue` — **new**: reuses `IframeViewer`, falls back to Handoff on load failure/timeout.
- `frontend/src/components/plugins/renderers/CardGrid.vue` — declare `linkAction` prop; use `useLinkOpen()`; honor `off` (non-clickable). Item spec is at `schema.card.item`.
- `frontend/src/components/plugins/renderers/ItemList.vue` — same; item spec is at `schema.item`.
- `frontend/src/components/plugins/renderers/IframeRenderer.vue` — route error-fallback anchor through the composable.
- `frontend/src/components/plugins/SchemaRenderer.vue` — forward a new `:link-action` prop to the renderer (alongside `pluginId`).

*Per-region override (the `calvin-39g` mechanism):*
- `frontend/src/utils/layout.js` — add `clampServiceView` + `serviceViewFor`; branch `setRegionView` on `region.kind` so `service` regions accept `{ linkAction }` patches.
- `frontend/src/components/dashboard/ServiceRegionViewOptions.vue` — **new** (copy `CalendarViewOptions.vue` shape): props `regionId` + `view`, wraps `RegionViewOptions`, one "Link behavior" control, persists via `updateRegionView`.
- `frontend/src/components/WebServiceViewer.vue` — mount `ServiceRegionViewOptions` in `#actions` (only for link-capable `display_schema.kind`); accept + forward `region-id`/`view`/`link-action`.
- `frontend/src/components/service/ServiceViewer.vue` — forward resolved `link-action` into `SchemaRenderer`.
- `frontend/src/components/DashboardRegion.vue` — pass `:region-id`, `:view="region.view"`, `:link-action="region.view?.linkAction"` into `WebServiceViewer` (both the main and split branches).

*Dependency:*
- `frontend/package.json` — add `qrcode`.

**Plugins (calvin-plugins repo) — optional, not required for correctness:**
- `mealie/plugin.py` — optionally add `item.link_action` hint (recipes default to `handoff` anyway; only needed if the plugin's preferred default differs).

**Docs:**
- Plugin frontend docs — document `item.link_action` and the web-component "do not self-navigate; route links through the host bridge" contract rule.

## Testing

- **Composable unit tests:** action resolution precedence (`regionLinkAction > item.link_action > "handoff"`), URL resolution, `off` → non-clickable.
- **`clampServiceView` unit tests:** keeps a valid `linkAction`, drops an invalid one, drops when absent (inherit). `setRegionView` applies a `linkAction` patch to a `service` region and leaves calendar regions unchanged.
- **Renderer tests:** `CardGrid`/`ItemList` open the correct overlay per resolved action; `off` renders no click handler/affordance; a `linkAction` prop overrides the item hint.
- **HandoffOverlay:** renders QR for a URL, shows title/host, "Open ↗" triggers `window.open`, dismiss paths (tap-out / close / idle) work.
- **EmbedOverlay:** renders iframe; simulated load failure/timeout falls back to HandoffOverlay.
- **`ServiceRegionViewOptions`:** renders only for link-capable kinds; reads `view.linkAction`; selecting an option calls `updateRegionView(regionId, { linkAction })`; Default calls it with `undefined`.
- **Regression:** mealie (no hint, no override) → HandoffOverlay by default; nothing navigates on a card tap.

## Open questions / future

- **True kiosk mode** (navigable screens, selective chrome, possibly hiding the "Open ↗" button) — separate future design; this work is forward-compatible with it.
- **Web-component sandboxing** to actually enforce "no self-navigation" — later, if untrusted plugins become a concern.
- **Global default / house-policy knob** — add only if a real need appears.
- **`embed` in a pointer environment** — currently identical everywhere; revisit if desktop users want click-through-to-navigate instead of an embedded frame.
