# Homey Switch Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Load the `calvin-plugin-contract` skill before any task in Part 1 or Part 3.

**Goal:** Wall-screen tiles that switch chosen Homey devices on and off, built on a new, general plugin action path in Calvin.

**Architecture:** Plugins declare `actions` in `PluginMetadata`; a new public route `POST /api/plugins/{plugin_id}/actions/{action}` validates the call and hands it to `ServicePlugin.perform_action`. A built-in `switch-grid` renderer draws tiles from `fetch()` and runs each tile's declared action through a function `SchemaRenderer` gives it. Settings pick devices with a new `multi-select-scan` field backed by an admin-only scan that sees the form's config with secrets filled server-side. The Homey plugin (calvin-plugins) uses the Homey Pro local API and enforces the device allowlist.

**Tech Stack:** FastAPI, Pydantic v2, pytest; Vue 3 (`<script setup>`), vue-query, vitest, Playwright; httpx in the plugin.

**Spec:** [docs/superpowers/specs/2026-11-16-homey-switch-tiles-design.md](../specs/2026-11-16-homey-switch-tiles-design.md). Read it with this plan; section numbers below (§1–§5) refer to it.

## Global Constraints

- `api_version` stays `1`. A plugin without `actions` loads exactly as before.
- Parameters are a string or a boolean, required or not. Unknown parameters are rejected.
- Host checks, in order: instance exists, is a service plugin, is enabled (404/409 as `/data`); action declared (404); params match (422). Only then `perform_action`.
- `PluginActionError` → 502 with its plain-words message; any other exception → generic 500 with no exception text.
- The action route is the only route made public (`PUBLIC_WRITES`). Rate limit: 5 actions per second per instance; excess is 429.
- Each action is logged at info level with instance, action and params, never with config.
- The Homey key (any secret) never reaches a browser: not in `/data`, action responses, scan responses or logs.
- A device not chosen in Settings can never be switched through Calvin, by any request.
- A tap never looks like it worked when it did not; the tile ends in the real state.
- Tile states read "On", "Off", "Not responding"; refusal reads "Can't be switched from here"; reach failure reads "Couldn't reach Homey".
- `display_schema.poll_interval_ms` for Homey: 15000. Homey `fetch()` cache: 2 s per instance, cleared by an action.
- Chosen devices are stored as one comma-separated string of ids, parsed by one helper (split, trim, drop empties).
- Homey Pro local Web API only; Homey Bridge is not supported. Endpoint details come from Athom's public documentation, never invented.
- No hostnames, IPs, home paths or real device names in code, fixtures, docs or PR text. Fixtures use names like "Lamp A" and ids like `00000000-0000-4000-8000-000000000001`.
- Frontend follows `docs/design/frontend-doctrine.md`: role tokens only, focus never lost, zero motion under `prefers-reduced-motion`, `components/ui/` blocks, every target ≥ `--touch-target`.
- Every PR targets `develop`. Conventional Commits, scopes `backend`, `frontend`, `plugins`, `docs`. No AI attribution; `scripts/check-commit-attribution.sh origin/develop..HEAD` passes before each push.
- Run every build, test, lint and type-check through `lane-heavy`, one at a time.

## Decisions this plan makes (design's "my call" / "left to the builder")

