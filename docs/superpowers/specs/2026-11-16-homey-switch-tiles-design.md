# Homey switch tiles: plugin actions and a switch-grid renderer

Date: 2026-11-16. Status: draft for the owner's review.

## Intent

A Calvin screen shows a tile for each of a few chosen Homey devices, and a
tap turns that device on or off. It is for two audiences at once: guests and
family walking past the wall screen, and the owner when the phone is not at
hand. So a tap must work for anyone standing at the screen, with no login,
and the tiles must be obvious to someone who has never seen Calvin.

Today nothing on a Calvin dashboard can act. Plugins only fetch, and the eight
renderers only display. This design adds the missing path once, in the host,
so Homey is the first user and other plugins (for example play/pause on a
Chromecast) can reuse it later.

## Goals

- A Homey plugin (in `calvin-plugins`) that lists the chosen devices with
  their on/off state and switches them.
- A general plugin action path in Calvin: a tap goes from the browser to the
  Calvin backend, to the plugin, to Homey. The Homey key never leaves the
  backend.
- A built-in `switch-grid` renderer: big, labelled tiles that show on, off or
  unavailable, and switch on tap.
- Only the devices the owner picked in Settings can be switched from a screen.

## Non-goals (for this version)

- Dimming, colour, scenes, moods and flows. Tiles are on/off only.
- Showing sensors or other non-switchable state.
- Push updates. State changes made elsewhere (the Homey app, a wall switch)
  appear on the next poll, not instantly.
- Per-screen or per-person permissions. Every screen that shows the widget can
  switch every chosen device.

## Anti-goals (failure even if it works)

- The Homey key, or any secret, reaches a browser.
- A device that was not chosen in Settings can be switched through Calvin, by
  any request.
- A tap looks like it worked when it did not. The tile must end in the real
  state, and say so when Homey could not be reached.
- The new open route lets an anonymous request do anything other than run an
  action the plugin declared, with parameters the host validated.

## How it works today (facts this builds on)

- **Security.** Every unsafe `/api` method is admin-only unless its route
  template is listed in `PUBLIC_WRITES` (`backend/app/security/route_policy.py`).
  A test fails the build if an unsafe route is neither admin-only nor listed
  (`backend/tests/integration/test_route_policy.py`). Kiosk and device sessions
  are both admin sessions; a person at a wall screen with no login is an
  anonymous request. `HostOriginMiddleware` rejects cross-site unsafe requests
  and non-LAN Host headers; there is no CSRF token. Existing anonymous writes
  include `POST /api/plugins/{plugin_id}/fetch`, display power on/off and image
  next/previous.
- **Data.** `GET /api/plugins/{plugin_id}/data` (id is an instance id) returns
  `ServicePlugin.fetch()` as-is, with no server cache
  (`backend/app/api/routes/plugins/management.py`). The browser polls it
  through vue-query (`frontend/src/composables/useSchemaData.js`, key
  `["plugin-data", id]`), every `display_schema.poll_interval_ms` if set.
  `SchemaRenderer.vue` passes `schema`, `data`, `pluginId` and `context` to the
  renderer and declares no emits. `useServiceDataRefresh.js` can refetch a
  plugin's data.
- **Settings.** `scan_options(cls, field_key)` is a classmethod with no config,
  served admin-only at `GET /api/plugins/{plugin_id}/scan?field=`. The form
  uses it only for the single-value `select-scan`. There is no multi-select
  field type. Secret fields (`type: "password"`) are redacted to `""` in every
  response (`backend/app/plugins/utils/secrets.py`).
- **Renderers.** The kind list lives in `SUPPORTED_DISPLAY_KINDS`
  (`backend/app/plugins/definitions.py`) and `rendererRegistry.js`, kept in
  sync by `test_display_kind_sync.py`. `CardGrid.vue` is the closest model for
  a tile grid.

## Approaches considered

- **A. A general action path in the host, plus a built-in switch-grid
  renderer (chosen by the owner).** A new optional plugin method and a new
  host route carry a tap to the plugin; the Homey key stays server-side; only
  declared actions with validated parameters run; other plugins can reuse it.
  Cost: a plugin contract addition and a new entry in the security policy,
  both on the highest-risk paths, so it needs careful review.
