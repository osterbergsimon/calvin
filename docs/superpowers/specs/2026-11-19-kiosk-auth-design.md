# Kiosk authentication: paired screens and display agents

Date: 2026-11-19. Status: draft for owner approval. The owner approved every pick in the research.
Evidence, code references and the options that were weighed are in the research:
[Authenticating kiosks and their display agents](../../research/2026-11-18-kiosk-authentication.md).
This page records what was decided and how it fits the screen-power work that merged since
([screen-power design](2026-11-18-screen-power-design.md), PR #369).

## Intent

A wall screen proves which screen it is. Today anyone on the home network who knows a screen's
name (and `GET /api/kiosks` lists them all) can speak for it. They can read whether home
automation holds it off, which says nobody is home. They can make a dead screen look alive,
switch off its "can hold" note, sign it out of Settings, and forge readings during a display
check. After this work, each screen holds its own secret, approved once by someone signed in to
Settings. Only that screen can report for itself. A screen that is not paired keeps showing its
dashboard, whatever happens.

## Goals

- Each screen gets its own pairing secret. The display agent makes it, and it becomes valid once
  someone signed in to Settings types the short code the screen shows (or the install command
  carries a one-time code).
- The agent sends it as `Authorization: Bearer clv_kiosk_…`. The kiosk browser gets it in the
  start URL's fragment (`#pair=…`) and swaps it once for an HttpOnly `calvin_kiosk` cookie.
- The server stores only a SHA-256 of the secret, in the kiosk's registry row. Backups carry
  that hash, so a restore keeps screens paired.
- Two household modes in Settings › Screens: **optional** (the default after the upgrade) and
  **required** ("Only paired screens"). A screen that is paired is protected at once, in either
  mode.
- The two holes the research found are closed for every paired screen, and for all screens in
  required mode:
  1. **Screen-sleep peer check.** One forged config poll adds the attacker's address to
     `peer_ips`, and that address then passes the check on `POST /api/kiosks/{id}/screen-sleep`.
  2. **Public display-check run id.** The run id is the only proof on the agent's display-check
     report, and the public config answer hands it out.
- The forged `kfeat` poll from the PR #369 review ("Forged poll with `kfeat`") can no longer
  change `agent_features` on a paired screen, or on any screen in required mode.
- Settings › Screens shows each screen as paired, not paired, or needing a software update
  before it can be paired. It offers pairing, unpairing and the household choice (UI spec by the
  design lead, section 13).

## Non-goals

- The household dashboard itself (calendar, photos, plugin data, viewer writes). It stays
  readable by anyone on the home network, by the admin-auth design's line (research owner
  question 4, answer a).
- `PATCH /api/kiosks/{id}/overrides` with `showUI` stays open to unpaired callers (research
  question 7, answer a).
- `GET /api/kiosks/{id}/display-check` stays a public read (research table, row 6: later).
- Automatic rotation of a screen's secret (research question 6, answer a). To rotate, unpair
  and pair again.
- The all-in-one display. It has no kiosk id, and it keeps the loopback check it has today.
- The integrity of agent updates. That belongs to the manifest signature and the planned
  Ed25519 release signing. Pairing must not reuse the manifest signing key.
- Making required the default for fresh installs. A later release decides that (owner
  question 2 below).

## Anti-goals

These things must never happen:

- **A 401 on a screen's config read.** An unpaired screen, or one with a revoked or garbled
  secret, still gets the household config and its own layout, rotation and schedule.
