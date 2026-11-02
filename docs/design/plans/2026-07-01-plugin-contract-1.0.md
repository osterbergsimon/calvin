# Plugin Contract 1.0 — Handoff Brief for Fable 5

> **To Fable 5:** This is a brief, not a spec. The audit below is real and
> corroborated across three independent passes (backend / frontend /
> docs+plugins), so trust the findings — but the *shape* of the 1.0 contract is
> yours to design. Where you see a cleaner cut than what's suggested here, take
> it and say why. Breaking plugins is explicitly allowed; all 14 plugins + the
> scaffold are first-party in `../calvin-plugins/`, so you can migrate everything
> in lockstep. Two hard constraints only: **one enforced version signal** and
> **one display path**. Everything else is latitude.

## Context

Calvin is a self-hosted Raspberry Pi wall dashboard (Vue 3 + FastAPI + a Pluggy
plugin system; plugins live in the sibling `../calvin-plugins/` repo). The plugin
contract has accreted: three overlapping version fields nothing branches on,
dead capability declarations, two competing display formats where the "modern"
one is barely used, config declared three times per plugin, and three
copy-pasted `@hookimpl` functions in every `plugin.py`. Several core routes
hardcode specific plugin ids.

This is the moment to cut a clean 1.0. The user picked the **maximal** path:
full redesign, go declarative, retire the legacy display path entirely — and
establish the renderer visual token system as part of the same cut.

The north star for the author-facing contract: **a minimal plugin is a single
declarative class + a `plugin.json`.** No boilerplate hooks, config declared
once, one version field, one way to draw a panel.

---

## The audit — grounded findings (your raw material)

These are confirmed, with file:line anchors. Use them; don't re-derive them.

### Version signals — collapse to one
`format_version` (string, always `"1.0.0"`), `protocol_version` (int, always
`1`), the plugin's own `version` (semver), **and** an inert
`dependencies.calvin: ">=1.0.0"` compat string all coexist. Nothing branches on
any of them. `format_version` is checked against a hardcoded `["1.0.0"]` literal
(`plugin_installer.py:78-80,115-117`); `protocol_version` uses
`CURRENT_PLUGIN_PROTOCOL_VERSION` (`definitions.py:14`). Both default-fill when
absent, so old plugins silently pass. → **One enforced field.**

