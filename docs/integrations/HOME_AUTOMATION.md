# Home automation: turn screens on and off

A home automation hub (Homey, Home Assistant, a script) can turn a Calvin screen on, off, or
back to its schedule. "Nobody home: screens off", "someone arrived: screens on". The screen
stays the way automation left it until automation or a person changes it, even across the
screen's own schedule.

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

`power` is `on`, `off` or `schedule` (back to the screen's own schedule and nothing held).
Repeating a call is harmless: a request that changes nothing writes nothing.

```bash
curl -X PUT -H "Authorization: Bearer clv_YOUR_KEY_HERE" \
     -H "Content-Type: application/json" -d '{"power": "off"}' \
     http://calvin.local:8000/api/kiosks/kitchen-3f9a2c/screen-power
```

The answer, and `GET` on the same path, is the screen's state:

```json
{"id": "kitchen-3f9a2c", "power": "off", "held": true, "setAt": "2026-11-18T21:04:10Z",
 "by": "automation", "desiredOn": false, "online": true, "agentHolds": true}
```

- `desiredOn` is what the screen will do. The screen does not report whether its panel is
  actually lit, so this is the intent, not a measurement. For a screen that follows its
  schedule it uses the time zone set in Settings; with none set it uses the server's own.
- `by` is `automation` for any API key (an admin key used by a script too) and `settings` for
  a signed-in admin.
- `agentHolds: false` means the screen's software is too old to stay held: it obeys the command
  until its next scheduled change. Choose **Update** for that screen in Settings › Screens.
  `null` means no screen has checked in since Calvin was updated.
- `404` for an unknown screen, `422` for a bad body, `401`/`403` for a missing or wrong key,
  `429` with `Retry-After` after 30 changes in a minute from one key.

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
card did not send the `Authorization` line; check that it is on a line of its own. To read a screen's state, use the Advanced Flow
variant of the card with method `GET` and the same URL and `Authorization` line: its
**Status Code** and **Response** tokens feed the next cards, and a "text contains"
condition on `"held":true` is enough to branch.

## Paired screens

A hold reaches a screen unless the screen is gated and cannot prove it is itself. A screen
is gated when it is paired, or when **Only paired screens** is on.

- With **Only paired screens** off, an unpaired screen follows a hold exactly as before.
- With **Only paired screens** on, every screen is gated. An unpaired screen follows its own
  schedule instead of the hold. The call still answers `200` and stores the hold with
  `paired: false`, and `desiredOn` tells the truth.
- A paired screen is gated too. Its hold reaches it only while its display agent checks in
  with the screen's own secret. A screen whose software is too old to send that secret, or
  that has not checked in as itself yet, stays on its schedule; `desiredOn` says so. Choose
  **Update** for that screen in Settings › Screens.

So a hold is withheld only from a gated screen that is not authenticated: unpaired while
**Only paired screens** is on, or paired but on software too old to send its secret. Pair an
unpaired screen, or update one whose software is too old, to let it follow holds again.

`PUT /api/kiosks/{id}/screen-power` is open to an admin and to a key with **Turn screens on
and off**; a plain read key gets `403 insufficient_scope`, and an anonymous caller gets `401`.
`GET` on a gated screen (a paired screen, or any screen while **Only paired screens** is on)
is open to an admin, a key with **Turn screens on and off** and the screen itself; a plain
read key gets `403 insufficient_scope`, and an anonymous caller gets `401`. `GET` on a screen
that is not gated stays a public read.

## Settings and people

- On the screen's power row, Settings shows "Off, set by home automation. The schedule is
  paused." with **Back to schedule**.
- A person's **Turn on now** or **Turn off now** in Settings ends the hold and works as
  always: it lasts until the next scheduled change.
- A touch on a screen held off can wake it, depending on the display. It is not left lit:
  Calvin sleeps it again at its next check, once the screen's idle time (**Turn off when
  idle**) has passed, or about once a minute when no idle time is set. The hold itself is
  unchanged.

## Security notes

- **Keep the key small and private.** Anyone with admin access to the hub can read the key
  in the flow card. If it leaks, the holder can switch your screens and do what anyone on your
  network can do; revoke it in Settings and create a new one. Every change is logged with the
  key's name.
- **Plain HTTP on the LAN.** Calvin is usually reached over plain HTTP, so a device that can
  watch your network traffic could copy the key and replay a request. Put Calvin behind
  HTTPS (a reverse proxy) if that matters in your home.
- **Presence.** A paired screen's hold is hidden from other devices on your network,
  and so is an unpaired screen's while **Only paired screens** is on. A screen still
  reads its own settings without a password. Calvin never shows which key made the
  change.
- **Backups.** Calvin's own API keys are not in a [backup](../configuration/BACKUP_RESTORE.md),
  and neither is a hold. After moving Calvin to a new server, create a new key and paste it
  into your flows.
- The all-in-one display (Calvin and its screen on one machine) is not covered yet.
