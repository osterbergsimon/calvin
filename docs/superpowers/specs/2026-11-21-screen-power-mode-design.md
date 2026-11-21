# Screen power mode: Schedule, Always on, External (calvin-25g9)

Status: design. The owner approved the direction on 2026-11-21. The UI is fixed by the design lead's spec
[2026-11-21-screen-power-mode.md](../../design/2026-11-21-screen-power-mode.md), and this document fixes the
server side. It replaces the open-ended hold of
[2026-11-18-screen-power-design.md](2026-11-18-screen-power-design.md) decisions 1, 5, 6 and 8. The scoped API
keys, the route's auth, the change limit and the security model of that design stay as they are.

## Intent

A screen's power today has three layers: a hold, then "Screen now", then the schedule. The hold is invisible
state that pauses the schedule with no end. The owner replaced it with one plain choice per screen, with a
household default:

**Screen power: Schedule · Always on · External**

Afterwards, "why is this screen off?" always has an answer on the screen's page, and an automation can never
pause a schedule without anyone seeing it.

## Goals

- One setting, `screenPower`, in the household config and in a screen's override layer, like every other
  screen setting.
- One route serves both home automation and Settings' buttons: `PUT /api/kiosks/{id}/screen-power`.
  What a command means follows the mode.
- **No agent change.** Every mode reaches today's agents, old ones included, through keys they already obey.
- The route's answer gives the UI everything its spec asks for (§10 there): the mode, who and when, the key's
  name for admins, and when a command in Schedule ends.

## Non-goals and anti-goals

- No new key scope, auth path or rate limit. `screens.power` and the 30-a-minute limit stay.
- No migration of holds: none exist (owner).
- No change to "Turn off when idle", brightness or the display check. They apply in every mode.
- Anti-goal: anything that pauses a schedule silently, or a mode that only new agents understand.

## Decisions

1. **The key.** `screenPower`: `"schedule" | "always_on" | "external"`, in the household config and in the
   override layer. When it is absent, it is derived: `displayScheduleEnabled` true gives `schedule`, and
   anything else gives `always_on`. So every existing install reads exactly as before, with no write. Writes of
   `screenPower` are validated against the three values (422 otherwise). The server also keeps
   `displayScheduleEnabled` in step in the same layer (`true` only for `schedule`). That way a restore onto,
   or a downgrade to, an older backend still behaves sensibly. `displaySchedule` is never touched by a mode
   change.
2. **The last command.** The `kiosks.power_hold` column stays, renamed in code to the screen's *command*:
   `{power: "on"|"off", setAt, by: "automation"|"settings", mode, keyName?}`, where `mode` is the mode it was given in. As today, it is not in the override
   layer and not in backups. **Settings' buttons use the route too**, so one press is one call (UI spec §3.4).
   Settings no longer writes `screenNow` into the layer. The server strips `screenNow`/`screen_now` from every
   layer write, and `_without_superseded_screen_now` and `drop_superseded_screen_now` are removed with their
   tests. A `screenNow` already in a layer is dropped once, at startup, by an idempotent migration (it would
   expire at its next boundary anyway).
3. **What a command means, per mode:**

   | Mode | `PUT power: on/off` | `PUT power: schedule` | Effect on the screen |
   |---|---|---|---|
   | Schedule | stores the command | clears it (Back to schedule) | the command until the first schedule boundary after `setAt`, then the schedule |
   | External | stores the command | **409** `screen_power_external`: **This screen is set to External. Send on or off.** | the last command stands; no command means **on** |
   | Always on | **409** `screen_power_always_on`: **This screen is set to Always on. Choose Schedule or External to switch it.** | no-op (nothing to clear) | always on |

   The 409 is my call over the UI spec's "ignored". An automation that thinks it turned a screen off should
   hear that it did not, and the Homey app can show that sentence. Settings never sends these: it shows no
   buttons in Always on and no Back to schedule in External. A no-op still writes nothing and does not count
   toward the limit.
4. **A command in Schedule expires on the server too.** When a stored command's boundary has passed, the server
   treats it as absent: `GET` reports it as following the schedule. It is cleared on the next write, and
   nothing is cleared on a read. So Settings and Homey never show a stale "set by Homey" after the schedule
   took over.