- **B. A web-component plugin that calls Homey from the browser.** No host
  change, but the Homey key would sit in every screen's and phone's browser.
  Ruled out by the first anti-goal.
- **C. Reuse `POST /api/plugins/{plugin_id}/fetch` for switching.** Smaller,
  but it puts writes on a read verb, still needs the security exception and a
  custom widget, and would likely be undone later.

## Design

### 1. Plugin contract: declared actions (additive, `api_version` stays 1)

- `PluginMetadata` gains an optional `actions` list. Each entry declares a
  name (for example `set_onoff`) and its parameters with a small schema the
  host can validate: each parameter is a string or a boolean, required or not.
  Unknown parameters are rejected. A plugin without `actions` loads exactly as
  before.
- `ServicePlugin` gains an optional `async perform_action(name, params) -> dict`.
  It returns the new state of what it changed, in the same item shape its
  `fetch()` uses (see section 3), so the tile can settle without a full
  refetch. Errors raise a host-defined `PluginActionError` with a plain-words
  message; the host maps it to a 502 with that message, and any other
  exception to a generic 500 with no exception text (as other plugin routes
  do).
- The loader rejects at load time a plugin that declares `actions` but does
  not implement `perform_action`, or implements it with no declared actions.
- Docs: `docs/plugins/PLUGIN_INTERFACE.md` and the calvin-plugin-contract skill
  describe both.

### 2. Host route and security

- New route `POST /api/plugins/{plugin_id}/actions/{action}` (the id is an
  instance id, matching `/data`), body `{"params": {...}}`.
- The host checks, in order: the instance exists, is a service plugin, and is
  enabled (404/409 as `/data` does); the action is declared in its metadata
  (404 otherwise); the params match the declared schema (422 otherwise). Only
  then does it call `perform_action`.
- The route is added to `PUBLIC_WRITES`, so anyone at a screen can run it, with
  the existing origin and Host checks. That is the only route made public.
  Whether a given call is allowed beyond that is the plugin's job (section 4:
  the device must be on the chosen list); the host cannot know a plugin's
  allowlist.
- A simple per-instance rate limit in the route (my call: about 5 actions per
  second per instance; excess gets 429) so a stuck finger or a script cannot
  flood the hub.
- Actions time out after 10 s (the call is cancelled, answer 504), and at most
  2 run at once per instance (a third gets 429 with `Retry-After: 1` without
  calling the plugin), so a hung hub cannot pile up handlers and sockets.
- Each action is logged at info level with instance, action and params, never
  with config.
- The route-policy test, a contract test for the route (validation, unknown
  action, disabled instance, error mapping) and the OpenAPI contract file are
  updated.

### 3. Renderer: `switch-grid`

- New kind `switch-grid` in `SUPPORTED_DISPLAY_KINDS` and `rendererRegistry.js`.
- Payload from `fetch()`: `{"items": [{"id", "label", "group"?, "state":
  "on" | "off" | "unavailable", "action": {"name", "params"}}]}`. `action` is
  what a tap sends; the renderer does not know Homey. For an on/off device the
  plugin sets `params` to the target state (on when it is off and vice versa),
  so a tap is explicit, not a blind toggle.
- Each tile is a `<button>` with `aria-pressed` for on/off, the label, and the
  state in words ("On", "Off", "Not responding"). `unavailable` tiles are
  disabled with that text. Tiles meet the kiosk touch-target size and follow
  `docs/design/frontend-doctrine.md` (role tokens, focus never lost, reduced
  motion, shared blocks).
- A tap shows the new state at once with a pending mark, posts the action,
  then settles on the state the response returns. On failure it returns to
  the previous state and shows a short inline note ("Couldn't reach Homey")
  inside a polite live region. After any action it asks for a refetch of the
  plugin data (`useServiceDataRefresh`) so other tiles stay true.
- The plugin sets `display_schema.poll_interval_ms` (my call: 15 s) so changes
  made elsewhere show up.
