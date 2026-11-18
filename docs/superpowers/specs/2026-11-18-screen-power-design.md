# Screen power from home automation: scoped API keys and a held on/off

Date: 2026-11-18. Status: approved by the owner (every pick in the research's open questions).
Evidence, code references and the options that were weighed are in the research:
[Screen power from home automation, and scoped API keys](../../research/2026-11-18-screen-power-and-scoped-keys.md).
This page records what was decided, not why each alternative lost.

## Intent

A home automation hub (a Homey Pro flow in this household) turns Calvin's screens on and off:
"nobody home, screens off", "someone arrived, screens on", "back to the schedule". It does that
with an API key that can switch screens and nothing else. A screen switched this way stays that
way until automation or a person changes it, not until the next scheduled change.

## Goals

- API keys can carry an optional permissions list. The first permission is `screens.power`,
  shown as "Turn screens on and off".
- `PUT /api/kiosks/{kiosk_id}/screen-power` with `{"power": "on" | "off" | "schedule"}`, and a
  `GET` on the same path that answers the same shape, so a flow can read the state.
- A held on/off that survives Settings saves and is never carried by a backup.
- A display agent that obeys the hold indefinitely, and an older agent that still obeys it until
  the next scheduled change.
- Settings: a fourth key card, a held state on the screen's power row with "Back to schedule",
  and a note on screens whose agent is too old to hold.

## Non-goals

- The all-in-one display (no kiosk id; its own backend loop overwrites manual power each minute).
- A call for all screens at once, and keys limited to some screens. Both can be added later
  without breaking anything (absent means "all").
- More permissions than `screens.power`.
- Credentials for display agents (a separate research lane).

## Decisions (as decided)

1. **Hold semantics.** A command holds until automation or a person changes it. No expiry at a
   schedule boundary, no automatic fallback. `"schedule"` ends it.
2. **Key storage.** A limited key is stored as `"scope": "read"` plus
   `"permissions": ["screens.power"]`. Any entry that carries a `permissions` field is
   *limited*. Old entries (no field) load and behave exactly as before. `_FILE_VERSION` stays 1.
   An older backend loads the file and sees an ordinary read key (it fails closed: no screen power).
   An unknown permission name is ignored for that key, never fatal to the file, and never
   removed from the file by the new backend.
3. **What a limited key gets.** What an anonymous caller gets (public GETs, `PUBLIC_WRITES`), plus
   exactly the `(method, path)` pairs its permissions open in `PERMISSION_ROUTES`. No `ADMIN_READS`,
   no other unsafe route, no `HOST_ROUTES`, never `is_admin()`, and the MCP gateway refuses it.
   Key management stays admin-session only.
4. **Route.** `PUT` and `GET /api/kiosks/{kiosk_id}/screen-power`. One call per screen. Unknown
   screen: 404, and no registry row is ever created. A request that changes nothing writes
   nothing. Admin sessions and admin keys may call it too.
5. **Where the hold lives.** Its own nullable JSON column `kiosks.power_hold`
   (`{power, setAt, by}`, `by` is `"automation"` for a key or `"settings"` for a session),
   not the override layer. A Settings save cannot wipe it and backups do not carry it.
   Setting a hold removes `screenNow` from the layer; `"schedule"` clears both.
6. **Projection.** `GET /api/kiosks/{kiosk_id}/config` adds `screenHold`/`screen_hold`
   (`{power, setAt}`) and replaces `screenNow`/`screen_now` with the hold's value in the response
   only, so an older agent obeys the hold until the next boundary after `setAt`.
7. **Agent feature report.** A new agent adds `kfeat=hold` to its config poll. The backend stores
   it in `kiosks.agent_features`. An agent poll without it records "no features"; a screen no
   agent has polled since the upgrade reads as unknown. Settings and the route show which
   screens cannot hold yet (`agentHolds: false`).
8. **People in Settings.** "Turn on/off now" on a held screen ends the hold and works as today
   (until the next scheduled change). "Back to schedule" ends it through the new route. Touch on a
   held-off screen behaves as today.
9. **Presence leak accepted.** Any LAN device that knows a kiosk id can see, through the
   credential-free config poll, that a screen is held off. Documented, not fixed here.

## Security model

- Default deny stays: the new `PUT` is not in `PUBLIC_WRITES`, so anonymous callers get
  401 `admin_required` and a plain read key gets 403 `insufficient_scope`.
- `PERMISSION_ROUTES` is checked in the bearer branch only, before the "needs admin" branch.
  A permission opens only its own pairs; a pin test lists exactly what `screens.power` opens,
  and no entry may also be in `PUBLIC_WRITES` or `HOST_ROUTES`.
- A limited key's rank is treated as `read` whatever the file says, and `is_admin()` is false for it.
- Host and Origin checks (`HostOriginMiddleware`) apply to every request, bearer included. Cookie
  requests from another site are refused.
- No secret in any response or log. The change is logged once with the kiosk id, the new power
  and the key's name; public responses carry only `by`, never a key name.
- A per-caller limit on changes (30 a minute, then 429 with `Retry-After`) keeps a valid key from
  flooding writes. No-op requests do not count and do not write.
- Replay on plain-HTTP LANs is a documented risk: PUT is idempotent and the key's power is small.
  Households that care put Calvin behind HTTPS.

## Compatibility

| | Old agent | New agent |
|---|---|---|
| **Old backend** | as today | `kfeat` ignored, no `screenHold`: as today |
| **New backend** | obeys the projected `screenNow` until the next scheduled change | obeys `screenHold` until it changes |

| | Old key file | New key file (limited key) |
|---|---|---|
| **Old backend** | as today | loads; the limited key is a read key without screen power |
| **New backend** | loads byte-for-byte as today | limited key as above |

## Left to the builder

- The exact copy (through the plain-words doctrine and `noDevWords.spec.js`).
- `desiredOn` in the route answer is computed server-side with a port of the agent's precedence
  (hold, then `screenNow` with its boundary expiry, then the schedule), so Homey and Settings
  see what the agent will do. It never claims the panel *is* off.
- Whether "Turn on/off now" on a held screen is one request or two (end the hold, then write the
  override), as long as a stale page can never bring back an old `screenNow` while a hold is set.
- Docs: limited keys (`ADMIN_AUTH.md`), a home-automation how-to with the Homey card, holds and
  old agents (`KIOSK_INSTALL.md`), and that Calvin's own keys are not in a backup (`BACKUP_RESTORE.md`).