### Boilerplate — the biggest author burden
Every plugin hand-writes three near-identical module-level `@hookimpl`
functions (`register_plugin_types` → just wraps `get_plugin_metadata`;
`create_plugin_instance` → guards on `type_id` and delegates;
`handle_plugin_config_update` → guards, builds a manager config, delegates to
`handle_plugin_config_update_generic`). Same `if type_id != "x": return None`
guard, three times. Config is declared **three times**: a `SERVICE_FIELDS` tuple,
the `__init__` signature, and `instance_config_schema`. The generic helpers in
`app/utils/instance_manager.py` already do the real work — the hooks are just
copy-paste glue. → **Discover `BasePlugin` subclasses; derive registration,
instantiation, and config-update from the class + a single `metadata`
attribute.** Drop the redundant `get_plugin_metadata()` classmethod and the
unused `session` param (`hooks.py:63`, `instance_manager.py:77,98`, marked "not
used").

### Verb naming — three vocabularies for the same acts
Class-level `fetch_type_data` / `test_type_config` / `scan_type_options`;
instance-level `fetch_service_data`; deprecated pluggy hooks `fetch_plugin_data`
/ `test_plugin_connection` / `scan_plugin_options` / `fetch_service_data`
(flagged deprecated in `hooks.py` but still listed as current in
`PLUGIN_INTERFACE.md:66-73`); an undocumented-but-universal `get_content()` used
by all 5 service plugins that appears in *no* interface doc. Plus a dead
`CapabilitySet` (`can_test_connection`, `can_scan_options`, …,
`definitions.py:100-108`) with **zero reads** anywhere — capabilities are
already inferred from method/`ui_actions` presence. → **One verb each; delete
the capability set and the deprecated forms.**

### Display — two formats, the legacy one wins in practice
The docs describe a `kind`-renderer system (`status-tile`, `card-grid`,
`weather-forecast`, `web-component`, …). But **5 of 5 service plugins ship the
legacy `{type:"api", api_endpoint, component:"x/Foo.vue", render_template:"…"}`
shape** — mealie even comments `# Legacy: kept for backward compatibility`. Five
plugins ship `.vue` source the host no longer installs; the one plugin on
`web-component` (chromecast) is missing its `dist.js`. The scaffold
(`create_plugin.py`) still *generates* the legacy shape. Meanwhile the kind set
has redundancy: `status-list` is literally `status-tile` in a loop
(`StatusList.vue:3-27`), `status-row` largely dupes it; `web-component` is
double-dispatched (registry + an explicit `v-else-if` in `SchemaRenderer.vue:5-10`);
statusbar and panel share one kind namespace so a statusbar item can declare a
full `iframe`/`web-component` panel. The backend `SUPPORTED_DISPLAY_KINDS` and
frontend `rendererRegistry.js` must be hand-synced. → **One display path:
`kind`-renderers + web-component escape hatch. Consolidate the status kinds.
Add a test that keeps the two kind-lists in sync automatically.**

### Dependencies — documented ≠ enforced
Docs tell authors to declare `dependencies.packages` (validated for shape,
**inert**). The installer actually pip-installs from a flat
`manifest.get("python_dependencies", [])` (`plugin_installer.py:286`) that is
**documented nowhere**. The two plugins with real deps (system-monitor,
chromecast) use the undocumented key *and* carry a decorative `dependencies`
block the installer ignores. → **One dependency mechanism, enforced, documented.**

### Leaks & vestiges
- `yr_weather` hardcoded in the generic `/geocode` route
  (`management.py:1016-1028`); frontend id-sniffing for weather/iframe
  (`InstanceModal.vue:226-230`, `webServices.js:170`).
- `frontend_rebuild_in_progress` — dead since FrontendBuildManager was removed,
  hardcoded `False` at `management.py:82,88,411,565`, `github.py:327,520`,
  `types.ts:1729,1738`.
- Two globals both named `plugin_manager`: the pluggy bus (`hooks.py:90`) vs the
  runtime registry (`manager.py:359`). A real import footgun.
- `PluginDefinition` is a Pydantic model accessed as a dict via `get()`/
  `__getitem__` shims (`definitions.py:167-172`) with all schemas as raw
  `dict[str,Any]`; the typed models (`DisplaySchema`, `ConfigFieldDefinition`, …,
  `definitions.py:54-97`) are defined but never applied.
- Config values arrive as scalars OR `{value}`/`{default}` wrappers, forcing
  defensive unwrapping in ≥4 places (`PluginFieldRenderer.vue:188-194`,
  `InstanceModal.vue:198-206`, `usePlugins.js:119-121,750-756,780-786`).
- `theme` is a fake `PluginType` member (no BasePlugin, no SDK — DB tagging only).
- Install requires a **server restart** before a plugin appears
  (`PLUGIN_PERSISTENCE_AND_RESTART.md:59-61`, flagged as a temporary limitation).

---

## What "done" means (outcomes, not steps)

Design the cuts yourself; these are the outcomes to hit:

1. **One class = one plugin.** No module-level hooks in a plugin; config declared
   once; `metadata` drives registration, instantiation, and config-update.
2. **One version field**, actually enforced at install (reject `> current`).
3. **One display path** — `kind`-renderers + web-component only; legacy
   `type:"api"`/`render_template`/`.vue` deleted; status kinds consolidated;
   backend/frontend kind-lists sync-tested.
4. **One dependency mechanism**, enforced and documented.
5. **No dead surface** — capabilities, `frontend_rebuild_in_progress`, unused
   `session`, dict-compat shims, redundant `get_plugin_metadata`, plugin-id
   hardcodes all gone.
6. **A committed typed boundary** — apply the schema models or delete them;
   normalize the config-value shape to one form.
7. **Install → appears, no restart** (natural payoff of #1).
8. **Docs rewritten against the finished contract**, reconciling the
   deprecated-hooks-as-current and missing-`get_content` gaps and stale links.

---

## Visual direction — the plugin display layer (design this now)

Retiring the legacy display path means every plugin panel and statusbar item
now flows through the built-in `kind`-renderers and the `calvin-plugin-*` CSS
vocabulary (`frontend/src/styles/main.css:49-176`). That shared layer **is** the
visual identity of every plugin surface — so establish its token system as part
of this cut, don't defer it.

**Direction: shell-native and quiet.** These renderers are not web pages; they
are chrome for an always-on Raspberry Pi wall display glanced at from across a
room. Continue the recent "shell-native" polish (commits `calvin-5io`,
`calvin-arv`): panels should read as part of the OS/dashboard shell, not as
embedded cards from five different design systems.

Principles to hold:
- **One coherent token system** — a compact palette (4–6 named values), a
  deliberate type scale tuned for wall-distance legibility, disciplined spacing,
  a single restrained accent. Every `kind`-renderer derives from it; a plugin
  inherits Calvin's surfaces by using `calvin-plugin-*`, never by shipping its
  own look.
- **Glanceable over dense.** Optimize for the 2-second glance from across the
  room: clear hierarchy, generous negative space, high enough contrast, quiet by
  default. The status/metric/weather kinds should feel like the same instrument
  panel, not siblings-by-accident.
- **Spend boldness once.** Let the shell's *one* signature move (a consistent
  panel frame, a distinctive statusbar treatment — your call) be the memorable
  thing; keep everything else disciplined. Cut decoration that doesn't serve the
  glance. Respect reduced-motion; keep any motion ambient, not attention-seeking.
- **The consolidated status kind is the anchor.** As you collapse
  `status-tile`/`status-list`/`status-row` into one `status` kind with a layout
  option, that renderer sets the tone for the whole vocabulary — design it first,
  derive the rest.

Copy is design material: label controls by what the user recognizes
(a person manages "calendars," not "instance configs"); empty and error states
give direction in the interface's voice, not mood. Keep the register plain and
consistent across every renderer.

Follow the frontend-design process: brainstorm a token system (color / type /
layout / signature), critique it against the "shell-native, quiet" brief before
building (if any part reads as a generic default, revise and say what changed),
then build to it exactly. Screenshot as you go.

---

## Where things live (map, not a checklist)

**Host — backend:** `app/plugins/{base,hooks,definitions,loader,protocols}.py`,
`app/utils/instance_manager.py`, `app/services/plugin_installer.py`,
`app/api/routes/plugins/{management,github}.py`.
**Host — frontend:** `components/plugins/{SchemaRenderer.vue,rendererRegistry.js,renderers/}`,
`components/service/ServiceViewer.vue`, `components/{PluginFieldRenderer,InstanceModal,PluginStatusbarItems,PluginActions}.vue`,
`stores/webServices.js`, `composables/usePlugins.js`, `styles/main.css`, `api/types.ts`.
**Plugins repo (`../calvin-plugins/`):** all 14 `plugin.py` + `plugin.json`,
`scripts/create_plugin.py`, `CREATING_PLUGINS.md`.
**Docs:** `docs/plugins/*.md`.

## Suggested sequencing (adapt freely)

1. Land the new contract in the host behind a temporary legacy-adapter shim so
   host and plugins can migrate independently.
2. Migrate **mealie** end-to-end first (service, custom render) as the reference
   — prove declarative class + `kind` display + unified `fetch` + the new token
   system on the status renderer.
3. Migrate the remaining 13 + regenerate the scaffold from mealie's template.
4. Remove the shim — hard break; bump the version gate.
5. Rewrite docs against the finished contract.

## Verification

- **Backend suites** (`docs/testing/BACKEND_TESTS.md`): loader / installer /
  instance-manager. Add a test that a minimal declarative plugin loads with
  **no** module-level hooks.
- **Kind-sync test:** assert backend `SUPPORTED_DISPLAY_KINDS` == frontend
  `rendererRegistry.js` keys — retires the hand-sync chore permanently.
- **Install without restart:** install via the mgmt API, assert DB registration +
  visible in `GET /api/plugins` with no restart.
- **One-of-each end-to-end:** one calendar / image / service / backend plugin —
  install, configure an instance, fetch, render. Drive a dev server
  (`docs/setup/QUICKSTART_DEVELOP.md`) with the Playwright MCP tools; confirm the
  `kind` renderer draws and the statusbar item renders in the bar. Screenshot the
  restyled renderers at wall-distance sizing.
- **Dependency install:** system-monitor's real deps install via the single
  enforced path.
- **Grep gates:** zero remaining refs to `format_version`, `protocol_version`,
  `capabilities`/`can_`, `frontend_rebuild_in_progress`, `python_dependencies`,
  `render_template`, `type == "api"`, or `yr_weather` hardcodes across both repos.

---

## Appendix — Suggested implementation (NON-BINDING)

> **This appendix is a suggestion, not a directive.** It's the prescriptive
> version of the cuts, kept so the reasoning isn't lost. Fable 5 (or whoever
> implements) should feel free to depart from any of it where a cleaner design
> exists — the *outcomes* above are what matter, not these specific mechanics.
> Treat every "recommend" below as one option, not a decision.

