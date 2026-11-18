# Home automation: turn screens on and off

A home automation hub (Homey, Home Assistant, a script) can turn a Calvin screen on, off, or
back to its schedule. "Nobody home: screens off", "someone arrived: screens on". The screen
stays the way automation left it until automation or a person changes it, even across the
screen's own schedule.

It uses an API key that can do this and nothing else.

## 1. Create the key

1. Open **Settings › Security › API keys** (sign in with the admin password).
2. **Create key**, give it a name such as `Homey`, and pick **Turn screens on and off**.
3. Copy the key: it is shown once.

This key can switch screens and read their state. It can't see or change anything else: no
settings, no backups, no [MCP](MCP.md), no host actions (details in
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
- `agentHolds: false` means the screen's software is too old to hold: it obeys the command
  until its next scheduled change. Press **Update** for that screen in Settings.
  `null` means no screen has checked in since Calvin was updated.
- `404` for an unknown screen, `422` for a bad body, `401`/`403` for a missing or wrong key,
  `429` with `Retry-After` after 30 changes in a minute from one key.

## Homey

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

## Settings and people

- On the screen's power row, Settings shows "Off, held by home automation" with
  **Back to schedule**.
- A person's **Turn on now** or **Turn off now** in Settings ends the hold and works as
  always: it lasts until the next scheduled change.
- A touch on a screen held off behaves as during a scheduled off.

## Security notes

- **Keep the key small and private.** Anyone with admin access to the hub can read the key
  in the flow card. If it leaks, the holder can switch your screens and nothing else; revoke
  it in Settings and create a new one. Every change is logged with the key's name.
- **Plain HTTP on the LAN.** Calvin is usually reached over plain HTTP, so a device that can
  watch your network traffic could copy the key and replay a request. Put Calvin behind
  HTTPS (a reverse proxy) if that matters in your home.
- **Presence.** Screens read their settings without a password, so any device on your
  network that knows a screen's id can see that it is held off, which can hint that nobody
  is home. Calvin never shows which key made the change.
- **Backups.** Calvin's own API keys are not in a [backup](../configuration/BACKUP_RESTORE.md),
  and neither is a hold. After moving Calvin to a new server, create a new key and paste it
  into your flows.
- The all-in-one display (Calvin and its screen on one machine) is not covered yet.