| Point | Decision |
|---|---|
| Names | `PluginMetadata.actions: list[PluginActionSpec]`; `PluginActionSpec{name, label?, params: dict[str, ActionParamSpec]}`; `ActionParamSpec{type: "string" \| "boolean", required: bool = True}`; `ServicePlugin.perform_action(name, params) -> dict`; errors `PluginActionError` (502) and its subclass `PluginActionRefused` (403), in a new `app/plugins/actions.py`. Homey action `set_onoff` with params `device` (string) and `on` (boolean). The existing, unrelated `ui_actions` (settings buttons) is untouched. |
| Action name shape | `^[a-z][a-z0-9_]{0,63}$`; param names the same. String params are capped at 256 characters (422 beyond), so an open route cannot carry large bodies to a plugin. Types are strict: `"true"` is not a boolean. |
| Which families | Only `ServicePlugin` subclasses may declare `actions`; the loader rejects the rest. |
| Not running | The action route does not start an instance: an enabled but not-running instance is 409 (the next `/data` poll restarts it, as today). |
| Response shape | The route returns `perform_action`'s dict unchanged. The `switch-grid` convention is `{"item": {...}}` in the same shape as a `fetch()` item. |
| Rate limit | In-memory sliding window per instance id (`ActionRateLimiter`, 5 per 1.0 s, injectable clock), checked after validation, right before `perform_action`. 429 body `{"code": "rate_limited", ...}`, header `Retry-After: 1`. |
| Plugin error text | Passed through to the caller, trimmed to 200 characters. The docs tell authors it is shown on screen and must hold no secrets. |
| How renderers act | `SchemaRenderer` passes a `run-action` prop (a function `(action) => Promise<object>`), built by a new composable `usePluginAction(pluginId)`. Renderers stay free of API code and take a stub in tests. |
| After an action | `usePluginAction` patches the `["plugin-data", id]` cache with the returned item (matched by `id`) and then invalidates that query. It does not use `useServiceDataRefresh`, which also reloads the whole service list on every tap. |
| Pending/unavailable tiles | `aria-disabled="true"` and the click ignored, not the `disabled` attribute, so a focused tile keeps focus when its state flips. Pending label is the verb plus "…" ("Turning on…"), per the doctrine. A poll that lands while a tile is pending does not overwrite the pending tile. |
| Failure copy | The renderer is not Homey-aware: reach failures show `display_schema.unreachable_text` (default "Couldn't reach it."); Homey sets "Couldn't reach Homey". A 403 `plugin_action_refused` shows "Can't be switched from here" and the tile turns unavailable until the next data. A 429 shows "Too many taps. Try again in a moment." Notes appear in one polite live region per grid and clear after 6 s or the next successful tap. |
| Device picking | **Smaller way than the design's instance GET (allowed by §4):** `POST /api/plugins/{plugin_id}/scan` with body `{field, config, instance_id?}`, calling a new optional classmethod `scan_options_with_config(field_key, config)`. As an unsafe method it is admin-only by the default-deny policy with no table edit, so `ADMIN_READS` is not touched; a dedicated test pins the anonymous 401. Secrets left blank are filled from storage through the existing `_keep_stored_type_secrets`, which already refuses a stored key when the address changed. It works while creating an instance (address and key typed in the form, not yet saved), which a stored-config GET cannot. The response is filtered by the host to `{options: [{value, label}]}` strings only. The existing `GET .../scan` and `scan_options(field_key)` are unchanged. |
| Field | `ui.component: "multi-select-scan"`, `type: "string"`, a Scan button plus `ChipMultiSelect` (the doctrine's "many of many"); emits the comma-joined ids. Saved ids missing from a scan stay listed, labelled with the id, so nothing is dropped silently. |
| Part 2 size | One PR, as the brief asks; Tasks 2.5–2.6 (scan + field) are a clean split point if review asks for two. |
| Homey instance identity | Default config hash (no `instance_identity`), as §4 says. |
| Homey `fetch()` | One hub call (list devices), filtered and ordered by the chosen list. A chosen device that is missing, lacks `onoff`, or is reported unavailable becomes `state: "unavailable"`, `action: null`, label "Missing device" when the hub has no name for it. |
| Homey `perform_action` | Allowlist check first (refused → `PluginActionRefused`), then set `onoff`, then read the device back and return its item. A failed read-back raises `PluginActionError`, the tile reverts, and the follow-up refetch shows the truth. |
| Mock | Task 2.1 adds a static mock under `docs/design/mocks/switch-grid/` before the renderer is built. |

## Review Focus

1. **A poll refetch landing mid-tap** must not flip a pending tile back; the tile settles only on the action's own response. Test in Task 2.3 (`keeps a pending tile when data changes`).
2. **Two screens tapping the same device** at once: each ends on what its response says, and the invalidation brings both to the hub's truth. Test in Task 2.4 (`patches cache then invalidates`) and Task 3.5 (cache cleared on action).
3. **Instance disabled or deleted while a screen shows its tiles**: the tap gets 404/409 and the tile reverts with the reach note, no crash, no stuck pending. Test in Task 2.3 (`reverts on any non-2xx`) and Task 1.3 (409/404 cases).
4. **Messy device lists** (spaces, trailing commas, duplicates, empty string) parse to a clean ordered list without duplicates. Test in Task 3.3.
5. **Wrong-typed params from a script** (`"on": "true"`, `"on": 1`, a 10 kB string, an extra key) are 422 before any plugin code runs. Test in Task 1.2 and Task 1.3.

---

## Part 1 — Calvin host: actions contract, route, policy, tests, docs (PR 1)

Branch from `develop`: `feat/plugin-actions`. PR title `feat(backend): declared plugin actions and a public action route`.

Check commands for this part (from `backend/`, each through `lane-heavy`):

```bash
lane-heavy uv run ruff check .
lane-heavy uv run ruff format --check .
lane-heavy uv run mypy app --ignore-missing-imports
lane-heavy uv run pytest -q
```

### Task 1.1: Contract model — `actions` on `PluginMetadata`

**Files:**
- Modify: `backend/app/plugins/definitions.py` (new models near `ActionDefinition`, new field on `PluginMetadata`)
- Test: `backend/tests/unit/test_plugin_definitions.py`

**Interfaces:**
- Produces: `ActionParamSpec(type: Literal["string","boolean"], required: bool = True)`, `extra="forbid"`; `PluginActionSpec(name: str, label: str | None = None, params: dict[str, ActionParamSpec] = {})`, `extra="forbid"`; `PluginMetadata.actions: list[PluginActionSpec] = []`; `PluginMetadata.action(name: str) -> PluginActionSpec | None`.

- [ ] **Step 1: Write the failing tests**

```python
def test_metadata_without_actions_has_empty_list():
    assert PluginMetadata(type_id="x", name="X").actions == []

def test_actions_parse_and_lookup():
    md = PluginMetadata(type_id="x", name="X", actions=[
        {"name": "set_onoff", "params": {"device": {"type": "string"}, "on": {"type": "boolean"}}}])
    assert md.action("set_onoff").params["on"].type == "boolean"
    assert md.action("set_onoff").params["device"].required is True
    assert md.action("nope") is None

@pytest.mark.parametrize("bad", [
    {"name": "Set-OnOff"}, {"name": ""}, {"name": "a" * 65},
    {"name": "ok", "params": {"x": {"type": "number"}}},
    {"name": "ok", "params": {"Bad Key": {"type": "string"}}},
    {"name": "ok", "extra": 1},
])
def test_invalid_action_specs_fail_load(bad):
    with pytest.raises(ValidationError):
        PluginMetadata(type_id="x", name="X", actions=[bad])

def test_duplicate_action_names_fail_load():
    with pytest.raises(ValidationError):
        PluginMetadata(type_id="x", name="X", actions=[{"name": "a"}, {"name": "a"}])
```

- [ ] **Step 2: Run to verify failure** — `lane-heavy uv run pytest tests/unit/test_plugin_definitions.py -q` → FAIL (`actions` is an unknown field under `extra="forbid"`).
- [ ] **Step 3: Implement** the two models and the field in `definitions.py`. Name pattern `^[a-z][a-z0-9_]{0,63}$` for action and param names (a `field_validator`); duplicate names rejected in a `model_validator`.
- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `feat(backend): declare plugin actions in PluginMetadata`.

### Task 1.2: Action helpers — param validation, errors, rate limiter

**Files:**
- Create: `backend/app/plugins/actions.py`
- Test: `backend/tests/unit/test_plugin_actions.py`

**Interfaces:**
- Consumes: `PluginActionSpec` (Task 1.1).
- Produces:
  - `class PluginActionError(Exception)` with `.message: str` (plain words, shown on screen).
  - `class PluginActionRefused(PluginActionError)` (host maps to 403).
  - `class ActionParamsError(ValueError)` with `.errors: list[str]`.
  - `validate_action_params(spec: PluginActionSpec, params: Any) -> dict[str, str | bool]` — returns a new dict holding only declared keys.
  - `class ActionRateLimiter(limit: int = 5, window: float = 1.0, clock: Callable[[], float] = time.monotonic)` with `allow(key: str) -> bool`; module singleton `action_rate_limiter`.
  - `MAX_STRING_PARAM = 256`, `MAX_ERROR_MESSAGE = 200`.

- [ ] **Step 1: Write the failing tests**

```python
SPEC = PluginActionSpec(name="set_onoff", params={
    "device": ActionParamSpec(type="string"), "on": ActionParamSpec(type="boolean"),
    "note": ActionParamSpec(type="string", required=False)})

def test_valid_params_pass_through():
    assert validate_action_params(SPEC, {"device": "d1", "on": True}) == {"device": "d1", "on": True}

@pytest.mark.parametrize("params", [
    {"device": "d1"},                          # missing required
    {"device": "d1", "on": "true"},            # string is not boolean
    {"device": "d1", "on": 1},                 # int is not boolean
    {"device": 5, "on": True},                 # int is not string
    {"device": "d1", "on": True, "x": 1},      # unknown key
    {"device": "a" * 257, "on": True},         # too long
    ["device"], None,                          # not an object
])
def test_invalid_params_raise(params):
    with pytest.raises(ActionParamsError):
        validate_action_params(SPEC, params)

def test_rate_limiter_allows_five_per_second_per_key():
    now = [0.0]
    rl = ActionRateLimiter(clock=lambda: now[0])
    assert all(rl.allow("a") for _ in range(5))
    assert rl.allow("a") is False
    assert rl.allow("b") is True
    now[0] = 1.01
    assert rl.allow("a") is True

def test_refused_is_an_action_error():
    assert issubclass(PluginActionRefused, PluginActionError)
```

- [ ] **Step 2: Run to verify failure** — `lane-heavy uv run pytest tests/unit/test_plugin_actions.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement** `app/plugins/actions.py`. The limiter keeps a `deque` of timestamps per key and drops ones older than `window`; cap tracked keys (drop keys whose deque emptied) so it cannot grow without bound.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): validate plugin action params and rate-limit actions`.

### Task 1.3: `perform_action` hook and the loader check

**Files:**
- Modify: `backend/app/plugins/protocols.py` (`ServicePlugin`)
- Modify: `backend/app/plugins/loader.py` (`register_module`)
- Test: `backend/tests/unit/test_plugin_loader.py`

**Interfaces:**
- Consumes: `PluginMetadata.actions` (1.1), `PluginActionError` (1.2).
- Produces: `async def ServicePlugin.perform_action(self, name: str, params: dict[str, Any]) -> dict[str, Any]` (base raises `PluginActionError("This plugin has no actions.")`); `plugin_implements_actions(cls) -> bool` in `loader.py` (`cls.perform_action is not ServicePlugin.perform_action`).

- [ ] **Step 1: Write the failing tests** — build throwaway modules with `types.ModuleType` and `register_module`:
  - `test_actions_without_perform_action_rejected`: a `ServicePlugin` with `actions=[{"name":"go"}]` and no override → `TypeError` matching `"declares actions but does not implement perform_action"`.
  - `test_perform_action_without_actions_rejected`: override but `actions=[]` → `TypeError` matching `"implements perform_action but declares no actions"`.
  - `test_actions_on_non_service_plugin_rejected`: a `BackendPlugin` with `actions` → `TypeError` matching `"only service plugins"`.
  - `test_plugin_without_actions_loads_unchanged`: a plain `ServicePlugin` registers.
- [ ] **Step 2: Run to verify failure** — `lane-heavy uv run pytest tests/unit/test_plugin_loader.py -q` → FAIL.
- [ ] **Step 3: Implement** the base method and the three checks in `register_module`, after the family check and before registering.
- [ ] **Step 4: Run to verify pass** → PASS, and `lane-heavy uv run pytest tests/unit/test_display_kind_sync.py tests/unit/test_plugin_contract.py -q` still PASS.
- [ ] **Step 5: Commit** — `feat(backend): perform_action hook, checked at plugin load`.

### Task 1.4: The action route and its place in `PUBLIC_WRITES` — **HIGH RISK**

**Files:**
- Create: `backend/app/api/routes/plugins/actions.py`
- Modify: `backend/app/api/routes/plugins/__init__.py` (include the router)
- Modify: `backend/app/security/route_policy.py` (`PUBLIC_WRITES`)
- Test: `backend/tests/integration/test_api_plugin_actions.py` (new)
- Test: `backend/tests/integration/test_route_policy.py`

**Interfaces:**
- Consumes: 1.1–1.3; `plugin_manager`, `PluginDB`, `internal_error` (`app/utils/errors.py`), `_require_valid_id` pattern from `management.py`.
- Produces: `POST /api/plugins/{plugin_id}/actions/{action}`, body `PluginActionRequest{params: dict[str, Any] = {}}` (`extra="forbid"`), response `dict[str, Any]`. Error bodies `{"code", "message"}` with codes `plugin_not_found` (404), `plugin_disabled` / `plugin_stopped` (409), `unknown_action` (404), `invalid_action_params` (422), `rate_limited` (429), `plugin_action_refused` (403), `plugin_action_failed` (502), `plugin_action_error` (500, generic text).

- [ ] **Step 1: Write the failing route tests** in `test_api_plugin_actions.py`, marked `pytestmark = pytest.mark.no_admin_login` (every case runs anonymous), with a fake plugin modelled on `MockServicePluginForAPI` in `test_api_plugins.py` that declares `set_onoff(device: string, on: boolean)` and records calls:
  - `test_anonymous_action_runs_and_returns_plugin_dict` → 200, body equals the fake's `{"item": {...}}`, the fake saw `("set_onoff", {"device": "d1", "on": True})`.
  - `test_unknown_instance_404`, `test_non_service_instance_404`, `test_disabled_instance_409`, `test_stopped_instance_409_and_not_started` (fake `initialize_calls == 0`).
  - `test_undeclared_action_404_and_plugin_not_called`.
  - `test_bad_params_422_and_plugin_not_called` parametrized over the Task 1.2 bad cases plus a body with a top-level extra key.
  - `test_refused_maps_to_403_with_message`, `test_action_error_maps_to_502_with_message`, `test_long_error_message_trimmed_to_200`.
  - `test_other_exception_is_generic_500` → body message contains no exception text (raise `RuntimeError("secret-value")`, assert `"secret-value" not in response.text`).
  - `test_sixth_action_in_a_second_is_429` (monkeypatch the limiter clock), with `Retry-After: 1`.
  - `test_action_logged_without_config`: fake instance config holds `api_key="k-123"`; capture loguru output; assert the info line has instance, action and params, and `"k-123"` appears nowhere.
- [ ] **Step 2: Write the failing policy tests** in `test_route_policy.py`:

```python
def test_plugin_action_route_is_a_public_write():
    assert ("POST", "/api/plugins/{plugin_id}/actions/{action}") in PUBLIC_WRITES

def test_only_fetch_and_actions_are_public_plugin_writes():
    plugin_writes = {e for e in PUBLIC_WRITES if e[1].startswith("/api/plugins")}
    assert plugin_writes == {
        ("POST", "/api/plugins/{plugin_id}/fetch"),
        ("POST", "/api/plugins/{plugin_id}/actions/{action}"),
    }
```

- [ ] **Step 3: Run to verify failure** — `lane-heavy uv run pytest tests/integration/test_api_plugin_actions.py tests/integration/test_route_policy.py -q` → FAIL (404 route missing; policy asserts fail; `test_every_unsafe_route_needs_admin` is still green because the route does not exist yet).
- [ ] **Step 4: Implement the route** with the checks in exactly the spec's order (Global Constraints), then the limiter, then the info log `logger.info("Plugin action {action} on {instance} params={params}", ...)` with the *validated* params, then `perform_action`. Map `PluginActionRefused` before `PluginActionError`. Add the `PUBLIC_WRITES` entry with a comment: "Runs only an action the plugin declared, with params the host validated; the plugin enforces its own allowlist (homey switch tiles §2)."
- [ ] **Step 5: Run to verify pass** — same command → PASS; then the full backend suite.
- [ ] **Step 6: Dedicated security review (required before commit lands in the PR).** A fresh reviewer gets only the diff of this task, the spec's Anti-goals and §2, and `route_policy.py`. Checklist: (a) the template string in `PUBLIC_WRITES` equals the route's `path_format` exactly; (b) no code path calls `perform_action` before all four checks; (c) params passed to the plugin are the validated copy, not the raw body; (d) no response or log line can contain config or exception text; (e) a bearer key of any scope gets no more than an anonymous caller here; (f) `HostOriginMiddleware` still applies (no exemption added). Fix findings, re-run Step 5.
- [ ] **Step 7: Commit** — `feat(backend): public route to run a declared plugin action`.

### Task 1.5: OpenAPI snapshot, generated types and docs

**Files:**
- Modify: `backend/tests/contract/openapi.json` (regenerated)
- Modify: `frontend/src/api/types.ts` (generated; never hand-edited)
- Modify: `docs/plugins/PLUGIN_INTERFACE.md` (field table: `actions`; hooks: `perform_action`; errors; route table row)
- Modify: `.claude/skills/calvin-plugin-contract/SKILL.md` (one bullet for `actions`/`perform_action`, mirroring the `icon` bullet's "purely additive" wording)
- Modify: `CLAUDE.md` "Contract (backend)" data-verbs line (add `perform_action`)

- [ ] **Step 1: Run to verify the snapshot fails** — `lane-heavy uv run pytest tests/contract/test_openapi_snapshot.py -q` → FAIL (new route).
- [ ] **Step 2: Regenerate** — `UPDATE_OPENAPI_SNAPSHOT=1 lane-heavy uv run pytest tests/contract/test_openapi_snapshot.py -q`, then `cd ../frontend && lane-heavy npm run gen:api`. Inspect the diff: only the new route and its request model.
- [ ] **Step 3: Write the docs.** PLUGIN_INTERFACE.md states: error messages are shown on screen to anyone and must hold no secrets; the returned dict is served to anonymous callers; the plugin must enforce its own allowlist because the host cannot.
- [ ] **Step 4: Verify** — snapshot test PASS; `cd frontend && lane-heavy npm run type-check`; from `backend/`: `lane-heavy uv run mkdocs build --strict --config-file ../mkdocs.yml`.
- [ ] **Step 5: Commit** — `docs(plugins): document declared actions and perform_action`, then run the Part 1 checks, `scripts/check-commit-attribution.sh origin/develop..HEAD`, push, open PR 1 into `develop`.

---

## Part 2 — Calvin frontend: `switch-grid`, action plumbing, scan and field (PR 2)

Branch from `develop` after PR 1 merges: `feat/switch-grid`. PR title `feat(frontend): switch-grid renderer, plugin actions and multi-select scan`.

Check commands (from `frontend/`, each through `lane-heavy`; backend ones from Part 1 for Task 2.5):

```bash
lane-heavy npm run lint
lane-heavy npx prettier --check "src/**/*.{js,jsx,vue,json,css}"
lane-heavy npm run type-check
lane-heavy npx vitest run
lane-heavy npm run build
E2E_PORT=5187 PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" lane-heavy npm run test:e2e:a11y
```

### Task 2.1: Tile mock

**Files:**
- Create: `docs/design/mocks/switch-grid/index.html` (static, uses theme role tokens copied as CSS vars; no real device names)

- [ ] **Step 1:** Draw 6 tiles in two groups ("Group A", "Group B"): on, off, pending ("Turning on…"), not responding, refused note, reach-failure note in the live region; at 1280 and 390 wide, light and one dark theme. Tile ≥ 2 × `--touch-target` tall; on = the doctrine's "Selected / on" fill (`color-mix(--focus 16%, --bg-2)` + `--focus` border); off = `--bg-2` with `--line`; not responding = disabled treatment with the words, never colour alone.
- [ ] **Step 2:** Screenshot it into the PR description later; commit — `docs(design): switch-grid tile mock`.

### Task 2.2: Register the `switch-grid` kind

**Files:**
- Modify: `backend/app/plugins/definitions.py` (`SUPPORTED_DISPLAY_KINDS` += `"switch-grid"`)
- Modify: `frontend/src/components/plugins/rendererRegistry.js`
- Create: `frontend/src/components/plugins/renderers/SwitchGrid.vue` (skeleton that renders the items' labels; filled in 2.3)
- Test: `backend/tests/unit/test_display_kind_sync.py` (existing, must stay green)

- [ ] **Step 1: Failing test** — add to `test_plugin_definitions.py`: `PluginMetadata(type_id="x", name="X", display_schema={"kind": "switch-grid"})` loads. Run `lane-heavy uv run pytest tests/unit/test_plugin_definitions.py -q` → FAIL.
- [ ] **Step 2: Implement** both registrations and the skeleton.
- [ ] **Step 3: Verify** — `lane-heavy uv run pytest tests/unit/test_plugin_definitions.py tests/unit/test_display_kind_sync.py -q` → PASS.
- [ ] **Step 4: Commit** — `feat(frontend): register the switch-grid renderer kind`.

### Task 2.3: `SwitchGrid.vue` behaviour

**Files:**
- Modify: `frontend/src/components/plugins/renderers/SwitchGrid.vue`
- Test: `frontend/tests/unit/components/plugins/SwitchGrid.spec.js` (new)

**Interfaces:**
- Consumes props: `schema` (`{kind, data_path = "$.items", unreachable_text?, poll_interval_ms?}`), `data`, `runAction: (action: {name, params}) => Promise<object>` (default rejects).
- Item shape: `{id: string, label: string, group?: string, state: "on" | "off" | "unavailable", action: {name, params} | null}`.
- `runAction` rejects with an error carrying `response.status` and `response.data.code` (axios shape).

- [ ] **Step 1: Write the failing tests** (mount with `@vue/test-utils`, stub `runAction` with a controllable promise):
  - `renders one button per item with aria-pressed and state words` — on → `aria-pressed="true"`, text "On"; off → `"false"`, "Off"; unavailable → no `aria-pressed`, `aria-disabled="true"`, "Not responding".
  - `groups tiles under their group heading in first-seen order`.
  - `tap shows the target state with a pending label at once` — after click on an off tile: text "Turning on…", `aria-busy="true"`, `aria-disabled="true"`, `runAction` called with the item's `action`.
  - `second tap while pending is ignored`.
  - `settles on the state the response returns` — resolve `{item: {...state: "off"}}` for a tile tapped to on → shows "Off" (the real state wins).
  - `keeps a pending tile when data changes` — while pending, `setProps({data})` with the old state → still "Turning on…".
  - `reverts on any non-2xx and announces the reach note` — reject with status 502 → previous state, live region (`role="status"`, `aria-live="polite"`) text `"<label>: <unreachable_text>"`; default text "Couldn't reach it." when the schema has none.
  - `403 plugin_action_refused shows refusal and turns the tile unavailable` — "Can't be switched from here", `aria-disabled="true"`, until new `data` arrives.
  - `429 shows the try-again note`.
  - `focus stays on the tapped tile through pending and settle` — `document.activeElement` is the same button after settle.
  - `empty items render EmptyState with schema.empty_text`.
- [ ] **Step 2: Run to verify failure** — `lane-heavy npx vitest run tests/unit/components/plugins/SwitchGrid.spec.js` → FAIL.
- [ ] **Step 3: Implement.** Local state: `pending: Map<id, targetState>`, `override: Map<id, state>` (refusals), `note: string`. Displayed state = pending ?? override ?? item.state. Target state for the pending label: `"on"` if current is off, else `"off"`. Grid: CSS grid `repeat(auto-fit, minmax(var(--switch-tile-min), 1fr))` with a component token `--switch-tile-min` built from `--touch-target`; tile `min-height: calc(var(--touch-target) * 2)`; role tokens only; transitions use `--dur-fast` and are zero under `prefers-reduced-motion`; `InlineNote` (tone `err`) inside the live region; `EmptyState` for none. No `axios` import here.
- [ ] **Step 4: Run to verify pass** → PASS; then `lane-heavy npx vitest run tests/unit/styles` (token, role and control lints) → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): switch-grid tiles with pending, settle and failure states`.

### Task 2.4: Action plumbing — `usePluginAction` and `SchemaRenderer`

**Files:**
- Create: `frontend/src/composables/usePluginAction.js`
- Modify: `frontend/src/services/pluginsApi.js` (add `runPluginAction`)
- Modify: `frontend/src/components/plugins/SchemaRenderer.vue` (pass `:run-action`)
- Test: `frontend/tests/unit/composables/usePluginAction.spec.js` (new)
- Test: `frontend/tests/unit/components/plugins/Renderers.spec.js` (SchemaRenderer passes the prop)

**Interfaces:**
- Produces: `runPluginAction(instanceId: string, name: string, params: object) => Promise<object>` — `api.post(`/plugins/${instanceId}/actions/${name}`, { params })` with `unref` on the id (CLAUDE.md gotcha); `usePluginAction(pluginId: Ref<string> | string) => (action: {name, params}) => Promise<object>`.

- [ ] **Step 1: Write the failing tests** (mock `@/services/pluginsApi`, real `QueryClient`):
  - `posts the action for the unref'd id` — called with `("inst-1", "set_onoff", {device: "d1", on: true})`, never `[object Object]`.
  - `patches cache then invalidates` — seed `["plugin-data","inst-1"]` with two items; resolve `{item: {id:"d1", state:"on"}}`; cache item `d1` is now on, `d2` unchanged, and `invalidateQueries` was called with key `["plugin-data","inst-1"]`.
  - `invalidates even when the action fails, and rethrows`.
  - `SchemaRenderer passes runAction to the renderer` (in `Renderers.spec.js`).
- [ ] **Step 2: Run to verify failure** — `lane-heavy npx vitest run tests/unit/composables/usePluginAction.spec.js tests/unit/components/plugins/Renderers.spec.js` → FAIL.
- [ ] **Step 3: Implement.** In `SchemaRenderer`, build `runAction` from `usePluginAction(() => props.pluginId)` and pass it to every renderer (others ignore it); tolerate no `QueryClient` (gallery, bare tests) by skipping the cache steps.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): run plugin actions from schema renderers`.

### Task 2.5: Scan with form config — `POST /api/plugins/{plugin_id}/scan` — **HIGH RISK (secret handling)**

**Files:**
- Modify: `backend/app/plugins/base.py` (new classmethod)
- Modify: `backend/app/api/routes/plugins/management.py` (new route next to `scan_plugin_options`)
- Test: `backend/tests/integration/test_api_plugin_scan_config.py` (new)
- Test: `backend/tests/integration/test_route_policy.py`
- Modify: `backend/tests/contract/openapi.json`, `frontend/src/api/types.ts` (regenerated)
- Modify: `docs/plugins/PLUGIN_INTERFACE.md` (hook + route rows)

**Interfaces:**
- Produces: `@classmethod async def scan_options_with_config(cls, field_key: str, config: dict[str, Any]) -> dict[str, Any] | None` (default `None`); route `POST /api/plugins/{plugin_id}/scan`, body `ScanWithConfigRequest{field: str, config: dict[str, Any] = {}, instance_id: str | None = None}` (`extra="forbid"`), response `{"options": [{"value": str, "label": str}], "error"?: str}`.

- [ ] **Step 1: Write the failing tests** with a fake type registered through the loader whose `scan_options_with_config` records the config it got and returns options plus a stray key (`{"options": [{"value": "a", "label": "A", "config": {...}}], "token": "x"}`):
  - `test_anonymous_post_scan_is_401_admin_required` (marked `no_admin_login`) — and the fake was not called.
  - `test_blank_secret_filled_from_stored_instance` — stored instance has `api_key="stored"`, request sends `api_key=""` and `instance_id` → the fake saw `"stored"`.
  - `test_changed_host_with_blank_secret_is_400_and_not_called` (relies on `check_secret_endpoint`).
  - `test_new_instance_uses_typed_secret` — no `instance_id`, typed key reaches the fake.
  - `test_response_has_only_value_label_strings` — no `config`, no `token`, values coerced to `str`.
  - `test_plugin_exception_gives_generic_error` — no exception text in the body.
  - `test_type_without_hook_returns_unsupported`.
  - In `test_route_policy.py`: `test_post_scan_is_not_public` asserts `("POST", "/api/plugins/{plugin_id}/scan") not in PUBLIC_WRITES`; `test_get_scan_still_admin_read` asserts the GET is still in `ADMIN_READS`.
- [ ] **Step 2: Run to verify failure** — `lane-heavy uv run pytest tests/integration/test_api_plugin_scan_config.py tests/integration/test_route_policy.py -q` → FAIL.
- [ ] **Step 3: Implement.** `normalize_plugin_config(body.config)` → `_keep_stored_type_secrets(plugin_id, config, body.instance_id)` → hook → filter. Log at debug with plugin id and field only.
- [ ] **Step 4: Run to verify pass** → PASS; regenerate the snapshot and types as in Task 1.5 Step 2; full backend suite.
- [ ] **Step 5: Dedicated security review.** Fresh reviewer, given only this diff, the spec's Anti-goals and §4, and `secrets.py`. Checklist: (a) no path returns, logs or echoes `config`; (b) a stored secret is never sent to an address other than the stored one (endpoint check runs before the hook); (c) `instance_id` from another plugin type cannot leak that type's secrets (`_keep_stored_type_secrets` filters by `type_id`; add a test if missing); (d) the route is not in `PUBLIC_WRITES` and anonymous gets 401; (e) options are strings only. Fix findings, re-run Step 4.
- [ ] **Step 6: Commit** — `feat(backend): admin scan that sees the form's config, secrets kept server-side`.

### Task 2.6: `multi-select-scan` field

**Files:**
- Modify: `frontend/src/components/PluginFieldRenderer.vue` (new branch; props `formConfig: Object`, `instanceId: String`)
- Modify: `frontend/src/components/settings/specialized/InstanceModal.vue` (pass `:form-config` = the config it would test with, `:instance-id="editingInstance?.id"`)
- Modify: `frontend/src/services/pluginsApi.js` (`scanWithConfig(pluginId, field, config, instanceId)`)
- Test: `frontend/tests/unit/components/PluginFieldRenderer.spec.js`, `frontend/tests/unit/components/InstanceModal.form.spec.js`

**Interfaces:**
- Consumes: Task 2.5 route.
- Produces: `scanWithConfig(pluginId, field, config, instanceId?) => Promise<{options, error?}>`; the field emits `update` with a comma-joined string of selected values in the order of the option list.

- [ ] **Step 1: Write the failing tests:**
  - `multi-select-scan shows saved ids before scanning` — value `"id-1,id-2"` → two selected chips labelled `id-1`, `id-2`.
  - `scan posts the form config and instance id` — `scanWithConfig` called with `("homey", "devices", {host: "http://h.example", api_key: ""}, "inst-1")`.
  - `selecting chips emits a comma-joined string` — select A then B → `"a,b"`; deselect → `"b"`.
  - `scan error shows an InlineNote and keeps the selection`.
  - `password values from the form are passed blank-or-typed, never re-read from has_value` (the modal sends what the form holds).
  - `InstanceModal passes formConfig and instanceId to fields`.
- [ ] **Step 2: Run to verify failure** — `lane-heavy npx vitest run tests/unit/components/PluginFieldRenderer.spec.js tests/unit/components/InstanceModal.form.spec.js` → FAIL.
- [ ] **Step 3: Implement** with `Button` (secondary, "Scan" / "Scanning…") and `ChipMultiSelect` (`aria-label` = the field label). Use `pluginsApi`, not raw `axios`, for the new call.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): multi-select-scan plugin field`.

### Task 2.7: Gallery, a11y, docs

**Files:**
- Modify: `frontend/src/dev/RendererGallery.vue` (switch-grid panel with every state, `runAction` stub that resolves, rejects 502, rejects 403)
- Modify: `frontend/tests/e2e/a11y/gallery.spec.js` or add `frontend/tests/e2e/a11y/renderer-gallery.spec.js` if the renderer gallery is not yet audited (axe at the existing viewports and themes)
- Modify: `docs/plugins/PLUGIN_FRONTEND_COMPONENTS.md` (switch-grid payload, `unreachable_text`, field `multi-select-scan`), `CLAUDE.md` renderer kind list, `.claude/skills/calvin-plugin-contract/SKILL.md` (kind list if it names kinds)

- [ ] **Step 1: Failing a11y test** for the switch-grid section (axe clean; tiles ≥ 44 px both ways via `boundingBox`). Run `E2E_PORT=5187 PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright" lane-heavy npx playwright test --project=a11y <spec>` → FAIL (section missing).
- [ ] **Step 2: Implement** the gallery entries; run → PASS. Webkit is not run on this machine (missing host library); say so in the PR.
- [ ] **Step 3: Docs**, then `lane-heavy uv run mkdocs build --strict --config-file ../mkdocs.yml` from `backend/`.
- [ ] **Step 4: Commit** — `docs(plugins): switch-grid renderer and multi-select-scan field`.
- [ ] **Step 5:** Run all Part 2 checks, attach screenshots (1280 and 390, light and one dark theme) from the mocked harness to the PR, attribution check, push, open PR 2 into `develop`.