### Suggested: version signal
Replace `format_version` + `protocol_version` with a single `api_version` (int,
currently `1`), enforced once in the installer (reject `api_version > CURRENT`).
Introduce `CURRENT_PLUGIN_API_VERSION` in `definitions.py`, replacing
`CURRENT_PLUGIN_PROTOCOL_VERSION`. Drop the inert `dependencies.calvin` string.

### Suggested: declarative registration
Rework `loader.py` to import the plugin module and scan for `BasePlugin`
subclasses instead of calling the three pluggy hooks. Remove the hookspecs
`register_plugin_types` / `create_plugin_instance` / `handle_plugin_config_update`
from `hooks.py`; derive their behavior internally from the class + a `metadata`
class attribute, still routing through `handle_plugin_config_update_generic` /
`create_*_plugin_instance` / `build_*_manager_config` so the generic path runs.
Collapse the triple config declaration to the schema in `metadata` — drive
instance fields from the schema via `configure()`/`get_config()` in `base.py`
instead of hand-unpacking each `__init__`. Drop `get_plugin_metadata()` (now a
class attr) and the unused `session` param.

### Suggested: verbs
One vocabulary on the family protocols (`protocols.py`): instance-level
`fetch()`, `test_connection()`, `scan_options()`. Retire the `_type_`
class-method names and the deprecated hook forms. Fold the universal
`get_content()` into the contract explicitly or merge it into `fetch()`. Update
dispatch in `management.py` (~`877,891,911,926,981,1157,1189`).

