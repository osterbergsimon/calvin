# Kiosk-safe plugin links — design

**Date:** 2026-07-03
**Status:** Approved (brainstorming) — ready for implementation plan
**Area:** frontend plugin renderers + plugin instance config (fits plugin contract 1.0, no contract change)

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
- Let a plugin **hint** its default link action; let the user **override** it per instance.
- Fit **plugin contract 1.0** with **no contract or validation change** for the plugin-authored part.
- Keep plugins self-contained — a plugin declares *what a link is*, never *what the host does about it*.

## Non-goals (explicitly out of scope)

- **True kiosk mode** (navigable screens + selective chrome). Separate future work; this design does not depend on or introduce it.
- **Web-component self-navigation.** A `web-component` plugin runs arbitrary JS and can call `window.location`/`window.open`, bypassing every host guard. We **document a contract rule** ("route links through the host bridge; do not self-navigate") but do not sandbox it here.
- **Global kill-switch knob.** Safe-by-default + per-instance `off` covers the need; a global knob can be added later if a real case appears.
- **iframe `embed` in interactive contexts as a distinct behavior.** Behavior is mode-independent; `embed` always means the iframe overlay.

## The model

### Resolved action (per link, always)

```
per-instance override  →  plugin hint  →  default ("handoff")
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
2. Resolves the action: `instance override ?? item.link_action ?? "handoff"`.
3. Dispatches: `handoff` → open HandoffOverlay; `embed` → open EmbedOverlay; `off` → render as non-clickable (no handler, no `--clickable` affordance).

`CardGrid.vue` and `ItemList.vue` call the composable instead of their own `window.open`. Every current and future link-emitting built-in renderer inherits the behavior for free. The `IframeRenderer` error-fallback anchor is also routed through the composable for consistency.

### 3. Overlays

Both overlays are dismissable (tap-anywhere / close button / idle auto-dismiss). The touchscreen makes dismissal reliable.

- **HandoffOverlay** — on-dashboard modal showing destination **title + host**, a **QR code**, and an **"Open ↗"** button. QR is generated **client-side** (small `qrcode` npm dep) — no backend endpoint needed. Uses the `calvin-plugin-*` body classes / Calvin surface styling.
- **EmbedOverlay** — modal hosting an **iframe** of the destination, reusing the existing `IframeViewer` infrastructure, with a close button. On iframe load failure or a timeout (many targets set `X-Frame-Options`/CSP `frame-ancestors` and will not embed), it **falls back to the HandoffOverlay** ("couldn't embed — scan or open"). This covers a plugin author (or user) choosing `embed` for a destination that refuses framing.

### 4. Per-instance override (host-injected — the net-new plumbing)

The user can override any instance's link action from its settings form: **`Default | QR handoff | Open in-app | Off`** (`Default` = use the plugin hint / global default).

This is **net-new plumbing** — confirmed there is no host-injected-field hook today; the instance form (`InstanceModal.vue`, `PluginCard.vue`) is built purely by iterating the plugin's own `instance_config_schema`, with only hard-coded name/enabled/calendar-color exceptions. So:

- **Frontend:** render a reserved **"Link behavior"** select in `InstanceModal.vue` *outside* the schema loop, following the existing **calendar `color`/`show_time` special-case precedent** (`InstanceModal.vue` ~lines 79–109). Shown only for plugins whose `display_schema.kind` is link-capable (`card-grid`, `item-list`).
- **Persistence:** store the value in the instance `config` JSON blob under a **host-reserved key** (proposed: `_link_action`). Note the reserved-key convention: keys prefixed `_instance_` are *stripped* before persistence (transient metadata), so we deliberately use a different prefix so the value **persists**. `normalize_config` (`base.py`) already passes unknown keys through into `self.config`, so no schema declaration is needed for it to survive.
- **Read-back:** the instance's config already reaches the frontend with each plugin instance; `useLinkOpen()` reads `instance.config._link_action` and treats a missing/`Default` value as "fall through to the plugin hint."

The plugin never declares this field. It appears for free on every present and future link-capable plugin. **mealie** can thus be set to **Open in-app** (`embed`) purely from the host UI, with no change to the mealie plugin.

## Affected files

**Frontend (calvin repo):**
- `frontend/src/components/plugins/renderers/CardGrid.vue` — use `useLinkOpen()`; honor `off` (non-clickable).
- `frontend/src/components/plugins/renderers/ItemList.vue` — same.
- `frontend/src/components/plugins/renderers/IframeRenderer.vue` — route error-fallback anchor through the composable.
- `frontend/src/composables/useLinkOpen.js` — **new**: URL + action resolution + dispatch.
- `frontend/src/components/plugins/overlays/HandoffOverlay.vue` — **new**.
- `frontend/src/components/plugins/overlays/EmbedOverlay.vue` — **new** (reuses `IframeViewer`, falls back to Handoff).
- `frontend/src/components/settings/specialized/InstanceModal.vue` — **new** reserved "Link behavior" field for link-capable plugins; persist under `_link_action`.
- `package.json` — add `qrcode` dependency.

**Plugins (calvin-plugins repo) — optional, not required for correctness:**
- `mealie/plugin.py` — optionally add `item.link_action` hint (recipes are `handoff` by default anyway; a hint is only needed if the *plugin's* preferred default differs from `handoff`).

**Docs:**
- Plugin frontend docs — document `item.link_action` and the web-component "do not self-navigate; route links through the host bridge" contract rule.

## Testing

- **Composable unit tests:** action resolution precedence (`override > hint > default`), URL resolution, `off` → non-clickable.
- **Renderer tests:** `CardGrid`/`ItemList` open the correct overlay for each action; `off` renders no click handler/affordance.
- **HandoffOverlay:** renders QR for a URL, shows title/host, "Open ↗" triggers `window.open`, dismiss paths work.
- **EmbedOverlay:** renders iframe; simulated load failure/timeout falls back to HandoffOverlay.
- **Instance override:** the reserved field renders only for link-capable plugins; value persists into config under `_link_action` and survives `normalize_config`; a set override beats the plugin hint.
- **Regression:** mealie (no hint, no override) → HandoffOverlay by default; nothing navigates on a card tap.

## Open questions / future

- **True kiosk mode** (navigable screens, selective chrome, possibly hiding the "Open ↗" button) — separate future design; this work is forward-compatible with it.
- **Web-component sandboxing** to actually enforce "no self-navigation" — later, if untrusted plugins become a concern.
- **Global default / house-policy knob** — add only if a real need appears.
- **`embed` in a pointer environment** — currently identical everywhere; revisit if desktop users want click-through-to-navigate instead of an embedded frame.