---

## Part 3 — `calvin-plugins/homey` (PR 3, calvin-plugins repo)

Starts after a Calvin release that contains PR 1 and PR 2. Branch `feat/homey` in calvin-plugins, PR into its default branch. Plugin files: `homey/plugin.json`, `homey/plugin.py`, `homey/homey_client.py`, `homey/devices.py`, `homey/test_homey.py`, `homey/README.md`, `homey/API_NOTES.md`.

Check commands (calvin-plugins tests run on the Calvin backend venv; `CALVIN_PLUGINS_DIR` is the calvin-plugins checkout):

```bash
cd <calvin>/backend
lane-heavy uv run pytest "$CALVIN_PLUGINS_DIR/homey" -q
CALVIN_PLUGINS_DIR="$CALVIN_PLUGINS_DIR" lane-heavy uv run pytest tests/integration/test_calvin_plugins_contracts.py -q   # a skip is not a pass
cd "$CALVIN_PLUGINS_DIR" && lane-heavy python scripts/validate_plugins.py && python scripts/rebuild-manifest.py
```

### Task 3.1: Confirm the Homey Pro local API from Athom's documentation

**Files:**
- Create: `homey/API_NOTES.md` (excluded from the package by `*.md`)

- [ ] **Step 1:** From Athom's public developer documentation only (the Homey Web API reference), record: how a local API key is created and which scopes give device read and device control; the base URL form for the local API (scheme, port, path prefix) and whether TLS is self-signed; the auth header; the request and response shape for listing devices (id, name, zone, `capabilitiesObj.onoff.value`, availability field); setting a capability value; reading one device; and the status codes for a bad key and an unknown device. Link each fact to its page. Write "not documented" rather than guessing.
- [ ] **Step 2:** If any of these is not documented, stop and ask the coordinator before Task 3.2; do not test against a real hub.
- [ ] **Step 3: Commit** — `docs(plugins): Homey Pro local API notes`.