### Suggested: display path
Delete support for `display_schema.type == "api"`, `render_template`, and
`component:"*.vue"`; remove the "v2 contract" fallback/error
(`ServiceViewer.vue:24`). Collapse `status-tile`/`status-list`/`status-row` into
one `status` kind with a `layout` (tile/row/list) option — update
`SUPPORTED_DISPLAY_KINDS` and `rendererRegistry.js` together. Remove the
redundant `web-component` `v-else-if` in `SchemaRenderer.vue:5-10`. Split the
statusbar kind namespace from the panel namespace. Regenerate
`create_plugin.py` to emit the `kind` form.

### Suggested: dependencies
Make the installer read documented `dependencies.packages`; delete the phantom
`python_dependencies` key; migrate system-monitor + chromecast.

### Suggested: dead surface & leaks
Delete `CapabilitySet`/`capabilities`. Drop `frontend_rebuild_in_progress` from
all response models (`management.py`, `github.py`, `types.ts`). Remove the
`yr_weather` `/geocode` hardcode and the frontend id-sniffing — replace with a
declared capability or a `geocode` action type in `PluginActions.vue`. Rename the
pluggy-bus global `plugin_manager` → `hook_manager` (`hooks.py:90`).

### Suggested: typed boundary
Apply the already-defined `DisplaySchema` / `StatusbarSchema` /
`ConfigFieldDefinition` / `ActionDefinition` / `SectionDefinition` models so
shape is validated at load; remove the dict-compat shims (`get`/`__getitem__`,
`from_raw` loose path) and convert dict-style call sites to attribute access.
Normalize the `{value}`/`{default}` config wrapper to bare scalars; remove the
defensive unwrapping in the four frontend sites.

### Suggested: sequencing
Shim → migrate mealie as reference → migrate the other 13 + scaffold → remove
shim (hard break) → rewrite docs.
