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
