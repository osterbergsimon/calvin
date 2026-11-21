# Home automation: turn screens on and off

A home automation hub (Homey, Home Assistant, a script) can turn a Calvin screen on and off.
Each screen has one **Screen power** mode, chosen in Settings:

| Mode | What it does |
|---|---|
| **Schedule** | Turns on and off at the times below. |
| **Always on** | Never turns off on a schedule. Turn off when idle still applies. |
| **External** | Homey, Home Assistant or a script with an API key turns it on and off. |

Home automation switches only a screen set to **External**. A screen follows the household
default on the Default screen page until it has its own choice (**Changed here**). Changing
the mode never edits the screen's schedule: it is only hidden in Always on and External, and
comes back unchanged when Schedule is chosen again.

It uses a limited API key that can switch screens and read their state.

## 1. Create the key

1. Open **Settings › Security › API keys** (sign in with the admin password).
2. **Create key**, give it a name such as `Homey`, and pick **Turn screens on and off**.
3. Copy the key: it is shown once.

For home automation: turns screens on and off. Otherwise it's like having no key: no settings,
no backups, no [MCP](MCP.md), no host actions (details in
[Limited keys](../configuration/ADMIN_AUTH.md#limited-keys)). Settings shows when it was last
used, and **Revoke** stops it on the next request.

## 2. Find each screen's id

**Settings › Screens** lists your screens. A screen's id is the name it registered with (for
example `kitchen-3f9a2c`); `GET /api/kiosks` lists them too. There is one call per screen, so
a flow that turns every screen off has one request per screen.

## 3. The call

```
PUT /api/kiosks/{kiosk_id}/screen-power
Authorization: Bearer clv_YOUR_KEY_HERE
Content-Type: application/json

{"power": "off"}
```

What the call does follows the screen's mode:

| Mode | `{"power": "on"}` / `{"power": "off"}` | `{"power": "schedule"}` |
|---|---|---|
| **Schedule** | Turns the screen on or off until the next scheduled change. | Ends that choice: the screen follows its schedule again. |
| **External** | Turns the screen on or off until the next command, from either side. | `409 screen_power_external`: **This screen is set to External. Send on or off.** |
| **Always on** | `409 screen_power_always_on`: **This screen is set to Always on. Choose Schedule or External to switch it.** | Nothing to clear: the screen stays on. |

A request that changes nothing writes nothing and does not count toward the change limit.
Repeating a call is harmless.

```bash
curl -X PUT -H "Authorization: Bearer clv_YOUR_KEY_HERE" \
     -H "Content-Type: application/json" -d '{"power": "off"}' \
     http://calvin.local:8000/api/kiosks/kitchen-3f9a2c/screen-power
```

The answer, and `GET` on the same path, is the screen's state:

```json
{"id": "kitchen-3f9a2c", "mode": "external", "power": "off", "held": true,
 "setAt": "2026-11-21T21:04:10Z", "by": "automation", "until": null,
 "keyName": "Homey", "desiredOn": false, "online": true, "agentHolds": true,
 "paired": true}
```

- `mode` is the screen's **Screen power** choice: `schedule`, `always_on` or `external`.
- `power` is the command in force: `on`, `off`, or `schedule` for none. In External with no
  command yet it is `schedule`; the screen is on. In Always on it is `schedule` too, and the
  screen is on.
- `held` is kept for older copies of this guide and the Homey app: it is true when a command
  is in force. Use `power`.
- `by` is `automation` for any API key (an admin key used by a script too) and `settings` for
  a signed-in admin.
- `setAt` is when that command was given.
- `until` is when a Schedule command ends: the next scheduled change. It is `null` in External
  and Always on, when there is no command, and when no change comes in the next 8 days.
- `keyName` is the API key's name, for a signed-in admin only. Every other caller, this key
  included, gets `null`; then the screen reads **set by home automation**.
- `desiredOn` is what the screen will do. The screen does not report whether its panel is
  actually lit, so this is the intent, not a measurement. It uses the time zone set in
  Settings; with none set it uses the server's own.
- `agentHolds` is kept for the Homey app's own check. Every mode reaches today's screens,
  including software from before External: `true` means the screen obeys the command as a
  held on/off, `false` means it follows the command until its next scheduled change instead
  (which is exactly what External asks of it). `null` means no screen has checked in since
  Calvin was updated.
- `404` for an unknown screen, `422` for a bad body, `409` for a command the mode refuses
  (see the table), `401`/`403` for a missing or wrong key, `429` with `Retry-After` after 30
  changes in a minute from one key.

## Homey

Not yet tried on a real Homey: the header format below comes from community reports. Tell us if
your card needs something different.

Use the Logic card **Make a web request** in a flow.

| Field | Value |
|---|---|
| Method | `PUT` |
| URL | `http://<calvin>:8000/api/kiosks/<kiosk_id>/screen-power` |
| Headers | `Authorization: Bearer clv_YOUR_KEY_HERE` on one line, `Content-Type: application/json` on the next |
| Body | `{"power": "off"}` |

Headers are plain text lines, not JSON. If Calvin answers `401` with `admin_required`, the
card did not send the `Authorization` line; check that it is on a line of its own. To read a
screen's state, use the Advanced Flow variant of the card with method `GET` and the same URL
and `Authorization` line: its **Status Code** and **Response** tokens feed the next cards, and
a "text contains" condition on `"power":"off"` is enough to branch.

## Paired screens

A command reaches a screen unless the screen is gated and cannot prove it is itself. A screen
is gated when it is paired, or when **Only paired screens** is on.

- With **Only paired screens** off, an unpaired screen follows a command exactly as before.
- With **Only paired screens** on, every screen is gated. An unpaired screen receives no
  command, and in External that means it is on. The call still answers `200` and stores the
  command with `paired: false`, and `desiredOn` tells the truth.
- A paired screen is gated too. Its command reaches it only while its display agent checks in
  with the screen's own secret. A screen that has not checked in as itself yet receives
  nothing; `desiredOn` says so.

Pair an unpaired screen, or update one whose software is too old to send its secret, to let it
follow commands again.

`PUT /api/kiosks/{id}/screen-power` is open to an admin and to a key with **Turn screens on
and off**; a plain read key gets `403 insufficient_scope`, and an anonymous caller gets `401`.
`GET` on a gated screen (a paired screen, or any screen while **Only paired screens** is on)
is open to an admin, a key with **Turn screens on and off** and the screen itself; a plain
read key gets `403 insufficient_scope`, and an anonymous caller gets `401`. `GET` on a screen
that is not gated stays a public read.

## Settings and people

- On the screen's **Screen now** row, Settings shows **On · set here at 21:04** or **Off ·
  set by Homey at 21:04**, then **Until the next scheduled change at 22:00** in Schedule. A
  command from home automation reads **set by Home automation** when Calvin has no key name
  to show.
- **Turn on now** and **Turn off now** in Schedule, **Turn on** and **Turn off** in External:
  one press is one call, and it stands until the next command. **Back to schedule** shows in
  Schedule only, while a choice or a command is in force.
- Always on has no **Screen now** row: to turn a screen off, choose Schedule or External.
- A touch on a screen that is off can wake it, depending on the display. It is not left lit:
  Calvin sleeps it again at its next check, once the screen's idle time (**Turn off when
  idle**) has passed, or about once a minute when no idle time is set. The command itself is
  unchanged.

## Security notes

- **Keep the key small and private.** Anyone with admin access to the hub can read the key
  in the flow card. If it leaks, the holder can switch your screens and do what anyone on your
  network can do; revoke it in Settings and create a new one. Every change is logged with the
  key's name.
- **Plain HTTP on the LAN.** Calvin is usually reached over plain HTTP, so a device that can
  watch your network traffic could copy the key and replay a request. Put Calvin behind
  HTTPS (a reverse proxy) if that matters in your home.
- **Presence.** A paired screen's command is hidden from other devices on your network,
  and so is an unpaired screen's while **Only paired screens** is on. A screen still
  reads its own settings without a password. Calvin never shows which key made the
  change, except to a signed-in admin on that screen's own screen-power answer.
- **Backups.** Calvin's own API keys are not in a [backup](../configuration/BACKUP_RESTORE.md),
  and neither is a screen's command. After moving Calvin to a new server, create a new key and
  paste it into your flows.
- The all-in-one display (Calvin and its screen on one machine) is not covered yet.
