# Plugin Display UI

Under plugin contract 1.0 a plugin draws its dashboard panel through exactly
one path: it declares a `display_schema` with a built-in `kind`, returns a
JSON payload from `fetch()`, and a built-in Vue renderer draws it. The
`web-component` kind is the escape hatch for custom UI — pre-built JS served
from the plugin's own directory.

**Gone and rejected at load:** shipping `.vue` sources, `render_template`,
`type: "api"` display schemas, and per-plugin frontend builds. Installing a
plugin never triggers a frontend rebuild.

Dispatch: [SchemaRenderer.vue](../../frontend/src/components/plugins/SchemaRenderer.vue)
looks up `schema.kind` in
[rendererRegistry.js](../../frontend/src/components/plugins/rendererRegistry.js).
The kind list must match `SUPPORTED_DISPLAY_KINDS` in
[definitions.py](../../backend/app/plugins/definitions.py) — the backend
rejects unknown kinds at plugin load, and
`backend/tests/unit/test_display_kind_sync.py` fails the build if the two
lists drift.

## Data binding conventions

All renderers share the same binding vocabulary:

- **JSON paths** — any `<key>_path` field is a JSONPath-lite expression
  resolved against the payload from `GET /api/plugins/{instance_id}/data`
  ([jsonPath.js](../../frontend/src/utils/jsonPath.js)). Supported syntax:
  `$`, `$.foo`, `$.foo.bar`, `$.items[0].name`. Missing paths yield
  `undefined` (the renderer omits the element).
- **Literals** — the same key without `_path` (e.g. `label` vs `label_path`)
  is a literal value. The `_path` variant wins when both are set.
- **Formatters** — `<key>_format` names a built-in formatter applied to the
  resolved value ([formatters.js](../../frontend/src/utils/formatters.js)):
  `weekday-short`, `weekday-long`, `date`, `time-12h`, `time-24h`, `percent`,
  `percent-raw`, `bytes`, `round-1`, `capitalize`.
- **`data_path`** — scopes the payload before per-item binding; an array
  yields one item per element.
- **`poll_interval_ms`** — number on the schema; the frontend re-fetches the
  data endpoint on that interval
  ([useSchemaData.js](../../frontend/src/composables/useSchemaData.js)).

## Shell fields (every kind)

Panels are wrapped in Calvin's shared region shell, which owns the header,
padding, clipping, and scroll boundary. Renderers draw body content only.

- `title_path` — resolved against the payload; wins when present.
- `title` — literal fallback. Final fallback: the instance name.
- `panel_variant` — `default` | `dense` | `media` | `iframe`. Controls panel
  chrome. Defaults to `iframe` for `kind: "iframe"`, else `default`
  (see [ServiceViewer.vue](../../frontend/src/components/service/ServiceViewer.vue)).

## Renderer kinds and their schema fields

Renderers live in
[frontend/src/components/plugins/renderers/](../../frontend/src/components/plugins/renderers/).
Each row below lists the renderer-specific keys (every value key also accepts
its `_path` / `_format` variants as described above).

### `status` — readouts (label over value)

One renderer, three layouts ([Status.vue](../../frontend/src/components/plugins/renderers/Status.vue)):

```python
display_schema={
    "kind": "status",
    "layout": "tile",            # "tile" | "row" | "list"; default tile in panels, row in the statusbar
    "data_path": "$.readings",   # array -> one item per element; object -> single item
    "item": {
        "icon": "🌡", "label_path": "$.name",
        "value_path": "$.value", "value_format": "round-1",
        "unit": "°C", "status_path": "$.state",
    },
}
```

`item.status` takes `"ok" | "warn" | "error"` — `ok` renders monochrome;
`warn`/`error` light the square indicator lamp and tint the value. Color on
the wall means "needs attention"; don't mark everything.

### `card-grid` — cards with titled item lists

[CardGrid.vue](../../frontend/src/components/plugins/renderers/CardGrid.vue)

```python
display_schema={
    "kind": "card-grid",
    "data_path": "$.days",                       # array of cards
    "layout": {"columns": "auto-fit-220"},       # int | "auto-square" | "auto-fit-<minpx>"
    "card": {
        "title_path": "$.title",                 # + title / title_format
        "items_path": "$.meals",                 # array of rows within the card
        "item": {"label_path": "$.type", "value_path": "$.name",
                 "click_url_path": "$.url"},     # click opens in a new tab
    },
    "empty_text": "Nothing planned.",
}
```

