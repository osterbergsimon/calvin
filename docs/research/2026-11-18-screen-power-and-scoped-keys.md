# Screen power from home automation, and scoped API keys

**Date:** 2026-11-18
**Scope:** `backend/app/security/`, `backend/app/api/routes/{auth,kiosks,system}.py`, `backend/app/mcp_server/`,
`backend/app/services/{kiosk_registry,display_power_service,backup}`, `deploy/kiosk-agent/calvin_display_agent.py`,
the Screens and API keys sections of Settings. Research only: no product code changed.

## Recommendation

Give every API key an optional `permissions` list, and make the new automation key a **`read` key with
`permissions: ["screens.power"]`** that the new backend treats as *limited* (no MCP, nothing beyond what an
anonymous caller already gets, plus the routes its permissions open). Storing it under the existing `read`
rank, rather than as a fourth kind, keeps the key file loadable by an older backend, which otherwise throws the
whole file away. Add `PUT /api/kiosks/{kiosk_id}/screen-power` (`{"power": "on" | "off" | "schedule"}`) and a
matching `GET`, both opened by a `PERMISSION_ROUTES` table in `route_policy.py`. Keep the hold **out of the
override layer**: store it in its own per-kiosk registry column, so a Settings save cannot wipe it and a backup
does not carry it to a new server. Project it into the kiosk config response twice: as a new `screenHold` key that
a new agent obeys until it changes, and as a `screenNow` value, so an agent that has not updated still obeys it
until the next schedule change. The agent reports that it understands holds on its config poll, so Settings and
the route can tell when a screen cannot hold yet. The all-in-one display stays out of the first version. About
three to four days of work, with the key loader, the policy table and the agent precedence as the risky parts.

## 1. How it works today

### API keys

- **Storage.** One JSON file, `api-keys.json`, next to `admin-auth.json` (`backend/app/security/api_keys.py:187-195`),
  written atomically with mode 0600 (`api_keys.py:94-108`). Only a SHA-256 of the secret is kept
  (`api_keys.py:41-42`, `:129-137`). Each entry is `{id, name, scope, prefix, hash, created_at, last_used_at}`; the
  file is `{"version": 1, "keys": [...]}` (`api_keys.py:31`, `:98`). The file is re-read on every request, so a
  revoke works on the next call (`api_keys.py:62-63`, `:153-181`).
- **Scopes are ranks.** `SCOPES = ("read", "admin", "host")`, `SCOPE_RANK = {"read": 0, "admin": 1, "host": 2}`
  (`api_keys.py:27-28`). Every check is "rank at least N".
- **The loader is strict.** `_load` validates every entry and, if any entry has a missing field or a scope outside
  `SCOPES`, logs "Corrupt API key file" and returns `[]` (`api_keys.py:84-92`). An unknown *extra* field passes
  untouched. This matters for compatibility (section 2).
- **Per-route authorisation** (`backend/app/security/route_policy.py:303-347`). A bearer key replaces the cookie
  entirely (`:316-335`). For a key:
  - `PUBLIC_WRITES` (`:26-56`): open to every key, as to anonymous callers.
  - `HOST_ROUTES` (`:77-88`): rank `host`. These are checked *after* `PUBLIC_WRITES`, so the all-in-one display
    power routes, which are in both sets, are open to any key and to anonymous callers. Only
    `require_host_control` stops them (`backend/app/utils/host_control.py:24-49`).
  - Any other unsafe method: rank `admin` (`:329-331`).
  - `ADMIN_READS` GETs (`:59-72`): rank `admin` (`:332-334`). Every other GET is public.
  - A bad or revoked key is 401 even on public routes; failures are rate-limited per IP (`:217-242`).
- `is_admin()` treats a key of rank `admin` or above as admin (`route_policy.py:193-198`); handlers use it for
  in-handler checks such as `POST /api/config` (`backend/app/api/routes/config.py:509`) and the kiosk self-write
  `PATCH` (`backend/app/api/routes/kiosks.py:145`).
- **Management** (`backend/app/api/routes/auth.py:360-434`). Create, list and revoke need an admin *session*; any
  key, whatever its scope, gets `403 session_required` (`auth.py:384-389`). The body takes
  `scope: Literal["read", "admin", "host"]` (`auth.py:360-362`). A `host` key cannot be made when host control is off
  (`auth.py:401-408`). Creation is logged with name, scope and prefix (`auth.py:419`); a loguru patcher blanks
  anything shaped like a key in every log line (`backend/app/security/install.py:55-60`).