### Task 3.2: `HomeyClient` — the only code that talks to the hub

**Files:**
- Create: `homey/homey_client.py`
- Test: `homey/test_homey.py` (`TestHomeyClient`, using `httpx.MockTransport` that answers the paths from 3.1)

**Interfaces:**
- Produces: `@dataclass(frozen=True) HomeyDevice(id: str, name: str, zone: str | None, has_onoff: bool, on: bool | None, available: bool)`; `class HomeyUnreachable(Exception)`, `class HomeyAuthError(Exception)`; `class HomeyClient(base_url: str, api_key: str, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 5.0)` with `async list_devices() -> list[HomeyDevice]`, `async set_onoff(device_id: str, on: bool) -> None`, `async get_device(device_id: str) -> HomeyDevice | None`, `async aclose()`.

- [ ] **Step 1: Failing tests** — `lists devices into HomeyDevice` (zone name resolved as 3.1 documents), `sends the key only in the auth header` (assert on the mock request; key never in the URL), `connect error raises HomeyUnreachable`, `401 raises HomeyAuthError`, `unknown device returns None`, `set_onoff sends a JSON boolean`, `exception messages never contain the key` (`str(exc)` checked).
- [ ] **Step 2: Run to verify failure** → FAIL. **Step 3: Implement.** **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `feat(plugins): Homey Pro local API client`.