5. **Changing the mode ends the command.** A command belongs to the mode it was given in (its `mode` field).
   One whose `mode` differs from the screen's effective mode is treated as absent, exactly like an expired one
   (decision 4). It is cleared on the next write and never on a read. This works the same whether the change
   came from the screen's own setting or from the household default. Leaving External therefore returns a
   screen to its schedule (or to Always on) cleanly. Entering External starts with **no command yet**, which is
   **on**.
6. **Projection to the agent** (`GET /api/kiosks/{id}/config`, the agent's view only; the stored layers never
   change):

   | Mode | `displayScheduleEnabled` | `screenNow` | `screenHold` |
   |---|---|---|---|
   | Schedule | as stored (`true`) | the command, if not expired | none |
   | Always on | `false` | none | none |
   | External | `false` | the command | the command |

   Today's agent with the schedule off finds no boundary, so a `screenNow` stands until it changes
   (`_screen_now_power`: no expiry when `_first_boundary_after` is `None`). External therefore works on old
   agents too, and the UI spec's "software too old for External" note (§6) is **not needed**: `agentHolds`
   stays in the answer for the Homey app's own check, but Settings drops that note. The gated, unpaired rule
   stays: such a screen receives no command at all (`receives_hold` False strips both keys). In External it is
   then on.
7. **The route's answer** (`ScreenPowerView`). Fields kept: `id`, `desiredOn`, `online`, `agentHolds`, `paired`.
   Changes:
   - `mode`: the effective `screenPower`.
   - `power`: `"on" | "off" | "schedule"`. This is the command in force, and `"schedule"` means none. In
     External with no command it is `"schedule"`; the UI reads it as **no command yet**. The value set is
     unchanged, for the Homey app.
   - `held`: kept as "a command is in force" for compatibility, and marked deprecated in the docs.
   - `setAt` and `by`: as today.
   - `until`: new, an ISO instant. It is the boundary at which a Schedule command ends, and `null` in other
     modes or when no boundary comes within 8 days.
   - `keyName`: new, the API key's name. It is **only in answers to an admin session**. Every other caller,
     the screens.power key included, gets `null`, as the old design promised ("public responses carry only
     `by`"). The stored command keeps the name at the time of the command; renaming a key later does not
     rewrite it.
8. **Kiosk list.** `GET /api/kiosks` rows gain `screenPower` (effective) next to today's `powerHold`. That way
   the list summaries (UI spec §4.3) need no second call. `powerHold` keeps its meaning, the command in force.
   The gated-row rule (presence fields hidden) covers both.

## Compatibility

| | Old agent | New agent |
|---|---|---|
| Old backend | as today | as today |
| New backend | obeys every mode via `displayScheduleEnabled` + `screenNow` | same, plus `screenHold` in External |

- An old Settings page (cached in the service worker) talking to a new backend still writes
  `displayScheduleEnabled`. The server derives the mode from it when `screenPower` is absent from that write,
  and keeps the two in step when both are present (`screenPower` wins). Its `screenNow` writes are stripped
  (decision 2).
- A backup from a new backend restores onto an older one with `displayScheduleEnabled` still correct.
  `screenPower` is ignored there.

## Security

Unchanged from the 2026-11-18 design: the same route, auth, `screens.power` scope, Host/Origin checks, change
limit and logging. The new `keyName` field is admin-only (decision 7). The two 409 bodies hold no screen
detail beyond the mode the caller is already allowed to read.

## Left to the builder

- The exact Alembic or startup-migration shape for dropping stored `screenNow` (decision 2). It must be
  idempotent and safe on restore (`restorer.py` runs the migrations).
- Where the derivation helper lives: one function, used by the config response, the route and the list.
  `screen_power.py` is the natural home.
- Frontend consumers of `displayScheduleEnabled` outside Settings (grep). They read the effective value
  through the same helper or the projected config.
- Docs: `HOME_AUTOMATION.md` (modes, the 409s, `until`) and `KIOSK_INSTALL.md` (drop the old-agent caveat for
  holds). Use the UI spec's words.
- The Homey app (calvin-homey PR #1) is revised to this afterwards, in its own repo.