- **MCP** (`/api/mcp`). The gateway authenticates the bearer with the same store and limiter, refuses
  cookies and anonymous callers (`backend/app/mcp_server/gateway.py:77-102`), and each tool declares a minimum
  rank with `@scoped` (`backend/app/mcp_server/tools.py:70-92`). Read tools include calendar events, photos,
  kiosks and their overrides; admin tools include `set_kiosk_override`; `display_power` is `host`
  (`tools.py:114-421`).
- **Backup and restore do not include Calvin's own keys.** The exporter writes settings, plugins, kiosks with their
  override layers and optionally the kiosk signing key (`backend/app/services/backup/exporter.py:130-190`); it
  never reads `api-keys.json` or `admin-auth.json`. The "Passwords and API keys" option in
  [Backup and restore](../configuration/BACKUP_RESTORE.md#secrets) is about *plugin settings* that hold secrets.
  A restored server therefore has no API keys; an automation key must be minted again after a move.
- **Settings UI** (`frontend/src/components/settings/categories/security/ApiKeysSection.vue`). Three scope cards,
  Read / Admin / Host control (`:197-215`), with a confirmation tick for host (`:91-104`) and a scope chip per key
  (`:153-157`, `:269-270`).

### Screen power on a kiosk

- **What Settings writes.** "Screen now" stores `screenNow: {power, setAt}` in the kiosk's override layer
  (`frontend/src/utils/screenPower.js:215-217`, `ScreensSettings.vue:1368-1373`); "Back to schedule" deletes it
  (`ScreensSettings.vue:1411-1415`). The row computes the expiry itself for the "until 22:00" copy
  (`screenPower.js:176-204`, `ScreensSettings.vue:1341-1365`). `screenNow` is excluded from the settings list
  (`frontend/src/utils/screenOverrides.js:985`).
- **How it is written.** `persist()` sends the *whole* layer, as the page last read it, with
  `kioskOverridesQueue(kioskId).replaceAll(next)` (`ScreensSettings.vue:1463-1468`), which is
  `PUT /api/kiosks/{kiosk_id}/overrides` (`frontend/src/stores/kiosks.js:57`, `backend/app/api/routes/kiosks.py:62-69`).
  The registry replaces the column (`backend/app/services/kiosk_registry.py:700-724`). So any key another writer
  added to the layer after the page loaded is lost on the next save of any screen setting. The `PUT` is admin-only
  by default deny; the public `PATCH` only accepts `showUI` (`route_policy.py:136-140`, `kiosks.py:135-166`).
- **How the agent reads it.** The agent polls `GET /api/kiosks/{kiosk_id}/config` without any credential
  (`calvin_display_agent.py:2520-2560`, `kiosks.py:483-560`). The backend merges household config with the
  override layer, so `screenNow` arrives in the response.
  - `screen_power_override` returns on/off while the override is active; it ends at the first schedule
    boundary after `setAt`, and with no schedule it never ends (`calvin_display_agent.py:156-176`,
    `override_expiry` at `:139-153`).
  - `desired_on` checks the override first, then the schedule (`:179-197`).
  - An override with an unreadable `setAt` or a `power` other than on/off is ignored (`:167-172`).
- **Timing.** The agent polls every `CALVIN_DISPLAY_REFRESH_SECONDS`, 60 s by default (`:2379-2381`, `:3854`), and
  also wakes at the next schedule boundary (`:2692-2695`). So a change reaches the panel within about a minute.
  Waking a cog kiosk restarts the browser (about 5 s more), and a brightness ramp adds its own steps
  ([kiosk install](../setup/KIOSK_INSTALL.md)).
- **Applying.** `reconcile` writes the panel only when the desired state changes or a previous write failed
  (`calvin_display_agent.py:3883-3901`; the brightness controller follows the same rule, `:1068-1080`).
- **Touch while the panel is off depends on the display stack.** On cog the browser is stopped and the
  framebuffer blanked, so a touch does nothing until the next "on". On X11, `xset dpms force off` is normally
  undone by input. Because the agent writes only on a change, a screen woken that way stays lit until the desired
  state changes again. I could not verify the X11 or Wayland behaviour on hardware from the code alone.
- **Old agents.** An agent updates only when an admin asks for it per kiosk (`kiosks.py:169-176`). The next poll
  then carries `agentUpdateRequested` and the agent runs the signed bundle updater (`calvin_display_agent.py:2439-2459`).
  The version an agent reports is a content hash of the bundle files (`backend/app/services/kiosk_bundle.py:205-235`,
  agent `running_version` at `:48-54`), not a release number. The server can tell "same as the bundle it serves"
  from "different", but not whether an agent knows a given feature. Older agents can run for months.

### The all-in-one display

The all-in-one display has no kiosk id and no `screenNow`. When host control is on, the backend's own
`display_power_service` loop re-evaluates the household schedule every 60 s and calls `turn_display_on`/`off`
each time (`backend/app/services/display_power_service.py:56-67`, `:69-167`). With no schedule it turns the display
on every minute (`:82-84`). So `POST /api/system/display/power/off` (`backend/app/api/routes/system.py:758-786`)
lasts at most a minute before the loop undoes it. Today there is no manual override at all on the all-in-one.

## 2. Key scoping model

### What comparable projects do

- **Home Assistant**: long-lived access tokens carry the full rights of the user who made them, with no scopes
  ([auth API](https://developers.home-assistant.io/docs/auth_api)). Restricting tokens is
  a long-standing feature request
  ([community thread](https://community.home-assistant.io/t/support-for-permissions-on-long-lived-access-tokens/190504)).
- **Jellyfin**: server API keys give full administrator access, with no scope
  ([community report](https://support.symfonium.app/t/jellyfin-api-key-login/6061); I found no official page
  that says otherwise).
- **Immich**: since v1.135.0 an API key has a list of named permissions such as `asset.read` and `asset.upload`,
  with `all` as the default; a missing permission is a 403
  ([release notes](https://github.com/immich-app/immich/releases/tag/v1.135.0)).
- **Gitea/Forgejo**: scoped tokens pick read or write per area (`read:repository`, `write:issue`, ...)
  ([Gitea docs](https://docs.gitea.com/development/oauth2-provider)).
- **GitHub fine-grained tokens**: a permission list (read or write per resource), plus a choice of which
  repositories the token can reach
  ([GitHub docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens)).

The pattern that fits a small self-hosted app is Immich's: dotted names (`area.verb`), with broad levels kept as
the default. GitHub's per-resource limit is a separate field, not part of the permission name.

### Options compared

| | (a) Permissions on a new limited key kind | (b) Permissions on every key, ranks become bundles | (c) A new rank below `read` |
|---|---|---|---|
| Fit with `route_policy.py` | One extra table (`PERMISSION_ROUTES`), checked before the "needs admin" branch | Every rank check (`route_policy.py:197`, `:319-334`, `tools.py:82`) becomes a set check; every route and MCP tool needs a permission name | A rank compare breaks: "below read" still passes every `rank >= read` check, so screen power needs a special case anyway |
| Grows to more permissions | Yes | Yes | No: one rank per feature does not compose |
| Old key files | Load unchanged | Need a mapping from rank to bundle at load | Load unchanged |
| A newer file read by an *older* backend | Depends on how it is stored (below) | Same | Old `_load` rejects the unknown rank and drops *all* keys |
| Size | Small | Large (touches every route, every tool, the UI) | Small, but a dead end |

**The storage detail decides it.** The draft stores a limited key with `permissions` *instead of* a rank. An entry
without `scope`, or with a new value such as `"limited"`, makes an older backend's `_load` treat the whole file
as corrupt and return `[]` (`api_keys.py:84-91`). After a rollback, every key then stops working. Worse, the first
key created on the old backend writes a file holding only that key (`create` loads `[]` and writes, `api_keys.py:125-139`),
and every other key is gone for good. A rollback is a normal operation here (the update script keeps a rollback copy, `scripts/update-calvin.sh:51`).

Storing the limited key as **`"scope": "read"` plus `"permissions": ["screens.power"]`** avoids that:

- An older backend loads the file and sees an ordinary read key. That key gets nothing an anonymous LAN caller
  cannot already get over HTTP (every non-`ADMIN_READS` GET and every `PUBLIC_WRITES` route), plus the MCP read
  tools, which return the same kind of data. It loses screen power, so it fails closed.
- Every existing `SCOPE_RANK[key["scope"]]` lookup keeps working, so there is no `KeyError` (a 500) on
  `route_policy.py:197`, `:319` or `tools.py:82`. The draft's fourth kind needs all three changed, plus anything
  added later.
- The new backend treats any key whose entry has a non-empty `permissions` list as **limited**.

**Recommendation: (a), stored this way.** Ranks stay as they are; `permissions` is an optional field; (b) remains
possible later, because a rank can be redefined as a bundle without changing the file again.

### What a limited key gets

- **Public routes** (`PUBLIC_WRITES`, public GETs): the same as an anonymous caller. Refusing them buys nothing,
  because the same request without the header succeeds, and the policy already promises that "a valid key never
  gets less than an anonymous caller" (`route_policy.py:321-323`).
- **Secret-bearing GETs** (`ADMIN_READS`): refused (403 `insufficient_scope`), exactly as for a read key today.
- **Other unsafe routes**: refused unless `(method, path)` is in `PERMISSION_ROUTES` for one of its permissions.
- **`HOST_ROUTES`**: refused (rank is `read`). One existing oddity remains: the all-in-one power routes are also in
  `PUBLIC_WRITES`, so anyone on the LAN can call them. Fixing that is outside this change, and the scheduler undoes
  them within a minute anyway (section 1).
- **MCP**: refused at the gateway with 403 `insufficient_scope` ("this key is limited to: Turn screens on and off").
  That is one check, so no tool can forget it. The owner asked for "nothing else", and MCP is the one place where a
  read key reaches more than an anonymous caller does.
- **Key management and password change**: already session-only (`auth.py:384-389`).

### Keeping old files, backup and restore

- Old entries have no `permissions` field and load as today. `_load` accepts an optional `permissions` list of
  known names. An unknown name is **dropped from that entry with a warning** rather than failing the file, so a
  newer backend's permission never breaks an older one. The key is then simply a limited key without that
  permission. Keep `_FILE_VERSION = 1`; the change is purely additive.
- `_public()` adds `permissions` (and keeps `scope`) so the UI can show "Turn screens on and off" instead of "Read".
- Backup and restore: nothing to change. `api-keys.json` is not in backups (section 1). After a restore, the
  household makes a new automation key and pastes it into the Homey flows. Say this in the
  [Backup and restore](../configuration/BACKUP_RESTORE.md) "Not included" table, which today does not list
  Calvin's own keys or admin password.

### Naming permissions

Dotted `area.verb`, matched exactly, listed in one `PERMISSIONS` dict in `api_keys.py` with a plain-words label for
the UI and the error message: `screens.power` → "Turn screens on and off".

Room to grow, with one rule: **only things that are not already public need a permission.** Photo next/previous,
calendar refresh, plugin fetch and plugin actions are in `PUBLIC_WRITES` today (`route_policy.py:26-56`), so a
`photos.next` or `calendar.refresh` permission would give nothing that the key, or no key at all, does not already
have. Candidates that do mean something: `photos.upload`, `calendar.sources.write`, `screens.settings` (orientation,
start page), and `plugins.actions` if plugin actions ever stop being public. Homey part 2 keeps them public by
design (`docs/superpowers/specs/2026-11-16-homey-switch-tiles-design.md`, "Security").

### Limiting a key to some screens

Possible later as a separate optional field, `kiosks: [ids]` (absent means all), checked by the screen-power
handler against `kiosk_id`, not by encoding ids into permission names. Not in the first version: a household has
a few screens and the automation switches all of them. Leaving the field out now costs nothing, because absent
already means all.

## 3. The screen-power call and the hold

### Shape

- `PUT /api/kiosks/{kiosk_id}/screen-power`, body `{"power": "on" | "off" | "schedule"}`. Use PUT: it sets a
  state, and repeating it is harmless (Homey retries and duplicate flows do no damage). Homey's card offers PUT.
- One route per screen for the first version. The common flow, "nobody home: all screens off", becomes one card
  per screen, which is fine for a few screens. A collection route (`PUT /api/screens/power` with an optional
  `kiosks` list) can come later. Do not use a special id such as `all`: `_KIOSK_ID_RE` accepts it as a real kiosk id
  (`kiosk_registry.py:24`).
- `GET /api/kiosks/{kiosk_id}/screen-power` returns the same body, so Homey can read the state.
- Answers: `200` with
  `{"id", "power": "on"|"off"|"schedule", "held": bool, "setAt", "desiredOn": bool, "online": bool, "agentHolds": true|false|null}`;
  `404` for an unknown screen (never create a row from this route; a bare id must not register a ghost, compare
  `kiosks.py:518-534`); `422` for a bad body; `401`/`403` from the policy. `desiredOn` is what the agent will do;
  the agent does not report the panel's actual state (it reports only "went to sleep", `calvin_display_agent.py:1311-1331`),
  so the answer must not claim the panel *is* off. `agentHolds: false` says this screen's agent is too old to hold
  (it will obey until the next schedule change).
- A request that changes nothing (same power, already held) writes nothing and answers 200, which keeps flooding
  cheap.
- Log one line per change: kiosk id, new power and the key's *name* (`request_api_key(request)["name"]`), never the
  secret (the patcher already redacts secret-shaped text).
- Admin sessions and admin keys may also call it. Settings uses it for "Back to schedule" on a held screen.

### Where the hold lives

| | Extend `screenNow` in the override layer (draft) | Separate key in the layer (e.g. `_screenHold`) | **Own registry column (recommended)** |
|---|---|---|---|
| Survives a Settings save from a page loaded earlier | **No**: `replaceAll` PUTs the page's old copy (`ScreensSettings.vue:1463-1468`) | **No**, same PUT | Yes: the layer PUT never touches it (`set_overrides` writes only `overrides`, `kiosk_registry.py:722-724`) |
| Goes into backups | Yes (`exporter.py:137-140`): a restore brings back a screen held off from the old house state | Yes | No, like `display_check` and the agent status columns |
| Shown to any LAN caller | Yes, via the public `GET /api/kiosks/{id}/overrides` (`kiosks.py:52-59`) | Yes, unless stripped | Only what the config projection exposes |
| Cost | None | Small | An Alembic migration (the pattern exists: `backend/alembic/versions/f6c9d3e4a5b7_kiosk_wifi_power_save.py`) |

Recommended: a nullable JSON column `power_hold` on `KioskDB` (`backend/app/models/db_models.py:152`), holding
`{"power": "on"|"off", "setAt": ISO-UTC, "by": "automation"|"settings"}`. Store the kind of writer, not the key name:
the config response is public, and the key name only needs to be in the log. Add a nullable short string,
`agent_features`, in the same migration (see the next subsection). Write both with `update(_columns=[...])` and
`retry_on_db_locked`, as the other per-column writes do.

`GET /api/kiosks/{kiosk_id}/config` then adds:

- `screenHold: {power, setAt}` (and `screen_hold`, since the agent reads both spellings) when a hold is set;
- `screenNow: {power, setAt}` **replaced by the hold's value** in the *response only*, so an older agent obeys the
  hold until the next schedule boundary after `setAt`, and with no schedule until it changes (section 1);
- nothing in the stored layer changes.

Setting a hold also deletes any `screenNow` from the layer with a column-scoped merge-delete, and `"schedule"`
clears both. Then "back to schedule" really means the schedule, and an old manual choice cannot resurface when a
hold ends.

### How the agent obeys

Precedence in `desired_on`: `screen_hold` → `screen_now` → schedule. A hold has no expiry. `seconds_to_next_boundary`
still wakes the agent at boundaries; that is harmless. The agent adds `kfeat=hold` to its config poll query, next to
`kstack` and `kwifi` (`calvin_display_agent.py:2520-2537`). The backend stores it the way it stores those
(`kiosk_registry.py:83-107`): an older agent sends nothing, which reads as "unknown, assume no". Tests: a held "off"
across an "on" boundary stays off; `"schedule"` restores the schedule on the next poll; with an old-style
`screenNow` only, behaviour is unchanged (the existing `test_display_agent.py:176` cases still pass).

### What an older agent does (must be safe)

It ignores `screenHold` and obeys the projected `screenNow`. A held "off" lasts until the next scheduled "on" (lit
screen in an empty house, today's behaviour), and a held "on" until the next scheduled "off". Nothing is unsafe; it
just does not hold. Settings and the route say so (`agentHolds: false`) and point to the existing "Update" button
for that screen. The draft's claim that the old agent "ignores `hold`" is right only because it keeps the hold in
`screenNow`. With the hold moved to a column, the projection is what keeps that property.

### Settings

On the screen's Power row, when `power_hold` is set: "Off, held by automation" (or "On, held by automation") with
**Back to schedule**, which calls the new route with `"schedule"`. If `agentHolds` is false, add "This screen
needs a software update to hold. Until then it follows the next scheduled change." The row takes `held` and `by`
from `GET /api/kiosks` (`kiosk_registry.list_kiosks`, `kiosk_registry.py:326`), which the Screens page already loads.
A person's own "Turn on/off now" replaces the hold with today's until-next-change override. That matches "holds
until automation or a person changes it" (owner question 2). Copy goes through the plain-words doctrine and the
no-dev-words test.

### The all-in-one display

Out of the first version, with the reason given in the docs: it has no kiosk id, no registry row and no
`screenNow`, and its power is driven by a backend loop that overwrites any manual state every minute (section 1).
Doing it properly means teaching `display_power_service` to read a hold kept in household config (a key such as
`localScreenHold`) and adding a route without a kiosk id (`PUT /api/screen-power`). That is a second, host-acting
path that needs host control on. Worth a follow-up only if the household uses an all-in-one (owner question 5).

## 4. What Homey can call

- **Built-in card.** The Logic "Make a web request" action takes a method (GET, POST, PUT, DELETE), a URL, headers
  and a body. In Advanced Flow there is a variant that also returns **Response** (text) and **Status Code**
  (number) tokens for the next cards. I confirmed this by listing the action cards on a Homey Pro through its MCP
  tools (read-only: card ids `homey:manager:logic:http` and `homey:manager:logic:http_advanced`). So a standard
  flow can send the command; an Advanced Flow can also branch on the answer.
- **Headers format.** Athom's own documentation of the headers field was not found. Community threads report that
  the field takes plain-text lines, `Authorization: Bearer <secret>` on its own line, not JSON
  ([community thread](https://community.homey.app/t/problem-reading-temperature-from-ngenic-via-http-get/69255)).
  For a JSON body, add `Content-Type: application/json` as a second line. **Verify both on a real Homey before
  writing the docs.** If the header handling turns out unreliable, the fallback is a `?power=off` query parameter
  instead of a body.
- **Alternatives.** HomeyScript (Athom's script app) can `fetch()` with any headers and parse JSON. The community
  "HTTP request flow cards" app (`com.internet`) adds request cards and status-code conditions
  ([app page](https://homey.app/en-ca/app/com.internet/)). Neither is needed for this.
- **Webhooks** go the other way (something calling Homey), so they don't help here.
- **Reading state.** Worth having: an arrival flow can skip "on" for a screen a person turned on by hand, and a
  flow can show why a screen is dark. The simplest form is the `GET` above, called from the Advanced Flow card,
  branching on Status Code. Parsing the JSON text needs HomeyScript or a logic app; a short flat body such as
  `{"power":"off","held":true,...}` also works with a plain "text contains" condition. That last part is unverified.

## 5. Security

The new write route is reachable without an admin session. Threats, and how the recommended design answers them
in the terms the existing middleware and tests use:

| Threat | Answer | Test that pins it |
|---|---|---|
| **Leaked automation key** | The key can only switch screens on, off or back to schedule, and read what an anonymous caller can. Revoke works on the next request (the file is re-read). Every change is logged with the key's name. Settings shows `lastUsedAt`. Homey keeps the secret in the flow card, so anyone with admin on the Homey can read it; say that in the docs. | New: limited key → 403 on every unsafe route except its own, by parametrising over `app.routes` like `test_every_unsafe_route_needs_admin` (`backend/tests/integration/test_route_policy.py:50`) |
| **Limited key reaching admin data** | Rank stays `read`, so `ADMIN_READS`, `HOST_ROUTES`, `is_admin()` and in-handler checks refuse it with no new code. MCP refuses limited keys at the gateway. Key management needs a session. | Extend the scope matrix (`backend/tests/unit/security/test_api_key_policy.py:129`) with a `limited` row; new MCP gateway test next to `backend/tests/unit/mcp/test_mcp_auth.py:24-61`; existing `test_keys_cannot_manage_keys` with the limited key added |
| **Cross-site request** | A bearer request skips the Origin check, as today (`test_api_key_policy.py:229`). That is safe because a page on another site cannot know the secret, and an `Authorization` header forces a CORS preflight. A cookie request still gets the Origin check and `SameSite=strict` (`route_policy.py:281-290`). Do **not** add the route to `PUBLIC_WRITES`. | Existing origin tests; add one for the new route with a hostile Origin and the cookie |
| **Foreign Host / DNS rebinding** | `HostOriginMiddleware` runs before the policy for bearer requests too (`backend/app/security/host_origin.py`, `test_bearer_still_gets_the_host_check` at `test_api_key_policy.py:238`). A Homey calling by LAN IP or `.local` name passes. | Existing; add the new route to it |
| **Replay** | Calvin is usually reached over plain HTTP on the LAN, so anyone sniffing the LAN can copy the key and replay it. No nonce scheme is possible with Homey's card. PUT is idempotent, so a replayed request only repeats a state. Answer: document HTTPS through a reverse proxy for households that care, and keep the key's power small. | None (documented risk) |
| **Flooding the route** | The limiter counts only *failed* keys (`route_policy.py:223-236`); a valid key is unlimited. A no-change request writes nothing. Add a small per-key limiter on this route (for example 30 changes a minute, 429 with `Retry-After`, same shape as `rate_limited`). `last_used_at` writes are already throttled (`api_keys.py:170-180`). | New: 31st change in a minute → 429; no-op PUT does not write |
| **Presence leak** | A screen held off says "nobody is home", and the agent's credential-free config poll makes that readable by any LAN client that knows the kiosk id (`GET /api/kiosks` lists ids publicly). This is inherent to a credential-free agent. Keep the key name out of every public view (`by` stores only "automation" or "settings"). | Test that the config and `GET /api/kiosks` responses never contain a key name |
| **Unknown or forged kiosk id** | 404 and no row created; ids are validated with `_KIOSK_ID_RE`. | New |
| **A newer key file on an older backend** | Stored as `read` plus `permissions`, so it loads and fails closed (section 2). | New loader test: an entry with unknown permission names loads; an entry with `permissions` but no other change keeps every other key loading |

The policy-table tests need two additions: every `PERMISSION_ROUTES` entry is a real route
(`test_policy_tables_reference_real_routes`, `test_route_policy.py:126`), and no entry is also in `PUBLIC_WRITES`
or `HOST_ROUTES`.

## 6. Plan sketch

Risky parts are marked ⚠.

**Backend (about 2 days)**

1. ⚠ `api_keys.py`: an optional `permissions` field with `PERMISSIONS = {"screens.power": "Turn screens on and off"}`.
   The loader accepts and filters it, `create(name, scope, permissions=None)` takes it (limited keys are always
   `scope="read"`), `_public()` returns it, and an `is_limited(key)` helper. Tests: old files load byte-for-byte;
   unknown names are dropped, not fatal; a file holding a limited key still loads with the old validation rules
   (write the old `_load` checks into the test).
2. `auth.py`: `CreateKeyBody` gains `permissions: list[Literal["screens.power"]] | None`. The level is fixed to
   `read` whenever permissions are given, so `scope="admin"` with permissions is a 422.
3. ⚠ `route_policy.py`: `PERMISSION_ROUTES = {"screens.power": {("PUT", ".../screen-power"), ("GET", ".../screen-power")}}`.
   In the bearer branch, before the "needs admin" check, a limited key passes a route listed for its permissions.
   The GET is public anyway, so it is listed only to document intent. The policy tests listed in section 5.
4. MCP gateway: refuse limited keys. Test.
5. ⚠ Alembic migration: `kiosks.power_hold` (JSON) and `kiosks.agent_features` (string), both nullable.
   `kiosk_registry`: `get_power_hold`, `set_power_hold`, `clear_power_hold` (column-scoped), record `kfeat`.
6. `kiosks.py`: the PUT/GET route (404, no-op short-circuit, per-key limiter, log line), and the `screenHold` plus
   projected `screenNow` in `get_kiosk_config`. `list_kiosks` gains `powerHold` and `agentHolds`.
7. Run `npm run gen:api` and commit `frontend/src/api/types.ts`.

**Agent (about half a day)**

8. ⚠ `desired_on` precedence with `screen_hold`, and `kfeat=hold` on the poll. Unit tests across boundaries, with and
   without a schedule, and with only the old `screenNow`.

**Frontend (about 1 day)**

9. `ApiKeysSection.vue`: a fourth card, "Turn screens on and off" ("Lets home automation switch screens on and off.
   Can't see or change anything else."). The chip shows the permission label, not "Read". Store and vitest updates.
10. `ScreensSettings.vue`: the held row, "Back to schedule" through the new route, the old-agent note. Vitest plus
    the a11y e2e run, since it is a UI change.

**Docs (about half a day)**

11. `docs/configuration/ADMIN_AUTH.md`: limited keys. A new how-to for home automation with the Homey card
    settings (verified on a real Homey first). Kiosk docs: what a hold is and that an older agent needs an update.
    `BACKUP_RESTORE.md`: Calvin's own keys are not in a backup.

**Size:** about 4 days including review. One medium-risk PR for backend and agent, then a small frontend PR, or
one PR if it is reviewed as high-risk.

**Conflicts with work in flight.** Homey part 2 (`feat/switch-grid`) currently changes
`backend/app/plugins/definitions.py`, `frontend/src/components/plugins/rendererRegistry.js` and a new
`SwitchGrid.vue`. This design touches none of them. The only shared file is likely `route_policy.py` (part 2's
admin-only scan entry is already in `ADMIN_READS` on develop, `route_policy.py:66`). The new table is a separate
block, so a merge conflict there would be trivial. Keep screen power out of the plugin action route: that route
is public by design.

## Where the draft is wrong or weak

1. **"A fourth kind with permissions instead of a rank" breaks rollback.** An older backend drops the whole key
   file, and the first key created there deletes the rest (`api_keys.py:84-91`, `:125-139`). It also leaves three
   `SCOPE_RANK[...]` lookups to raise `KeyError`. Store it as `read` plus `permissions`.
2. **Keeping the hold in `screenNow` inside the override layer is fragile.** Settings writes the whole layer from
   the copy it loaded (`ScreensSettings.vue:1463-1468` → `kiosks.py:62-69`), so any screen-setting save from a page
   opened before the hold silently drops it or brings back an old one. The layer is also in every backup
   (`exporter.py:137-140`). Use its own column and project it into the config response.
3. **"An agent that hasn't updated" needs a signal.** Agent updates are manual per screen, and the version is a
   hash, so the server cannot tell an old agent from a new one without a feature report (`kfeat`). Without it,
   Settings would claim "held" on a screen that will switch at the next boundary.
4. **"A limited key gets what an anonymous caller gets, no MCP"**: right, but the draft does not say how. The MCP
   gateway needs an explicit refusal; with the draft's storage, `@scoped` would crash rather than refuse.
5. **The all-in-one note undersells it.** There is no manual power at all on the all-in-one today; its loop
   overwrites any change within a minute.
6. **Missing threats:** valid-key flooding (only failures are rate-limited), and the presence leak through the
   credential-free config. Keep key names out of public views.
7. **"Touch behaves as during a scheduled off"** is true, but on X11 that means a touch can wake a held-off screen
   and leave it lit indefinitely, because the agent re-applies only on change. The owner should decide (question 1).

## Open questions for the owner

Most important first. My pick is marked ✔.

1. **Touch on a screen that automation holds off.**
   - (a) Same as today: it may wake, depending on the display stack, and stays on until the next change. ✔ for the first version; nobody is home when it is held off.
   - (b) It wakes for a few minutes, then the agent turns it off again (the agent re-applies off).
   - (c) A touch clears the hold.
2. **Does a person's "Turn on/off now" in Settings end an automation hold?**
   - (a) Yes, it replaces the hold with today's until-next-change choice. ✔
   - (b) It becomes a hold too.
   - (c) Settings can only "Back to schedule" while a hold is active.
3. **One call per screen, or one for all screens?**
   - (a) Per screen now, a collection route later if the flows get long. ✔
   - (b) Both now.
4. **Should a key be limitable to some screens?**
   - (a) Not now; the field can be added later without breaking anything. ✔
   - (b) Yes, in the first version.
5. **Is the all-in-one display in scope?**
   - (a) No, kiosks only. ✔ unless the household runs one.
   - (b) Yes, which needs a backend-side hold and host control.
6. **Should Homey be able to read a screen's state?**
   - (a) Yes, with the same key, through the GET. ✔
   - (b) No, write only.
7. **Is it acceptable that any device on the home network can see that a screen is held off?** This is inherent
   while the agent polls without a credential. Changing it means giving agents a credential, which is a separate
   project.
   - (a) Accept it and document it. ✔
   - (b) Give agents a credential first.

## Could not answer from code or public docs

- Athom's official description of the "Make a web request" headers field and whether it sends a `Content-Type`
  by itself. Community reports only; verify on a real Homey.
- Whether a touch wakes a panel on X11 and Wayland kiosks after the agent turns it off. That depends on the panel
  and the compositor, and needs a test on hardware.