### Task 3.3: Chosen-devices helper

**Files:**
- Create: `homey/devices.py`
- Test: `homey/test_homey.py` (`TestChosenDevices`)

**Interfaces:**
- Produces: `parse_device_ids(raw: str | None) -> list[str]` (split on commas, trim, drop empties, drop later duplicates, keep order).

- [ ] **Step 1: Failing tests** — `None`/`""`/`" , ,"` → `[]`; `" a, b ,,a "` → `["a", "b"]`; a single id → `[id]`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: Commit** — `feat(plugins): parse Homey chosen-device list`.

### Task 3.4: Plugin class, settings and scan — **HIGH RISK (secret handling)**

**Files:**
- Create: `homey/plugin.json` (`api_version: 1`, `id: "homey"`, `type: "service"`, `dependencies.packages` only if httpx is not already a host dependency; mirror `mealie/plugin.json` `files`), `homey/plugin.py`
- Test: `homey/test_homey.py` (`TestContractShape`, `TestConfig`, `TestScan`)

**Interfaces:**
- Consumes: Part 1 (`actions`, `PluginActionError`, `PluginActionRefused`), Part 2 (`switch-grid`, `multi-select-scan`, `scan_options_with_config`), 3.2, 3.3.
- Produces: `HomeyServicePlugin(ServicePlugin)` with `metadata`: `type_id="homey"`, `name="Homey"`, `icon="mdi:home-automation"` (only if the frontend's curated icon map has it; otherwise omit `icon`), no `instance_identity`; `instance_config_schema` keys `host` (string, url validation, required, label "Hub address", `ui: {"endpoint": True}`: the field is named `host` and marked as the endpoint, so a stored key is only reused for an unchanged address and the scan route does not fail closed), `api_key` (`type: "password"`, required, label "API key", description naming the two scopes from 3.1), `devices` (string, `ui.component: "multi-select-scan"`, label "Devices"); `actions=[{"name": "set_onoff", "label": "Switch", "params": {"device": {"type": "string"}, "on": {"type": "boolean"}}}]`; `display_schema={"kind": "switch-grid", "data_path": "$.items", "poll_interval_ms": 15000, "unreachable_text": "Couldn't reach Homey", "empty_text": "No devices chosen yet."}`; `ui_actions` save + test as in mealie.

- [ ] **Step 1: Failing tests:**
  - Contract shape as `mealie/test_mealie.py` (discoverable by `PluginLoader`, no module-level hooks, is `ServicePlugin`, metadata values above).
  - `host is an endpoint key and api_key a secret key` — the schema's `host` carries `ui.endpoint: true`; `endpoint_keys(schema)` contains `"host"`, `secret_keys(schema)` is `{"api_key"}` (imports from `app.plugins.utils.secrets`).
  - `validate_config` requires an `http(s)://` host and a non-blank key.
  - `test_connection` makes one `list_devices` read: success → `{"success": True, ...}`; `HomeyAuthError` → `success: False` with "Homey refused the API key."; `HomeyUnreachable` → "Couldn't reach Homey."; the message never contains the key.
  - `TestScan`: `scan_options_with_config("devices", config)` with a stubbed client lists only `has_onoff` devices as `{"value": id, "label": "name (zone)"}` (no zone → just name), sorted by label; other field → `None`; unreachable → `{"options": [], "error": "Couldn't reach Homey."}`; the result never contains the key.
- [ ] **Step 2–4:** fail → implement (client built per call from config in classmethods; per instance in `initialize`, closed in `cleanup`/`configure`, as mealie does) → pass.
- [ ] **Step 5: Dedicated security review.** Fresh reviewer with this diff and the spec's Anti-goals. Checklist: the key appears only in the client's auth header; no log line formats `self.config` or the key; `host` matches the endpoint pattern so a changed address forces re-entry; scan output holds ids and labels only.
- [ ] **Step 6: Commit** — `feat(plugins): Homey plugin settings and device scan`.

### Task 3.5: `fetch()`, cache and `perform_action` — **HIGH RISK (allowlist)**

**Files:**
- Modify: `homey/plugin.py`
- Test: `homey/test_homey.py` (`TestFetch`, `TestAction`)

**Interfaces:**
- Produces: `fetch() -> {"items": [item]}`; `perform_action("set_onoff", {"device", "on"}) -> {"item": item}`; item `{"id", "label", "group", "state", "action"}` with `action = {"name": "set_onoff", "params": {"device": id, "on": state == "off"}}` or `None` when unavailable. Cache TTL constant `FETCH_CACHE_SECONDS = 2.0`, clock injectable.

- [ ] **Step 1: Failing tests** (client stubbed with `AsyncMock`):
  - `fetch returns chosen devices in chosen order with explicit target params`.
  - `missing, non-onoff or unavailable chosen device is unavailable with no action`.
  - `unreachable hub makes every chosen tile unavailable` (fetch does not raise, so the screen keeps its tiles).
  - `two fetches within 2 s make one hub call; after 2 s, two`.
  - `action clears the cache` — fetch, action, fetch → two `list_devices` calls.
  - `action on a device not chosen raises PluginActionRefused and never calls the hub` — including an id removed from `devices` after the screen loaded, and an id differing only by whitespace or case.
  - `action sets onoff then returns the read-back item`.
  - `hub unreachable during action raises PluginActionError("Couldn't reach Homey.")`; `bad key raises PluginActionError("Homey refused the API key.")`.
  - `unknown action name raises PluginActionError` (defence in depth; the host already 404s).
- [ ] **Step 2–4:** fail → implement → pass. Allowlist compare is exact string equality against `parse_device_ids(self.config["devices"])`.
- [ ] **Step 5: Dedicated review.** Fresh reviewer, diff plus Anti-goals 2 and 3: no path reaches `set_onoff` without the allowlist check; returned items carry no config; failures never return a success-shaped item.
- [ ] **Step 6: Commit** — `feat(plugins): Homey on/off tiles with allowlisted switching`.

### Task 3.6: README, manifest, contract test

**Files:**
- Create: `homey/README.md` (what it does; Homey Pro only, Bridge not supported; how to make the API key with the two scopes; "Requires Calvin <first release with PR 1 and PR 2> or later", filled with the real version number; an older Calvin rejects the plugin at load)
- Modify: `plugins.json` (via `scripts/rebuild-manifest.py`)

- [ ] **Step 1:** Write the README; regenerate the manifest; run `scripts/validate_plugins.py` → PASS.
- [ ] **Step 2:** Run the Part 3 check commands, including the Calvin contract test against this checkout (report a skip as a skip).
- [ ] **Step 3: Commit** — `docs(plugins): Homey plugin README and manifest entry`; push; open PR 3. File a follow-up for a real minimum-host-version check (spec §5).

---

## Self-review notes

- Spec coverage: §1 → 1.1–1.3, 1.5; §2 → 1.2, 1.4, 1.5; §3 → 2.1–2.4, 2.7; §4 settings/scan → 2.5, 2.6, 3.4; §4 fetch/action/cache/connection → 3.1, 3.2, 3.5; `test_connection` → 3.4 (one `list_devices` read, `{success, message}`); §5 version safety → 3.6.
- Highest-risk tasks with dedicated review steps: 1.4 (`PUBLIC_WRITES`, route policy), 2.5 (secret handling; replaces the design's `ADMIN_READS` entry, see Decisions), 3.4 (secret handling), 3.5 (allowlist).
