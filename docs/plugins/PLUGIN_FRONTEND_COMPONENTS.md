# Plugin Display UI

Calvin no longer installs plugin-provided Vue single-file components into the main frontend
bundle. Service plugins should render dashboard content through one of two supported contracts:

1. **Schema renderers**: recommended for most plugins. The plugin returns a `display_schema`
   with a built-in `kind`, and Calvin renders it with the matching built-in Vue renderer.
2. **Web components**: an escape hatch for custom UI. The plugin ships pre-built browser-native
   JavaScript and optional CSS under its `frontend/` directory, and Calvin loads those files at
   runtime through the plugin static asset endpoint.

This means installing a schema or web-component plugin does not require a frontend rebuild.

## Schema Renderers

Use schema renderers when the plugin can describe its UI declaratively. The frontend dispatches
`display_schema.kind` through `frontend/src/components/plugins/SchemaRenderer.vue`.

Supported renderer kinds include:

- `status-tile`
- `status-list`
- `status-row`
- `card-grid`
- `item-list`
- `iframe`
- `image-with-caption`
- `metric-dashboard`
- `weather-forecast`
- `web-component`

Example plugin metadata:

```python
display_schema={
    "kind": "status-tile",
    "label": "Temperature",
    "value_path": "$.temperature",
    "unit": "C",
    "status_path": "$.status",
}
```

The plugin's service data endpoint returns the data object that schema paths bind to.

### Shared Dashboard Shell

Dashboard service renderers are wrapped in Calvin's shared region shell. The shell provides the
outer header, body padding, clipping, and scroll boundary for split layouts. Schema renderers should
render only their body content and should not draw an outer dashboard header.

Optional `display_schema` shell fields:

- `title_path`: JSONPath-lite path resolved against the service data. This title wins when present.
- `title`: literal fallback title.
- `panel_variant`: one of `default`, `dense`, `media`, or `iframe`.

Title resolution order is:

1. `display_schema.title_path`
2. `display_schema.title`
3. service/plugin name

Use `default` for ordinary cards and lists, `dense` for compact status-heavy renderers, `media` for
flush image/video surfaces, and `iframe` for full-bleed embedded pages. Missing fields continue to
work and fall back to the service name.

Example title and variant metadata:

```python
display_schema={
    "kind": "weather-forecast",
    "title_path": "$.location.name",
    "panel_variant": "default",
    "current_path": "$.current",
    "forecast_path": "$.forecast",
    # ...
}
```

```python
display_schema={
    "kind": "iframe",
    "title": "Home Assistant",
    "panel_variant": "iframe",
    "url": "https://homeassistant.local/lovelace/default_view",
}
```

### Plugin Body Class Vocabulary

Plugin frontends and built-in renderers should use Calvin's public dashboard body classes
defined in [frontend/src/styles/main.css](../../frontend/src/styles/main.css). The classes
use `var(--bg-secondary)`, `var(--border-color)`, radius `6px`, standard spacing, and
region-safe `min-width`/`min-height` rules. The panel body owns the outer overflow boundary, so
renderers should avoid adding another outer frame.

**Layout containers**

| Class | Use for |
|---|---|
| `calvin-plugin-fill` | Component root that should fill the panel body (100% width/height). |
| `calvin-plugin-section` | Lightweight body grouping (vertical flex, gap) without a nested outer card. |
| `calvin-plugin-toolbar` | Small horizontal action row inside the plugin body. |

**Grids and lists**

| Class | Use for |
|---|---|
| `calvin-plugin-grid` | Base tile/card grid (1rem gap, fills body). Combine with one of the variants below. |
| `calvin-plugin-grid--auto` | Auto-fit columns, min 180px each — the default for card grids. |
| `calvin-plugin-grid--dense` | Auto-fit columns, min 120px, tighter gap — for compact status tiles. |
| `calvin-plugin-grid--2` | Fixed 2-column layout. |
| `calvin-plugin-grid--3` | Fixed 3-column layout. |
| `calvin-plugin-list` | Vertical list (flex column, no bullets). |
| `calvin-plugin-list--scroll` | Add to a list to enable internal vertical scrolling. |

**Surfaces (the repeating cards/rows inside a grid or list)**

| Class | Use for |
|---|---|
| `calvin-plugin-surface` | Bordered card surface with 1rem padding — the default for tiles in a grid. |
| `calvin-plugin-row` | Bordered row surface with tighter padding — for items in a list. |
| `calvin-plugin-metric` | Bordered surface with extra padding — for prominent numeric tiles. |
| `calvin-plugin-clickable` | Add to a surface/row to give it a pointer cursor and hover affordance. |
| `calvin-plugin-media` | Full-bleed image/video/canvas container — for `panel_variant: "media"`. |

**Fallback states**

| Class | Use for |
|---|---|
| `calvin-plugin-empty` | "No data" / empty-state message (italic, secondary color). |
| `calvin-plugin-loading` | Loading-state message (secondary color). |
| `calvin-plugin-error` | Error-state message (error color). |

Example web component body layout:

```html
<div class="calvin-plugin-fill calvin-plugin-section">
  <div class="calvin-plugin-toolbar">
    <button>Refresh</button>
  </div>
  <div class="calvin-plugin-grid calvin-plugin-grid--auto">
    <article class="calvin-plugin-surface">...</article>
    <article class="calvin-plugin-surface">...</article>
  </div>
</div>
```

## Web Components

Use `kind: "web-component"` only when the built-in schema renderers are not expressive enough.
The plugin must ship already-built browser JavaScript in `frontend/`.

Example package structure:

```text
my-plugin/
├── plugin.json
├── plugin.py
└── frontend/
    ├── dist.js
    └── dist.css
```

Example display schema:

```python
display_schema={
    "kind": "web-component",
    "element": "calvin-my-plugin",
    "module": "dist.js",
    "stylesheet": "dist.css",
}
```

At runtime, Calvin loads:

```text
/api/plugins/{plugin_id}/static/dist.js
/api/plugins/{plugin_id}/static/dist.css
```

The JavaScript module must register the custom element named by `display_schema.element`.
Calvin assigns the latest service data to the element's `data` property.

Web components are also wrapped by the shared region shell. Custom elements should fill the provided
body area (`width: 100%; height: 100%`) and avoid rendering their own Calvin-style outer header.

## Porting Existing Plugin Frontends

When updating plugins for the shared shell:

- Move dashboard titles into `display_schema.title_path` or `display_schema.title`.
- Remove plugin-rendered outer headers that duplicate the Calvin region header.
- Use `panel_variant: "iframe"` for iframe-like full-bleed services.
- Use `panel_variant: "media"` only for image/video-heavy surfaces that should sit flush against the
  panel body.
- Ensure web components fill their host element instead of sizing themselves against the viewport.
- Keep internal cards, lists, and metrics inside the provided body area.

## Installation Behavior

When a plugin includes a `frontend/` directory, Calvin stores it with the installed plugin under:

```text
backend/data/plugins/{plugin_id}/frontend/
```

Those files are served by:

```text
GET /api/plugins/{plugin_id}/static/{asset_path}
```

The static endpoint prevents path traversal outside the plugin's `frontend/` directory.

## Choosing a Contract

Prefer schema renderers for stable dashboard UI because they inherit Calvin's layout, theme,
accessibility, and test coverage. Use web components for custom visualizations or interactions
that cannot reasonably be represented with the built-in renderer set.