- `SchemaRenderer` gives renderers a way to run an action (a provided function
  or an emitted event; builder's choice), so renderers stay free of API code.

### 4. The Homey plugin (`calvin-plugins/homey`)

- Type `service`, `display_schema.kind: "switch-grid"`.
- Settings: the hub's address in a field named `host` (my call: the name must
  match the endpoint pattern in `secrets.py`, so changing it forces the key to
  be entered again and the stored key can never be sent to a new address), an
  API key (a `password` field, so it is redacted like every secret), and the
  chosen devices.
- Instances (my call): the default config-hash identity, so one hub can back
  several instances with different device lists, for example kitchen lights
  on the kitchen screen. Each screen region picks an instance as today.
- Picking devices needs a list from the hub, so it needs the address and key.
  Today `scan_options` gets no config and the form has no multi-select. My
  call: add an instance-level scan (`GET /api/plugins/instances/{id}/scan?field=`,
  it passes the stored config, secrets filled from storage) and a
  `multi-select-scan` field component that stores a list of ids. GETs are
  public by default, so the new route must be added to `ADMIN_READS` with a
  test that an anonymous request gets 401 (otherwise anyone could list the
  hub's devices with the stored key). It returns only `{value, label}` options,
  never config. If the builder finds a smaller way to pick several devices
  that keeps the secret server-side, that is fine too.
- Storage (my call): config values are bare scalars, so the chosen devices are
  one string of comma-separated ids. One shared helper in the plugin parses it
  (split on commas, trim, drop empties); the scan, `fetch()` and
  `perform_action` all use that helper, and it has its own tests. Homey device
  ids are UUIDs, so they never contain commas.
- The scan lists only devices that have the `onoff` capability, labelled
  "name (zone)".
- `fetch()` reads the chosen devices from the hub and returns the items.
  A chosen device that no longer exists or does not answer is `unavailable`.
- `perform_action("set_onoff", {"device", "on"})` refuses any device id that is
  not on the chosen list (this is the allowlist the anti-goals require), then
  sets `onoff` on the hub and returns the device's new item. A refused device
  (for example one removed in Settings while a screen still shows it) raises a
  distinct error the host maps to 403; the tile then shows "Can't be switched
  from here" and turns unavailable, rather than "Couldn't reach Homey".
- Load (my call): a few screens and phones at once. `fetch()` keeps a short
  per-instance cache (about 2 s) so the refetches after an action, from every
  open screen, become one hub request; an action clears it.
- Connection: the Homey Pro local Web API with an API key (needs only device
  read and control scopes), so switching works without the internet; the
  builder confirms the endpoint paths against Athom's current documentation.
  The owner's hub is a Homey Pro. Homey Bridge (cloud only) is not supported
  in this version.
- `test_connection` checks the address and key with one read.
- Contract tests in the shape of `mealie/`, with the hub mocked.

### 5. Order of work

1. Calvin host: actions contract, route, policy, tests, docs (one PR).
2. Calvin frontend: `switch-grid` renderer and its action plumbing; the
   instance scan and `multi-select-scan` field (one PR, or two if large).
3. `calvin-plugins/homey` (one PR), after a Calvin release that contains 1
   and 2.

Version safety (my call): there is no plugin-to-host version gate today, and
this project does not add one. An older Calvin rejects the plugin at load
anyway, because `PluginMetadata` forbids unknown fields (`extra="forbid"`)
and the `switch-grid` kind is not in its list. So it fails loudly, not
half-working. The Homey plugin's README names the first Calvin version that
supports it. A real minimum-host-version check is a separate follow-up.

## Left to the builder

- Exact names (`actions`, `perform_action`, `set_onoff`, the error class), how
  `SchemaRenderer` passes the action function, the rate-limit mechanism, and
  whether the scan and field land in the frontend PR or their own.
- Tile layout and visual details within the doctrine; a mock in
  `docs/design/mocks/` before building the renderer is recommended.
- Homey API details, verified against Athom's documentation.

## Open questions for the owner

None. (Answered 2026-11-16: the hub is a Homey Pro.)