- **A blank screen because of pairing.** The pairing code is shown over the dashboard, never
  instead of it (how is the design lead's, section 13).
- **A pairing approved without an admin.** A LAN caller can start a pairing, but only someone
  signed in to Settings (or a one-time install code that such a person made) can approve one.
- **A screen showing a code that someone else chose.** The screen shows only the code for its own
  secret. It never asks "what is the code for kitchen?" without proving it holds the secret.
- **A kiosk secret treated as an API key.** It never reaches `ApiKeyStore.authenticate`, never
  counts as a failed key, never reaches MCP, and never makes `is_admin()` true.
- **A secret in a response, a URL the server sees, a log line or a backup.** Only hashes are
  stored or backed up, and the start URL carries the secret only in its fragment.
- **A pairing secret in `/etc/default/calvin-kiosk`.** That file is world-readable.

## Constraints

- Agent updates are manual, one screen at a time (Settings › Screens › **Update**). Any number of
  old agents can stay in service for months. Every new behaviour must leave an old agent working
  in optional mode, and still showing its dashboard in required mode.
- The agent is stdlib-only Python 3.9+, and runs as `calvin`. Its writable directory is
  `/var/lib/calvin/agent`, which `update-kiosk.sh` creates and chowns (calvin-r3wt). The kiosk
  browser units run as `calvin` too.
- The kiosk units are in the agent bundle (`kiosk_bundle.BUNDLE_FILES`): one **Update** brings
  the new agent and the new start URL together.
- Calvin serves plain HTTP from uvicorn. A LAN attacker who can sniff traffic can steal a bearer
  or a cookie. That is true of the admin cookie today too, and HTTPS in front of Calvin is the
  answer.
- One uvicorn process (the limiters and the kiosk session locks are in memory already).
- SQLite writes go through `retry_on_db_locked`, and use column-scoped `update(_columns=…)`, as
  the heartbeat does.
- The screen-power hold (`kiosks.power_hold`), its projection and `kfeat=hold` stay as PR #369
  built them. This work only decides **who receives** the projection, and who may write
  `agent_features`.
- Settings copy is plain words, passes `tests/unit/copy/noDevWords.spec.js`, and uses the
  doctrine blocks (`InlineNote`, `Button`, `SettingRow`), with no new `<style>`.

## Approaches

The research compared four ([section 2](../../research/2026-11-18-kiosk-authentication.md#2-options)):

| Approach | Why not, or why |
|---|---|
| (a) **Per-screen secret approved with a short code** (Jellyfin Quick Connect, RFC 8628 shape) | **Picked.** It is bound to one screen and can be revoked per screen. It fits a screen with no keyboard, and its hash fits the kiosk row and backups. It reuses the bearer branch, log redaction and the signed-cookie pattern. |
| (b) A per-kiosk key derived from the manifest master key | There is nothing to reuse (calvin-580's `Ki` was never built). Any keyed Pi could compute every other Pi's key, and the agent cannot read the root-only key file. |
| (c) Mutual TLS, or HMAC-signed requests | Calvin has no TLS of its own. Signed requests need a correct clock, which a Pi without a real-time clock lacks at boot. They might come back later as hardening for the agent alone. |
| (d) A per-kiosk API key of a new kind | Its policy shape is reused (`KIOSK_ROUTES` beside `PERMISSION_ROUTES`), but not its storage. `api-keys.json` is not in backups. A kiosk key must be bound to one id and kept away from MCP, and it would clutter the list that is meant for people's apps. |

## Decided: how it works

### 1. Words used here

- **Secret**: `clv_kiosk_` followed by 43 URL-safe characters (32 random bytes). It only ever
  lives on the screen.
- **Paired screen**: its registry row has a `credential_hash`.
- **The screen itself**: a request whose bearer secret, or whose `calvin_kiosk` cookie, matches
  the `credential_hash` of the kiosk id **in the path**. This is called the *kiosk principal*.
- **Gated screen**: a paired screen, or any screen while the household mode is required.
  Unauthenticated writes for a gated screen are refused, and its presence fields are hidden from
  anyone who is not that screen or an admin.
- **Presence fields**: `screenHold`/`screen_hold`, `screenNow`/`screen_now` (projected or in the
  raw layer), `displayCheck`/`display_check` (the job, with its run id), and `powerHold` in the
  kiosk list.
- **Admin**: an admin session, or an API key of admin scope or above. A limited key is not an
  admin.

### 2. Storage

- Alembic migration, two nullable columns on `kiosks`:
  - `credential_hash`, String(64): the SHA-256 hex of the active secret.
  - `paired_at`, UTCDateTime.

  Existing rows are unpaired. Downgrade drops both columns.
- **Pending pairings and one-time install codes live in memory, not in the database.** They live
  for 10 and 30 minutes. A restart loses them, and the agent asks again on its next poll. *(My
  call: it removes a table and a migration, and losing a pending code to a restart costs one more
  minute of waiting.)*
  - A pending pairing is `{kiosk_id, secret_hash, code, created, expires, peer}`. There are at
    most 3 per kiosk id; a new one drops the oldest.
  - An install code is `{code_hash, created, expires}`. There are at most 5 live at once, and each
    works once.
- The household mode is a config key, `kioskPairing`, with the value `"optional"` (also when the
  key is absent) or `"required"`.
  - It is admin-only: it is **not** in `CONFIG_DISPLAY_KEYS`.
  - The policy reads it from the household config table, never from a merged per-screen config,
    so a screen's layer cannot switch it off.
  - It is backed up with the rest of the config.

### 3. The kiosk principal and the route policy

- `enforce_route_policy` dispatches on the bearer prefix **before** `_authenticate_bearer`.
  - A bearer that starts with `clv_kiosk_` is never passed to `ApiKeyStore`, and never counted in
    `api_key_limiter`.
  - The prefix is set aside: `ApiKeyStore.create` re-rolls any new API key secret that would start
    with `clv_kiosk_` or `clv_pair_`.
- The kiosk principal is resolved lazily, through one function,
  `kiosk_principal(request) -> str | None`. It returns the path's kiosk id when the bearer, or
  else the `calvin_kiosk` cookie, matches that row's `credential_hash`. It does one row read, and
  the result is cached on `request.state`. Requests that never ask for it pay nothing.
- `KIOSK_ROUTES` is a new table in `route_policy.py`, beside `PERMISSION_ROUTES`. It lists the
  unsafe routes where only the screen itself may act on a gated screen:

  ```python
  KIOSK_ROUTES = frozenset({
      ("POST", "/api/kiosks/{kiosk_id}/screen-sleep"),
      ("POST", "/api/kiosks/{kiosk_id}/display-check"),
  })
  ```

  - Both stay in `PUBLIC_WRITES`, so an ungated screen behaves as today.
  - Their handlers call one shared check, `require_screen_itself(request, kiosk_id)`. It passes
    when the screen is not gated, or when the kiosk principal equals `kiosk_id`. Otherwise it
    answers 401 `kiosk_unpaired` ("This screen isn't paired.").
  - An admin does not pass. Only the screen reports for itself.
- A bad or revoked kiosk secret, or an expired cookie, is treated as **no credential**. It is
  never a 401 by itself, and an anonymous caller gets what that request gets anonymously.
  - Failures count in their own `kiosk_secret_limiter` (a `LoginRateLimiter`), only to keep the
    log quiet: a 256-bit secret cannot be guessed.
  - A locked-out address is treated as anonymous, not refused.
- A kiosk principal is never an admin. `is_admin()` and `is_admin_session()` ignore it, and a
  kiosk cookie next to an admin cookie changes nothing about the admin cookie.
- Tests, in the style of `PERMISSION_ROUTES`, check that:
  - every `KIOSK_ROUTES` entry is a real route;
  - none is in `HOST_ROUTES` or `PERMISSION_ROUTES`;
  - both entries call `require_screen_itself`.

### 4. Pairing

New routes in `kiosks.py`:

| Route | Who | Does |
|---|---|---|
| `POST /api/kiosks/{kiosk_id}/pair` | the agent (kiosk bearer), or a browser-only screen (no bearer, body `{"browser": true}`); public write | Starts or continues pairing (below) |
| `GET /api/kiosks/{kiosk_id}/pair` | the holder of a pending or active secret (bearer or cookie) | `{"state": "paired" \| "pending" \| "none", "code"?, "expiresAt"?}`. The code goes only to the holder of that pending secret |
| `POST /api/kiosks/{kiosk_id}/browser-session` | kiosk bearer (pending or active); public write | Sets the `calvin_kiosk` cookie, answers `{"state"}` |
| `POST /api/kiosks/pairings` | admin session | Body `{"code"}`. Approves the matching pending pairing, answers `{"id", "displayName", "pairedAt"}` |
| `DELETE /api/kiosks/{kiosk_id}/pairing` | admin | Unpairs: clears `credential_hash` and `paired_at` |
| `POST /api/kiosks/install-codes` | admin session | Mints a one-time install code, answers `{"code", "expiresAt", "command"}` |

`POST .../pair`, `POST .../browser-session` and `GET .../pair` go in `PUBLIC_WRITES` or are public
GETs. Their handlers do their own checks.

**Agent flow.**

1. With no secret file, the agent makes a secret. It writes `/var/lib/calvin/agent/kiosk-credential`
   (mode 0600, owner `calvin`, written atomically: temp file, then rename).
2. While its config answer says `kioskAuth.state` is `"unpaired"`, the agent calls `POST .../pair`
   with its bearer, once a minute, on the same timer as the config poll.
3. The server answers:
   - **Secret matches the active hash:** `{"state": "paired"}`.
   - **Secret matches a live pending entry:** that entry, with the same code.
   - **Otherwise:** it makes a new pending entry and a new code, `{"state": "pending", "code",
     "expiresAt"}`. Only new entries count toward the limit of 20 new pendings per address per
     10 minutes (429 `rate_limited` after that). The server never creates a registry row here.
4. **With an install code.** When `/var/lib/calvin/agent/install-pair-code` exists, the agent
   sends `{"installCode": "clv_pair_…"}` on its first `pair`. A live, unused code approves at once
   and is used up. The agent deletes the file after the server answers `paired`, or answers
   `install_code_invalid`. Either way it then goes on as in steps 2 and 3.

**The code.**

- 6 characters from a 30-character alphabet (digits and capitals with no 0/O, 1/I/L or U), shown as `K7Q-4MD`. When it is
  typed, case and the dash are ignored.
- It lives 10 minutes. The server chooses it, so it is never derived from the secret.
- No two live pending entries share a code.

**Approval.**

- In Settings › Screens, **Pair a screen**, the admin types the code. `POST /api/kiosks/pairings`
  finds the live pending entry with that code. It sets that kiosk's `credential_hash` to the
  entry's `secret_hash`, sets `paired_at`, and drops every pending entry for that id.
- If the screen has no registry row yet (a new screen in required mode), approval creates one,
  with the id and the hostname from the pending entry.
- Wrong codes: after 5 in a minute from one address, the next tries get 429 with a cooldown that
  doubles, as the login limiter does, in its own bucket.
- The answer names the screen, so Settings can say "Kitchen is paired."

**The screen shows its code.**

- The browser learns its state from `GET .../pair`, sent with its cookie: right after the
  fragment hand-off, then every 10 seconds while it is pending, and on each config fetch otherwise.
- While pending, it shows the code over the dashboard (section 13; UI spec by the design lead),
  for example "Pair this screen: open Settings › Screens on your phone, choose Pair a screen and
  enter **K7Q-4MD**."
- The code goes away once the screen is paired. In a plain browser tab (no `?kiosk=`) nothing
  changes.

**Browser-only screen** (a tablet that opens `?kiosk=hall`, with no agent):

- The page starts pairing itself, with `POST .../pair` and `{"browser": true}`, only when its
  config answer says `kioskAuth.hasAgent` is false, meaning no agent has ever polled for this id.
  That keeps a Pi's browser with old units from racing its agent.
- The server mints the secret, keeps only its hash as pending, and sets the cookie for it. Page
  JavaScript never sees a secret.

**Pairing state in the config answer.** `GET /api/kiosks/{id}/config` adds:

```json
"kioskAuth": {"state": "paired" | "unpaired", "mode": "optional" | "required", "hasAgent": true, "browser": "paired" | "unpaired" | "unknown"}
```

- `state` is about the caller: it is `paired` only for the screen itself.
- `browser` goes only to the screen itself (see section 6).
- Its presence also tells a new agent that the server knows pairing.

### 5. The cookie

- `calvin_kiosk` is a stateless, signed cookie, in the same shape as `calvin_admin`:
  `k1.<hex kiosk id>.<fingerprint>.<issued>.<mac>`.
  - The fingerprint is the first 16 hex characters of the secret's hash.
  - The MAC is an HMAC-SHA256 under the admin store's `server_secret`.
- It is valid while its fingerprint equals the start of the row's `credential_hash`, or the
  `secret_hash` of a live pending entry for that id (so a pending screen can read its own code).
  Unpairing, or pairing with a new secret, kills it at once, with no generation counter.
- It is `HttpOnly`, `SameSite=Strict` and `Path=/`, with `Max-Age` of 400 days. The server
  re-signs it when it is older than 30 days.
- It is never an admin session, and it is not read by `read_session`.
- Resetting the admin password file changes `server_secret` and kills every kiosk cookie. Agent
  screens recover by themselves (section 6). A browser-only screen shows a new code.

### 6. How the browser gets the secret, and gets it back

- The kiosk units (`calvin-kiosk-remote.service`, `calvin-cog.service`) read
  `/var/lib/calvin/agent/kiosk-credential` when they build the start URL.
  - When the file matches `^clv_kiosk_[A-Za-z0-9_-]{43}$`, they append `#pair=<secret>`.
  - A missing or malformed file adds nothing.
- At boot, before the router or any request, `captureKioskIdentity()` in `kioskId.js` does this:
  1. It reads `#pair=` and removes it at once with `history.replaceState`.
  2. It posts the secret once to `POST .../browser-session` as a bearer, and keeps it nowhere: not
     in `sessionStorage`, and not in Pinia.
  3. Every later request, including `EventSource` and `<img>`, carries the cookie.

  The service worker never sees the secret, because a fragment is not part of a request URL.
- **The browser lost its cookie** (cog without a persistent cookie store, an admin password
  reset, a re-pair with a new secret):
  - The server notes, in memory per kiosk id, whether the screen's latest browser poll (`khost`
    without `kagent`) carried a valid cookie. It counts only polls from an address in that
    screen's `peer_ips`, and those are recorded only from the screen's authenticated polls. So a
    forged poll cannot trigger the next step.
  - It reports this as `kioskAuth.browser` in the agent's config answer.
  - When the screen is paired and the answer says `"unpaired"` on two polls in a row, the agent
    restarts the browser, at most once every 10 minutes. The unit re-reads the file and the
    hand-off runs again.
  - Chromium is restarted the way the crash watchdog does it (`restart_kiosk_unit`), and cog
    through a new `restart` verb in `calvin-cog-panel.sh`, which the sudoers line already lets the
    agent run.

### 7. What a screen gets, by mode and pairing

Hidden presence fields are left out of the answer. They are never replaced with fakes.
"Admin" sees everything in every row.

| | Optional mode, screen not paired | Optional mode, screen paired | Required mode, screen not paired | Required mode, screen paired |
|---|---|---|---|---|
| Config read (layout, rotation, schedule, theme) | 200, as today | 200 | 200 | 200 |
| Presence fields in config, list, overrides GET | to anyone (as today) | the screen itself and admin only | admin only | the screen itself and admin only |
| `GET .../screen-power` | public (as today) | the screen itself, admin, a `screens.power` key; else 401 `admin_required` | admin, a `screens.power` key; else 401 | as optional, paired |
| Registry writes on a poll (register, last seen, status, hostname, viewport, `peer_ips`, `agent_features`) | anyone with `khost`/`kagent` (as today) | the screen itself only; other polls write nothing | nobody: unpaired polls write nothing | the screen itself only |
| `POST .../screen-sleep` | peer check (as today) | the screen itself only | refused (401 `kiosk_unpaired`) | the screen itself only |
| `POST .../display-check` report | run id (as today) | the screen itself, plus the run id | refused | the screen itself, plus the run id |
| `PATCH .../overrides` `showUI` | open | open | open | open |
| Pairing card shown | yes, when its agent can pair | no | yes | no |
| Settings line | "Not paired" or "Needs a software update before it can be paired" | "Paired" | same as optional, plus "This screen can't report in or follow home automation until it is paired" | "Paired" |

What follows from the table:

- An old agent (no `kfeat=pair`) on a gated screen keeps its dashboard. In required mode it stops
  following holds and "Turn off now", and stops reporting. Settings says so.
- A sign-in at a screen is still told apart by the address (`kiosk_for_peer`). For a gated screen,
  `peer_ips` holds only addresses its authenticated polls came from, so a forged poll can no
  longer make the attacker's own sign-ins kiosk-length either. That was harmless before, and it is
  now also closed.
- `ScreenPowerView` gains `paired: bool`. `desiredOn` is computed from what that screen's agent
  will actually receive: a gated, unpaired screen gets no hold, so it follows its schedule.
- **Turning on required.**
  - Settings offers "Only paired screens" at once when every screen seen in the last 7 days is
    paired.
  - Otherwise it asks first: "Kitchen and Hall aren't paired. They'll keep showing the dashboard
    but stop reporting in and following home automation. Turn on anyway?"
  - Turning it off again needs no confirmation.

### 8. The two holes, and the forged `kfeat` poll

| Hole | Today | After this work |
|---|---|---|
| Screen-sleep peer check | One forged poll with `khost` adds the attacker's address to `peer_ips`. `screen-sleep` then accepts that address, so the attacker can sign the screen out of Settings whenever they like | On a gated screen, `screen-sleep` needs the screen itself, and a forged poll writes no `peer_ips`. Both halves are closed. An ungated screen in optional mode keeps today's check; the Settings banner says so |
| Public display-check run id | The config answer gives the job, with its run id, to anyone. The report route takes any body that names it, so forged faults reach "Save limit" | On a gated screen, the job goes only to the screen itself and the report needs the screen itself. The run id stays as a second check. Ungated: as today |
| Forged `kfeat` (PR #369 review) | `?kagent=x&kfeat=` from anyone resets `agent_features`, so the "needs update" note and `agentHolds` are wrong until the next real poll | On a gated screen, only the screen itself writes `agent_features`. Ungated: as today (cosmetic, as the review judged) |

### 9. Re-pairing and revoking

- Each screen's row in **Settings › Screens** gets a "Paired since 3 Nov" line and an **Unpair**
  button. The confirmation reads: "Kitchen will show a new code and stop reporting in until you
  pair it again."
- **Unpair** clears the hash. The screen's next authenticated request (within a minute) is
  answered as anonymous, with `kioskAuth.state: "unpaired"`.
  - The agent then deletes its secret file and makes a new secret, so an old copy of the file is
    useless.
  - It starts pairing, and restarts the browser so the browser picks up the new secret
    (section 6).
  - The screen shows a new code.
- **A stolen screen**: Unpair it. If it is not coming back, **Remove** it too. Removal deletes
  the row, and with it the hash.
- **Pair again** (when a secret might have leaked, but the screen is still yours): Unpair, then
  type the new code.
- **Reinstall** keeps `/var/lib/calvin/agent`, and with it the secret, as it keeps the id. A bats
  test pins this.
- **SD card swap** gives a new machine-id. That means a new default id and no secret, so the
  screen appears as a new, unpaired screen with a code. Carrying the old screen's settings across
  is a later follow-up.

### 10. Agent install and update path

- **Existing screens:** Settings › Screens › **Update**, as today. The bundle brings the new agent
  and the new kiosk units together, and `update-kiosk.sh` restarts the changed units. The agent
  then makes its secret and shows a code, and an admin types it.
  - Signed Pis are strongly recommended. A Pi without the signing key installs whatever answers as
    the server, and that answer could be an agent that sends the secret elsewhere. Pairing does
    not make updates safer; the docs say so.
- **New screens, quick install:** "Add a screen" shows the command with a one-time code:
  `curl -fsSL '<server>/api/kiosks/install.sh?pair=clv_pair_…' | sudo bash`, with "This command
  works once, for 30 minutes" and a **New code** button.
  - `render_install_script` bakes the code in only when it matches `^clv_pair_[A-Za-z0-9_-]{22,64}$`.
    It does not check that the code is live, so the route is not an oracle for codes.
  - The installer passes it to `setup-kiosk.sh --pair-code`, which writes
    `/var/lib/calvin/agent/install-pair-code` (0600, `calvin`).
- **Signed install over SSH, and baked SD cards:** `install-kiosk.sh --pair-code <code>` and
  `bake-kiosk-firstrun.sh --pair-code <code>`. On a baked card the code may be stale by the time
  the Pi boots. The screen then falls back to showing a code.
- **Logs:** the existing `clv_` redaction pattern covers `clv_kiosk_…` and `clv_pair_…`, in
  headers and in the `install.sh?pair=` access-log line. A test pins both.
- **The agent against an older server:**
  - When a request with its bearer gets 401 `invalid_api_key`, the server predates pairing. The
    agent drops the bearer for an hour and repeats the request without it.
  - It starts pairing only after it has seen `kioskAuth` in a config answer.

### 11. Compatibility, migration and downgrade

| | Old agent | New agent |
|---|---|---|
| **Old backend** | as today | first poll 401 `invalid_api_key`, then polls without a bearer, as today; never starts pairing; the browser's hand-off fails quietly and the fragment is still removed |
| **New backend, optional mode** | as today (`Needs a software update before it can be paired`) | pairs, then gated as its own screen |
| **New backend, required mode** | dashboard only; no reports, holds or sign-out | pairs, then full service |

- **Upgrade:** the migration adds two empty columns, so every screen starts unpaired, and the
  mode is optional. Nothing changes until a screen is paired.
- **Downgrade, image only** (columns stay): the old backend ignores the columns. New agents fall
  back as above. Upgrading again finds the hashes, so the screens are still paired.
- **Downgrade with `alembic downgrade`:** the hashes are gone. After upgrading again, every agent
  is told it is unpaired: it makes a new secret and shows a new code.
- The leftover `kioskPairing` config key is ignored by an older backend.

### 12. Backups

- The export adds `"pairing": {"credentialHash": …, "pairedAt": …}` to each kiosk row, and leaves
  it out for unpaired rows.
  - `FORMAT_VERSION` stays 1. `KioskRow` ignores unknown keys, so an older restorer drops the
    field and restores the screens as unpaired, which is safe.
  - Pending pairings and install codes are never exported.
- **Restore rule** *(my call)*:
  - A kiosk row the server does not have yet takes the backup's pairing, so a restore onto a fresh
    server keeps the screens paired.
  - A row that already exists keeps its current pairing, paired or not. A restore never re-pairs a
    screen the owner unpaired after the backup, and never breaks a screen paired since.
  - The restore summary says how many screens came back paired.
- `BACKUP_RESTORE.md` says the file now holds a one-way fingerprint per paired screen, not the
  screen's secret. It cannot be used to pretend to be a screen.

### 13. What people must be able to do (UI spec by the design lead)

The Settings and kiosk screens are **UI spec by the design lead**: the standing design lead
ships the layout, states, copy and mocks as a `docs(design)` PR before either UI part is built,
and reviews those UI PRs. This design only fixes what a person must be able to do and what each
state must tell them. The sample wording in this page shows intent; the design lead's copy wins.

**On the screen (kiosk browser).**

- See, while its pairing is pending, that the screen is not paired yet and the code to type,
  without the dashboard being hidden or a tap target covered (anti-goal: never a blank screen).
- See the card go away by itself within about 10 seconds of approval.
- Nothing changes in a plain browser tab, or on a paired screen.

**In Settings › Screens.**

- Tell, for each screen, which of these states it is in: paired (and since when); not paired,
  with a code to enter; needs a software update before it can be paired (with the existing
  Update action); and, in required mode, not paired so it can't report in or follow home
  automation.
- See at a glance how many recently seen screens are paired, and that an unpaired screen can be
  imitated by another device on the home network.
- Pair a screen by typing the code it shows, and learn which screen was paired. Be told plainly
  when the code didn't match, or when there were too many tries.
- Unpair a screen, after a confirmation that says the screen will show a new code and stop
  reporting in until paired again.
- Turn "Only paired screens" (required mode) on and off. Turning it on while recent screens are
  unpaired asks first and names them; turning it off does not ask.
- In "Add a screen", get the install command with its one-time code, see that it works once for
  30 minutes, and get a new code.

## Security

### Threat model

| Attacker | Can today | Can in optional mode, screen paired | Can in required mode |
|---|---|---|---|
| **On the home network, no sign-in, no sniffing** | Everything in the research's section 1 table: read presence, ghost screens, fake status, sign screens out, forge display-check faults, flip `agent_features` | For a paired screen: nothing beyond the household dashboard and `showUI`. For an unpaired screen: as today | Nothing beyond the household dashboard and `showUI`. Starting pairings is rate-limited, and they expire without an admin |
| **On the network and sniffing plain HTTP** | Same, plus the admin cookie | Can copy a screen's bearer or cookie and act as that screen until it is unpaired; also the admin cookie | Same. Only HTTPS in front of Calvin closes this, as for the admin cookie |
| **Has a stolen screen** (the Pi and its card) | Everything a LAN attacker can | Can act as that one screen: read its own presence fields, report its status, sign it out, report on its display checks. Cannot sign in, gain admin, or read other screens' presence. **Unpair** closes it within a minute. If that Pi was given the manifest signing key, the thief also holds that key (unchanged by this work; Ed25519 release signing removes it) | Same |
| **Has a backup file** | Plugin config minus stripped secrets; the signing key only when exported on purpose | Plus the hash of each screen's secret: a SHA-256 of 256 random bits, which cannot be reversed or used as a credential | Same |
| **Can type at a paired screen's touchscreen** | The dashboard, plus a kiosk-length sign-in if they know the password | Same: page JavaScript never holds the secret, and the cookie is HttpOnly | Same |

### What each phase closes

- **Optional mode** closes the two holes, the forged-poll writes, ghost polls and the presence
  leak **for each screen as soon as it is paired**. Screens not yet paired behave as today, and
  the banner says so.
- **Required mode** closes the same for every screen, including any not yet paired. Those keep
  the dashboard and lose reports, holds and sign-out.
- Neither phase changes the household dashboard's openness, nor the integrity of agent updates.

### Leftover exposure, stated in the docs

- **The secret on the Pi.** It sits in the agent's file, in the browser's command line (Linux
  lets any local account read `/proc/<pid>/cmdline`), in the kiosk profile's history and, on
  Chromium, behind the loopback-only DevTools port. On a kiosk Pi the only accounts are `calvin`,
  the optional `calvin-admin`, root and system users. Even so, the secret speaks for that one
  screen only.
- **The fragment hand-off** sends the secret over plain HTTP once per browser start, as every
  later request sends the cookie.
- **A one-time install code** sniffed within its 30 minutes can pair one screen with an id the
  attacker chooses. That gives the attacker a screen of their own, never someone else's. It shows
  up in Screens, and **Remove** deletes it.

### Rules the tests pin

- Every `KIOSK_ROUTES` entry refuses, on a gated screen:
  - no credential;
  - another screen's secret;
  - a revoked secret;
  - a pending (not yet approved) secret;
  - an admin session;
  - an admin key.

  It accepts the screen itself.
- In required mode, and for a paired screen in optional mode, a forged poll with
  `khost`/`kagent`/`kfeat` changes nothing in the row. No row is created, and no `peer_ips` or
  `agent_features` are written.
- For anonymous callers on a gated screen, these never contain a presence field:
  - the config answer;
  - `GET /api/kiosks`;
  - `GET .../overrides`.

  They do contain them for the screen itself and for admin.
- The config read is 200 with layout and rotation for every combination of mode, pairing and
  credential (none, bad, revoked, pending, valid).
- A kiosk secret never makes `is_admin()` true, never reaches `ApiKeyStore`, never counts in
  `api_key_limiter`, and is refused by the MCP gateway.
- Pairing limits:
  - a wrong code is rate-limited;
  - a code expires and works once;
  - there are at most 3 pending entries per id;
  - `GET .../pair` gives the code only to the holder of that pending secret;
  - approving never returns a secret;
  - unpairing kills the cookie.
- A backup round trip keeps screens paired. An older backup restores them as unpaired. A restore
  onto an existing row never changes that row's pairing.
- No `clv_kiosk_…` or `clv_pair_…` reaches a log line, whether it came in a header or in a query.

## Left to the builder

- Nothing in the UI: layout, states, copy and mocks for Settings and the kiosk card come from
  the design lead's `docs(design)` PR (section 13). The builder implements that spec, passes
  `noDevWords.spec.js`, and asks the design lead, not this page, about anything it leaves open.
- How the agent's pairing state machine is laid out in code, as long as:
  - it never loops faster than the config poll;
  - it never deletes a secret the server still accepts;
  - it treats any answer it doesn't understand as "try again next poll".
- Whether `kiosk_principal` reads the row through `kiosk_registry` or through a small cache with a
  short time to live, as long as an unpair takes effect within one poll interval.
- The per-address limits' exact numbers, within the ranges above.
- Docs pages to update:
  - `KIOSK_INSTALL.md`: pairing, install codes, reinstall, card swap, what optional mode leaves
    open;
  - `KIOSK_PROVISIONING.md`;
  - `ADMIN_AUTH.md`: the trust model and the new routes in "What needs the admin password";
  - `BACKUP_RESTORE.md`;
  - `HOME_AUTOMATION.md`: a gated, unpaired screen doesn't follow holds.

## Open questions for the owner

See the PR body. The builder check found these that only the owner can settle:

1. **The pairing card on a screen nobody has started pairing.** The design shows the pairing code
   on every unpaired screen whose agent can pair, from the moment it is updated. Is a permanent
   pairing code on a screen you have chosen not to pair yet acceptable, or should the card only
   appear for 10 minutes after someone taps **Pair a screen** in Settings?
2. **Required by default for fresh installs.** Should a fresh install start in required mode
   (every screen pairs through the install command anyway), or stay optional until a later
   release?
3. **Restoring a screen that was removed.** Under the restore rule, a screen that was removed
   from Screens after the backup comes back paired. Is that acceptable (the summary names it), or
   should a restore bring removed screens back unpaired?