`item.click_url_path` makes rows clickable. **`item.link_action`** (optional,
`"handoff"` | `"embed"`) — hints how a clickable item's link should open on the
dashboard. `"handoff"` (default) shows a QR handoff overlay; `"embed"` opens
the destination in an in-app iframe overlay. A per-region tune override can
force `handoff`/`embed`/`off` regardless of the hint. Plugins never emit
`"off"`. The dashboard never navigates the wall away — that is why raw links
are not honored. The same field applies in `item-list`.

### `item-list` — timestamped feed/log

[ItemList.vue](../../frontend/src/components/plugins/renderers/ItemList.vue)

```python
display_schema={
    "kind": "item-list",
    "data_path": "$.entries",
    "item": {"timestamp_path": "$.time", "timestamp_format": "time-24h",
             "label_path": "$.title", "value_path": "$.detail",
             "click_url_path": "$.url"},
    "empty_text": "Nothing to show yet.",
}
```

### `iframe` — embedded web page

[IframeRenderer.vue](../../frontend/src/components/plugins/renderers/IframeRenderer.vue)

- `url` (literal) or `url_path`. Pair with `panel_variant: "iframe"`.
- Sites that refuse embedding (X-Frame-Options/CSP) get a built-in error
  overlay with an "open in new window" action.

### `image-with-caption` — full-bleed image + caption overlay

[ImageWithCaption.vue](../../frontend/src/components/plugins/renderers/ImageWithCaption.vue)

- `image_url` / `image_url_path`
- `title` / `title_path` / `title_format`
- `caption` / `caption_path`
- `metadata` / `metadata_path` / `metadata_format` (tabular microtext line)
- Pair with `panel_variant: "media"`.

### `metric-dashboard` — grid of big metric tiles

[MetricDashboard.vue](../../frontend/src/components/plugins/renderers/MetricDashboard.vue)

```python
display_schema={
    "kind": "metric-dashboard",
    "data_path": "$.metrics",                    # array of tiles
    "layout": {"columns": 3},                    # int | "auto-square"; default 2
    "tile": {"icon_path": "$.icon", "label_path": "$.name",
             "value_path": "$.value", "value_format": "percent-raw",
             "unit_path": "$.unit", "status_path": "$.status"},
}
```

`tile.status` follows the same `ok`/`warn`/`error` convention as `status`.

### `weather-forecast` — current conditions + daily forecast

[WeatherForecast.vue](../../frontend/src/components/plugins/renderers/WeatherForecast.vue)

- `current_path` (default `$.current`), `forecast_path` (default `$.forecast`)
- `current`: `icon`, `temperature`, `description`, `feels_like`, `humidity`,
  `pressure`, `wind_speed` (each with `_path` variant)
- `forecast` (per day): `date`, `icon`, `description`, `temp_min`, `temp_max`
- `units`: `{"temperature": "°C", "wind": "m/s"}` (defaults shown)
- A payload with `{"error": "...", "message": "..."}` renders as an error
  state instead of the forecast.

### `web-component` — the escape hatch

[WebComponentHost.vue](../../frontend/src/components/plugins/WebComponentHost.vue)

```python
display_schema={
    "kind": "web-component",
    "element": "calvin-my-widget",   # required: the custom element tag
    "module": "dist.js",             # ES module in the plugin's frontend/ dir (default "dist.js")
    "stylesheet": "dist.css",        # optional, linked into <head> while mounted
}
```

Host behavior:

1. Imports the module from `/api/plugins/{plugin_id}/static/{module}` at
   runtime (the endpoint is confined to the plugin's `frontend/` directory).
2. Errors visibly if the custom element named by `element` isn't registered
   after import.
3. Mounts the element and assigns each `fetch()` payload to its **`data`
   property** — implement `set data(value)` and re-render.
4. Removes the stylesheet link on unmount.

The module must be **pre-built** browser JS shipped in the plugin's
`frontend/` directory (list it in `files.include`). No `.vue` sources, no
build step on the host.

**Theming across shadow DOM:** CSS custom properties inherit into shadow
roots. Style with the shell's semantic tokens — `--ink`, `--ink-2`, `--ink-3`,
`--bg-0`, `--bg-1`, `--bg-2`, `--line`, `--line-soft`, `--font-ui`,
`--font-data`, `--ok`/`--warn`/`--err`, `--focus` — plus the plugin-layer
sizes below, and your component follows Calvin's themes automatically.
Reference: the `chromecast` plugin in `calvin-plugins`.

Web components are wrapped by the same region shell: fill the host
(`width: 100%; height: 100%`) and don't draw your own panel header.

**Web-component plugins must not self-navigate** (`window.location` /
`window.open` / target-navigating anchors). Route link intents through the host
so kiosk-safe handling applies; direct navigation can strand a wall display.

## Statusbar items

`statusbar_schema` puts a compact item in the clock bar, rendered by the same
dispatch with `context="statusbar"`
([PluginStatusbarItems.vue](../../frontend/src/components/PluginStatusbarItems.vue)).
Its kind namespace is intentionally small — **`SUPPORTED_STATUSBAR_KINDS = {"status"}`**:
a statusbar item is a strip, not a panel, so it can't declare an iframe or
grid. In the statusbar, `status` defaults to `layout: "row"` (inline cells
with hairline dividers).

```python
statusbar_schema={
    "kind": "status",
    "item": {"icon": "☀", "value_path": "$.current.temperature",
             "value_format": "round-1", "unit": "°"},
    "poll_interval_ms": 600000,
}
```

## The `calvin-plugin-*` CSS vocabulary

The shared visual identity of every plugin surface — "instrument readouts on
an appliance" — defined in the plugin-surface section of
[frontend/src/styles/main.css](../../frontend/src/styles/main.css) and
derived entirely from the shell's semantic tokens. Built-in renderers use
these classes; web components should too.

Rules of the layer:

- Every datum is set in `var(--font-data)` with tabular numerals; labels are
  small tracked-uppercase `--ink-3`.
- State color appears **only** when something needs attention: `ok` is
  monochrome; `warn`/`error` light the lamp and tint the value.
- Separation inside a panel is hairline (`--line-soft`); raised surfaces
  (`--bg-2` + `--line`) are reserved for true grouping.

**Readouts (the core primitive)**

| Class | Use for |
|---|---|
| `calvin-plugin-readout` | Microlabel over tabular value. |
| `calvin-plugin-readout__label` / `__value` / `__unit` | The readout's parts. |
| `calvin-plugin-readout--warn` / `--error` | Alert tint on label + value. |
| `calvin-plugin-lamp` | The square indicator lamp (render only on alert). |

**Layout containers**

| Class | Use for |
|---|---|
| `calvin-plugin-fill` | Root that fills the panel body (100% w/h). |
| `calvin-plugin-section` | Vertical flex grouping with gap. |
| `calvin-plugin-toolbar` | Small horizontal action row. |

**Grids and lists**

| Class | Use for |
|---|---|
| `calvin-plugin-grid` | Base grid (1rem gap, fills body). |
| `calvin-plugin-grid--auto` / `--dense` / `--2` / `--3` | Column presets. |
| `calvin-plugin-list` | Vertical list; consecutive rows get hairline separators. |
| `calvin-plugin-list--scroll` | Internal vertical scrolling. |

**Surfaces and rows**

| Class | Use for |
|---|---|
| `calvin-plugin-surface` | Raised card (`--bg-2`, `--line` border, 1rem padding). |
| `calvin-plugin-row` | Quiet list row (padding only; separator comes from the list). |
| `calvin-plugin-metric` | Extra padding for prominent tiles. |
| `calvin-plugin-clickable` | Pointer cursor + hover/focus affordance. |
| `calvin-plugin-media` | Full-bleed image/video/canvas container (`panel_variant: "media"`). |

**Fallback states**

| Class | Use for |
|---|---|
| `calvin-plugin-empty` / `calvin-plugin-loading` / `calvin-plugin-error` | Empty / loading / error messages — write direction, not mood. |

**`--plugin-*` custom properties** (cross shadow-DOM boundaries, so web
components inherit them):

| Property | Meaning |
|---|---|
| `--plugin-value-size` | Readout value size (tile), `2rem`. |
| `--plugin-value-size-lg` | Hero metric, `2.6rem`. |
| `--plugin-value-size-sm` | Inline (row/statusbar) value, `1.05rem`. |
| `--plugin-lamp-size` | Indicator lamp square, `0.45rem`. |

Example web-component body:

```html
<div class="calvin-plugin-fill calvin-plugin-section">
  <div class="calvin-plugin-grid calvin-plugin-grid--auto">
    <article class="calvin-plugin-surface calvin-plugin-readout">
      <span class="calvin-plugin-readout__label">CPU</span>
      <span class="calvin-plugin-readout__value">42<span class="calvin-plugin-readout__unit">%</span></span>
    </article>
  </div>
</div>
```

## Adding a new renderer kind (host development)

1. Add the component under
   [renderers/](../../frontend/src/components/plugins/renderers/).
2. Register it in
   [rendererRegistry.js](../../frontend/src/components/plugins/rendererRegistry.js).
3. Add the kind to `SUPPORTED_DISPLAY_KINDS` in
   [definitions.py](../../backend/app/plugins/definitions.py).

The kind-sync test enforces that all three stay together.

## Choosing a contract

Prefer schema renderers — they inherit Calvin's layout, theming,
accessibility, and test coverage for free. Use `web-component` only for
visualizations or interactions the built-in set genuinely can't express.
