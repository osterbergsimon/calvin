# Authenticating kiosks and their display agents

**Date:** 2026-11-18
**Scope:** `backend/app/api/routes/kiosks.py`, `backend/app/security/{route_policy,admin_auth,api_keys}.py`,
`backend/app/services/{kiosk_registry,kiosk_signing,kiosk_bundle}.py`, `deploy/kiosk-agent/`, `deploy/systemd/`,
`scripts/setup-kiosk.sh`, `frontend/src/utils/kioskId.js`, the Screens section of Settings. Research only: no
product code changed.

## Recommendation

Give each screen its own **pairing credential**: a random secret the screen makes for itself, which becomes valid
only when someone signed in to Settings types the short code the screen shows (the way Jellyfin's Quick Connect
pairs a TV). The display agent sends it as `Authorization: Bearer clv_kiosk_…`. The kiosk browser receives it in
the URL **fragment** (`#pair=…`), which never reaches the server, a log or a `Referer`. It swaps it once for an
HttpOnly `calvin_kiosk` cookie and wipes the fragment. Store only a hash, in a new column on the kiosk registry
row, and include that hash in backups, so a restore keeps screens paired. Check it in `route_policy.py` with a
small `KIOSK_ROUTES` table shaped like the screen-power work's `PERMISSION_ROUTES`. Don't store it as an API key:
kiosk credentials are bound to one screen, belong in Screens rather than API keys, and must survive a restore,
which `api-keys.json` does not. **Never answer an unpaired screen with a 401.** It still gets its dashboard
config, minus the presence-bearing fields (the screen-power hold, `screenNow`, the display-check job). Only the
writes that matter (status reports, peer address, screen-sleep, display-check reports) need pairing. A screen
whose agent has not been updated therefore keeps working, and the one thing it loses is the part that leaks.
Turn this on in two steps: first pair while the old behaviour still works, then have the owner tick "Only paired
screens". The KDF-derived per-kiosk key from the earlier work (calvin-580) was never built and was superseded
by the Ed25519 plan, so there is no `Ki` to reuse. About **6 to 7 days**, with the policy branch, the pairing
code limiter and the browser hand-off as the risky parts.

## 1. Today

### What a kiosk calls

A kiosk is two programs on one Pi, both running as the `calvin` user
(`deploy/systemd/calvin-display-agent.service:8`, `calvin-kiosk-remote.service:15`, `calvin-cog.service:17`),
plus a root updater (`calvin-kiosk-update.service`). Its id is `CALVIN_KIOSK_ID` from `/etc/default/calvin-kiosk`,
`<hostname>-<6 hex of machine-id>` by default (`scripts/setup-kiosk.sh:30-67`). The browser opens
`<server>/?kiosk=<id>&khost=<hostname>` (`calvin-kiosk-remote.service:39-42`, `calvin-cog.service:40-43`) and keeps
the id in `sessionStorage` (`frontend/src/utils/kioskId.js:1-50`). Kiosk ids are not secret:
`GET /api/kiosks` lists them all.

| Caller | Route | Reads / writes | Trusted by today | What a LAN attacker can do |
|---|---|---|---|---|
| agent, browser | `GET /api/kiosks/{id}/config?khost=&kagent=&kstat=&kmsg=&kstack=&kwifi=&vw=&vh=` (`kiosks.py:483-559`) | Reads the merged config, including overrides, `screenNow`, the display-check job with its run id (`display_check.py:362-363`), and soon the hold. **Writes** the registry: registers the kiosk, sets last-seen, hostname, agent version/status/message, viewport, display stack, Wi-Fi power save, and adds the caller's address to `peer_ips` (`kiosks.py:517-530`, `kiosk_registry.py:245`, `:280-283`) | Nothing. A "real poll" is any request carrying `khost` or `kagent` (`kiosks.py:502-506`) | Read any screen's config (and soon whether it is held off, which says nobody is home). Create a ghost screen with any id. Make a dead screen look online, fake an "update failed" message, report a wrong viewport. **Add its own address to a kiosk's `peer_ips`**, which then defeats the two peer checks below |
| agent | `POST /api/kiosks/{id}/screen-sleep` (`kiosks.py:450-465`) | Ends that kiosk's admin sessions (`admin_auth.py:106-111`) | Peer address must be in that kiosk's recent `peer_ips` (`kiosk_registry.py:159-166`) | After one forged poll from its own address (row above): sign a screen out whenever it likes. It can only sign out, never in |
| agent | `POST /api/kiosks/{id}/display-check` (`kiosks.py:381-393`; public in `route_policy.py:44-46`) | The agent's report on a display-check run: readings, faults | The body must name the stored run id, but the id is in the public config | Forge readings or faults during a check the owner is running. "Save limit" (`kiosks.py:329-357`, admin) then stores a limit worked out from forged faults |
| browser | `PATCH /api/kiosks/{id}/overrides` (`kiosks.py:135-166`) | Without admin, only `KIOSK_SELF_WRITE_KEYS` = `showUI` (`route_policy.py:136-140`) | Nothing, on purpose | Hide or show a screen's controls, which anyone can already do to every screen through the household `showUI` |
| browser | `GET /api/kiosks/{id}/overrides`, `GET /api/kiosks/{id}/display-check`, `GET /api/kiosks` (`kiosks.py:46-59`, `:206-215`; `kiosk_registry.py:326-353`) | Raw override layer; run and findings; every screen's hostname, agent status, overrides, viewport | Nothing (GETs are public unless in `ADMIN_READS`) | Read the same per-screen data the config route gives. The screen-power plan adds `powerHold` to `GET /api/kiosks`, so the presence leak lives here too |
| all-in-one agent | `POST /api/screen-sleep` (`kiosks.py:468-480`) | Ends the id-less kiosk sessions | Direct loopback peer with no proxy header (`route_policy.py:155-170`) | Nothing from another machine |
| browser | `POST /api/auth/login`, `POST /api/auth/touch` | Admin session; a sign-in at a kiosk gets a short kiosk session | The page's `kiosk`/`display` claim (it can only shorten a session), or a peer address seen in that kiosk's polls (`auth.py:88-125`) | A forged poll makes the attacker's own sign-ins kiosk-length. Harmless to anyone else |
| browser | the dashboard's ordinary reads and the "viewer writes" (`route_policy.py:26-56`): config, events, images, plugin data, next/previous photo, plugin actions, `POST /api/config` with display keys | Household data | Nothing, by the admin-auth design (`docs/superpowers/specs/2026-10-29-admin-auth-design.md` §3) | Read the household dashboard (calendar included). **Out of scope here:** that is the "trusted LAN for display state" line the admin-auth design drew |
| updater (root), installer | `GET /api/kiosks/agent/manifest`, `/agent/files/{name}`, `/install.sh`, `/installer/{name}` (`kiosks.py:396-447`) | Code the Pi runs as root | Manifest HMAC when the Pi has the signing key; otherwise LAN trust (`update-kiosk.sh:241-271`) | Without a key on the Pi: serve the Pi a tampered update by answering in the server's place. Reading these files is harmless; they are public code |

The browser's `Authorization` hook already exists as a commented placeholder (`frontend/src/services/api.js:74-80`).
The agent's three calls are plain `urllib` requests (`calvin_display_agent.py:1280-1331`, `:2518-2558`).

### What the manifest signing key protects, and where it lives

- One **shared** 32-byte key, `kiosk-signing.key` in the server's data dir (`kiosk_signing.py:15-33`,
  `kiosk_bundle.py:167-202`). It signs the bundle manifest (version, per-file hashes, installer hashes). It
  protects **integrity of code** going to the Pi, nothing else. No request from a kiosk is signed or checked
  with it.
- On a Pi that was given the key, it sits in `/etc/default/calvin-kiosk-signing`, mode 0600, root only
  (`install-kiosk.sh:139-141`). Only the root updater reads it (`update-kiosk.sh:14-16`). The agent and the
  browser, running as `calvin`, cannot. Signing is opt-in per Pi: a Pi without the key trusts the LAN.
- **There is no per-kiosk `Ki`.** calvin-580's `Ki = HMAC(master, kiosk_id)` was deferred by the signing plan
  (`docs/superpowers/plans/2026-07-16-kiosk-manifest-signing.md:20`), then superseded by the plan to sign
  manifests with Ed25519 at release time (`docs/superpowers/specs/2026-10-29-admin-auth-design.md` §7,
  `docs/setup/KIOSK_PROVISIONING.md:256-261`). calvin-9ks was cosmetic follow-ups to the signing work (commit
  `015f0a51`). Nothing in the tree derives per-kiosk keys.

### What earlier work already gives us

- **A stable id per Pi** (calvin-dd9.2), kept across reinstalls (`setup-kiosk.sh:87-96` keeps an existing id).
- **Kiosk sessions** (calvin-q4o8): a sign-in on a wall screen lasts minutes, and the screen going to sleep ends
  it. The pairing credential gives `screen-sleep` a proper check instead of the peer address.
- **The bearer branch and its limiter** in `route_policy.py:217-242`, plus log redaction of anything shaped like
  `clv_…` (`api_keys.py:34`, `security/install.py:56-58`). A `clv_kiosk_…` secret is redacted by the existing
  pattern, even in a query string in an access-log line.
- **Stateless signed cookies** (`admin_auth.py:252-301`): the same pattern serves a kiosk browser cookie.
- **The page already wipes its query** into `sessionStorage` once it has been read (`kioskId.js:1-50`), and the
  share page already sends `Referrer-Policy: no-referrer` (`frontend_static.py:224`).
- **Screen-power research** (`origin/research/screen-power`, `docs/research/2026-11-18-screen-power-and-scoped-keys.md`):
  a `permissions` list on keys, a `PERMISSION_ROUTES` table, a `kfeat` feature report on the agent's poll, and a
  hold kept in its own registry column and projected into the config. Its security table and owner question 7
  name the presence leak and leave it to this work.

## 2. Options

### What comparable projects do

- **Home Assistant.** Companion apps sign in with an OAuth-style flow and get a refresh token for that device,
  which the user can revoke from their profile ([auth API](https://developers.home-assistant.io/docs/auth_api)).
  For wall tablets, the documented route is the **trusted networks** provider: an address range, optionally an
  address mapped to one user, and `allow_bypass_login`
  ([providers](https://www.home-assistant.io/docs/authentication/providers/)). That is trust by address, which is
  roughly where Calvin's peer check is today, and forum threads show it is fiddly in practice
  ([Fully Kiosk example](https://community.home-assistant.io/t/fully-kiosk-always-gives-login-attempt-or-request-with-invalid-authentication-from/406079),
  [another](https://community.home-assistant.io/t/auth-providers-not-working/105204)).
- **Jellyfin Quick Connect.** The new device shows a code; the user types it into an already signed-in client,
  and the device is signed in without a password ([docs](https://jellyfin.org/docs/general/server/quick-connect)).
  The device polls until it is approved. This is the closest fit for a wall screen with no keyboard.
- **OAuth device authorization grant** ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)): the same shape,
  standardised. The device holds a long `device_code`, the person types a short `user_code` elsewhere, and the
  short code is rate-limited and expires quickly (RFC 8628 §5.1-5.2 on brute force of the user code).
- **Frigate.** No device enrolment: a JWT session cookie on its authenticated port, or headers from an auth proxy,
  with `admin` and `viewer` roles ([authentication](https://docs.frigate.video/configuration/authentication)).
  Wall displays there use a viewer login, or the proxy.
- **Immich** scopes API keys by permission (see the screen-power research). Keys are the household's tool for
  scripts. They are not how a device signs in.
- **Fully Kiosk Browser and other tablet kiosk browsers** open a fixed start URL. Whatever credential a setup uses
  ends up in that URL or in the browser's storage. That argues for a credential that a URL can carry without
  sending it to the server (a fragment), followed by a cookie.

The pattern that fits: **a per-device credential, approved by a short code typed where an admin is already signed
in, revocable per device.**

### Options compared

| | (a) Per-kiosk secret issued at enrolment | (b) Reuse the KDF-derived `Ki` | (c) Mutual TLS, or HMAC-signed requests | (d) A per-kiosk API key of a new `kiosk` kind |
|---|---|---|---|---|
| Exists today | No | **No**: never built, superseded (section 1) | No; Calvin serves plain HTTP from uvicorn | Scoped keys are on `research/screen-power`, not built yet |
| Enrolment UX | Pairing code typed in Settings, or a one-time code in the "Add a screen" command | Copy the master key to every Pi over SSH, as signing does today (`docs/setup/KIOSK_INSTALL.md` Step 0). Most households skip it | Issue a client certificate per Pi, or a secret plus a synced clock | Create a key in Settings › API keys, then paste it onto the Pi |
| Browser gets it | Fragment, swapped for an HttpOnly cookie | Can't: the key is root-only on the Pi, and putting a master-derived key in a browser profile spreads the master's power | mTLS needs TLS and a client certificate in Chromium and cog (WPE), which are configured differently. Signed requests put the secret in page JavaScript | Same as (a), but the key appears in the API keys list |
| Agent stores it | A file it creates, mode 0600, owned by `calvin`, or loaded through `EnvironmentFile=` | Root-only env file; the agent (as `calvin`) cannot read it | Certificate and key files | Same as (a) |
| One kiosk compromised | That screen's credential only; revoke it in Screens | Every keyed Pi holds the master, so **any one Pi can compute every other Pi's `Ki`** | That screen only | That screen only, if bound to one id |
| Rotation / revocation | Per screen, from Screens; takes effect on the next request (hash re-read) | Rotate the master and touch every Pi by hand (`KIOSK_PROVISIONING.md:252-254`) | Certificate revocation, or rotate the secret | Key revoke exists; rotation is "make a new key" |
| Reinstall | The id and the secret file are kept | Key file kept | Kept | Kept |
| SD card swap | New machine-id means a new default id and no secret: the screen shows a code, pair again | Re-copy the master | Re-issue | Make and paste a new key |
| Backup / restore | Hash in the kiosk row, included in backups: screens stay paired | Master key is exported only on request (`?include_signing_key=true`, admin) | n/a | `api-keys.json` is **not** in backups, so every screen must be re-paired after a restore |
| Replay on plain HTTP | Sniffable, like the admin cookie today | Same | Signed requests stop replay, but need a correct clock, and a Pi has no RTC: the clock is wrong until NTP syncs | Sniffable |
| All-in-one | Keep loopback trust; no credential needed | n/a | n/a | n/a |
| Fit with planned work | Reuses the bearer branch, the limiter, redaction and the cookie signer; new table beside `PERMISSION_ROUTES` | Fights the Ed25519 plan, which removes shared secrets from Pis | Large and separate | Reuses the key store, but bends it: a kiosk key needs a `kiosks: [id]` binding, must not reach MCP (an older backend would treat it as a read key with MCP reads), and clutters the list meant for people's apps |

**Verdict.** (a), built on (d)'s *policy shape* but not on its *storage*. (b) is out: there is nothing to reuse,
and a master-derived key on every Pi is the shared-secret problem the Ed25519 plan exists to remove. (c) is out
for a first version: Calvin has no TLS of its own, and signed requests need a clock the Pi may not have at boot.
It could come back later as a hardening step for the agent alone.

### How the recommended design answers each point

**Enrolment (pairing).**

1. The new agent, finding no secret, makes one (32 random bytes, `clv_kiosk_` prefix) and writes it to
   `/var/lib/calvin/agent/kiosk-credential`, mode 0600, owned by `calvin`. That directory already holds the agent's
   runtime state (`calvin_display_agent.py:32-36`). It then calls `POST /api/kiosks/{id}/pair` with the secret as
   its bearer. The server stores the hash as **pending** and answers with a random six-character code. The code
   is the server's choice, not derived from the secret, so an attacker cannot grind secrets until one matches.
2. The screen shows the code. The browser is the screen's only display, so it asks for its own pairing state with
   the same bearer and shows a full-screen card: "To finish setting up this screen, open Settings › Screens on
   your phone and enter **K7Q-4MD**." Only the holder of that secret ever sees the code.
3. In Settings › Screens, an admin taps **Pair a screen** and types the code. The pending hash for that kiosk id
   becomes active. Approval needs an admin session, so a pairing request from an attacker is just another pending
   row that expires.
4. **Zero-touch.** "Add a screen" can mint a one-time install code (`clv_pair_…`, valid 30 minutes, single use).
   The command becomes `curl -fsSL '<server>/api/kiosks/install.sh?pair=clv_pair_…' | sudo bash`. The installer
   writes the code to the Pi, the agent's first `pair` call presents it, and the server approves at once. It is in
   a URL and travels over plain HTTP, so it must be short-lived and single use. The `clv_` prefix keeps it out of
   the logs.
5. **A browser-only screen** (a tablet opening `?kiosk=hall`) uses the same steps without an agent. The page makes
   the pending request itself. The server sets the pending secret as the HttpOnly `calvin_kiosk` cookie, so page
   JavaScript never holds it, and the same card shows the code.

**How the browser gets it without leaking.** The kiosk units read the agent's credential file when they build the
start URL and put it in the fragment: `<server>/?kiosk=<id>&khost=<host>#pair=clv_kiosk_…`. A fragment is never
sent in a request, so it never reaches the server's access log, a proxy, or a `Referer` (the
[URL spec](https://url.spec.whatwg.org/#concept-url-fragment) keeps it client-side, and `Referer` strips it).
At boot, before any other request, `kioskId.js` reads it and posts it once to
`POST /api/kiosks/{id}/browser-session` as a bearer. The server answers with an HttpOnly, `SameSite=Strict`
`calvin_kiosk` cookie (stateless, signed like the admin cookie, carrying the kiosk id and the credential's
generation). The page then calls `history.replaceState` to drop the fragment. After that, every request, including
`EventSource` and `<img>`, carries the cookie with no header work. The service worker caches by URL, and the secret
is never in a URL it sees. Leftover exposure: the Chromium command line under `/proc` on the Pi, and the kiosk
profile's history file, both readable only on that Pi, by the user that already holds the credential (or by root).

**How the agent stores it.** As in step 1: a file it owns, mode 0600. The kiosk units are `User=calvin`, so they
can read it. Putting it in `/etc/default/calvin-kiosk` would be wrong, because that file is world-readable
(`KIOSK_PROVISIONING.md:244`).

**Rotation and revocation.** In Screens, each screen gets a "Paired" line and **Unpair**. Unpairing deletes the hash
and bumps the generation, so the cookie stops working too. The screen falls back to showing a code on its next
poll, and someone pairs it again. Automatic rotation (the server hands a paired agent a new secret in its config
answer, and keeps the old one valid until the agent confirms) can wait for a later version.

**Reinstall** keeps the id (`setup-kiosk.sh:87-96`) and must keep the credential file: the installer leaves
`/var/lib/calvin/agent` alone. **SD card swap:** the new card has a new machine-id, so a new default id and no
secret. It appears as a new, unpaired screen with a code. A follow-up could offer "This replaces <old screen>",
carrying the old overrides across.

**All-in-one display.** Its agent and browser run on the server itself. Keep the direct-loopback check that
`POST /api/screen-sleep` uses (`route_policy.py:162-170`); proxy headers already turn it off. It has no kiosk id,
no registry row and no hold in the first screen-power version, so it has nothing to leak. In Docker, a request from
the host comes from the bridge address rather than loopback, which fails closed.

## 3. Migration

Existing kiosks have no credential, and agent updates are manual, one screen at a time from Screens, with a hash
as the version and no feature numbers (screen-power research, section 3; `kiosk_bundle.py:205-207`). An
`enforce now` switch would therefore leave every un-updated screen half-broken. The design avoids that in three ways:

1. **No 401 on the config read, ever.** An unpaired caller still gets the household config and its screen's
   ordinary overrides (layout, rotation, schedule), so a screen keeps showing the right dashboard whatever happens.
   What it loses once pairing is required: the presence fields (`screenHold`, the projected `screenNow`, the
   display-check job) and the registry writes. A screen cannot be bricked by this change. The worst case is a
   screen that stops obeying an automation hold and stops reporting its status, and Settings says so.
2. **Two modes, chosen in Settings › Screens** (a household setting, `kioskPairing: "optional" | "required"`):
   - **optional** (the default in the release that ships this): today's behaviour for unpaired screens, plus
     pairing for those that can. Each screen shows one of: "Paired"; "Not paired: enter the code shown on the
     screen"; or, when its agent does not report `kfeat=pair`, "Needs a software update before it can pair", with
     the existing **Update** button. A Screens banner shows "2 of 3 screens are paired" until all are.
   - **required**: unpaired polls change nothing in the registry (no ghost screens, no forged status, no peer
     address), get no presence fields, and their `screen-sleep` and display-check reports are refused. Settings
     lets you choose it only when every screen seen in the last week is paired, or after a confirmation that names
     the ones that are not.
3. **"Known kiosks" grace without trusting the address.** In optional mode, a known screen polling with no
   credential is handled as today. Pairing a screen locks *that* screen: once its hash exists, unauthenticated
   writes for its id are refused even in optional mode. A screen is protected as soon as it is paired, without
   waiting for the household switch.

Should a later release make **required** the default for new installs? Yes: a fresh install has no old screens,
and the installer can pair them on the way in (zero-touch code). For upgrades, keep optional until the owner
switches. Settings shows the banner, and the docs explain what is still open while screens are unpaired.

The update path matters in one more way. A Pi without the signing key installs whatever answers as the server,
and that answer could be an agent that sends its pairing secret elsewhere. Pairing does not make the update
channel safer. Ed25519-signed manifests do, and they stay a separate, complementary piece of work.

## 4. What to protect first

Ranked by harm if left open:

| # | Route / data | Harm | First version? |
|---|---|---|---|
| 1 | Presence fields in `GET /api/kiosks/{id}/config`, and the same data in `GET /api/kiosks` (`powerHold`), `GET /api/kiosks/{id}/overrides` (`screenNow`) and the planned `GET /api/kiosks/{id}/screen-power` | Tells anyone on the LAN that nobody is home | **Yes.** Only paired screens and admins see them. Strip them from the public list and overrides views as well, or the config gate is pointless |
| 2 | Registry writes on the config poll (register, status, hostname, `peer_ips`) | Ghost screens, a dead screen made to look alive, forged "update failed", and the peer address that unlocks #3 | **Yes** |
| 3 | `POST /api/kiosks/{id}/display-check` (agent report) | Forged faults lead to a wrong saved brightness limit | **Yes** (paired screen only, plus the run id as today) |
| 4 | `POST /api/kiosks/{id}/screen-sleep` | Signs a screen out of Settings | **Yes**: cheap once the credential exists. Keep the peer check as a fallback only in optional mode |
| 5 | The screen-power hold, if the agent obeys it | Turning a screen off is the Homey key's job (screen-power research), not the kiosk's | Nothing to add: the PUT is key-gated. The read side is #1 |
| 6 | `GET /api/kiosks/{id}/display-check` | Run and findings readable by anyone | Later (admin read, or paired screen) |
| 7 | `PATCH /api/kiosks/{id}/overrides` with `showUI` | Hide a screen's controls | **Later.** Already possible for every screen through the household `showUI` |
| 8 | Manifest, agent files, installer | Public code; integrity is the signature's job | Not this work |
| 9 | Household dashboard reads, viewer writes | Out of scope by the admin-auth design | Not this work (owner question 4) |

## 5. Fit with in-flight work

- **Screen power (scoped keys and the hold), `feat/screen-power`.** That branch is not on the remote yet, so this
  is checked against the research doc only. Build kiosk auth **beside** it, not inside it:
  - Same resolution point: `enforce_route_policy` resolves a `clv_kiosk_` bearer (or the `calvin_kiosk` cookie) to a
    *kiosk principal* (`request.state.kiosk_id`), next to `request.state.api_key`. Dispatch on the prefix *before*
    `ApiKeyStore.authenticate`, so a kiosk secret is never counted as a failed API key.
  - Same table shape: `KIOSK_ROUTES = {("POST", "/api/kiosks/{kiosk_id}/screen-sleep"), …}`. The principal's id
    must equal the path's `kiosk_id`. Policy tests check every entry is a real route and none overlaps
    `PUBLIC_WRITES`, `HOST_ROUTES` or `PERMISSION_ROUTES` (as the screen-power plan proposes for its own table).
  - The hold column and its projection stay as screen-power designs them. Kiosk auth only decides *who receives*
    the projection, in one function shared by the config route, the list and the overrides GET. Ask the screen-power
    branch to add `powerHold` to `GET /api/kiosks` through that function, or behind a "public view" helper, so the
    leak isn't hard-coded into a public route that has to be undone later.
  - The same `kfeat` poll field: the agent adds `pair` next to `hold`. One field, two features.
  - Do **not** make kiosk credentials API keys with `permissions: ["kiosk.self"]`. The reasons are in section 2:
    backups, binding to one screen, MCP on an older backend, and the API keys list.
- **Homey switch tiles part 2, `feat/switch-grid`.** It touches the plugin renderers, `InstanceModal.vue`,
  `pluginsApi.js` and the theme (`git diff --stat origin/develop...origin/feat/switch-grid`). Kiosk auth touches
  none of those. Plugin actions stay public by design, so a paired screen gets nothing extra there, and nothing is
  taken away from an unpaired one. The only shared file is `route_policy.py`, where a new table is a separate
  block.
- **Ed25519 release-signed manifests** (planned): complementary. Pairing proves which screen is calling; signing
  proves that code is genuine. Neither replaces the other. Pairing must not reuse the manifest key.

## 6. Recommended design and plan sketch

Risky parts are marked ⚠.

**Backend (about 2.5 days)**

1. Alembic migration: `kiosks.credential_hash` (string), `kiosks.credential_generation` (int),
   `kiosks.paired_at`, and a small `kiosk_pairings` table (pending hash, kiosk id, code, created, expires; or a
   JSON column with a cap per kiosk). `kiosk_registry`: `start_pairing`, `approve_pairing(code)`,
   `unpair`, `authenticate_kiosk(secret) -> kiosk_id | None` (constant-time compare of the SHA-256), all with
   `retry_on_db_locked`.
2. ⚠ `route_policy.py`: resolve the kiosk principal (bearer by prefix, else the `calvin_kiosk` cookie). Add the
   `KIOSK_ROUTES` table. Refuse a bad kiosk bearer with 401 and count it in the limiter. A valid kiosk principal
   is never admin, and `is_admin()` stays false for it.
3. ⚠ Pairing routes: `POST /api/kiosks/{id}/pair` (public, creates a pending row; at most 3 pending per id, and
   per-address limits), `GET /api/kiosks/{id}/pair` (the caller's own state and code), `POST /api/kiosks/pairings`
   with `{code}` (admin; **5 wrong codes a minute per session, then a cooldown**; codes from an unambiguous
   32-letter alphabet, 6 characters, 10-minute life), `DELETE /api/kiosks/{id}/pairing` (admin, unpair),
   `POST /api/kiosks/{id}/browser-session` (kiosk bearer in, cookie out). One-time install codes:
   `POST /api/kiosks/install-codes` (admin) and the `?pair=` parameter on `install.sh`.
4. ⚠ One `kiosk_view(kiosk_id, viewer)` projection used by `get_kiosk_config`, `list_kiosks` and
   `get_kiosk_overrides`. It strips presence fields for anyone who is neither admin nor that paired screen.
   `record_kiosk` is called only for a paired screen, or for an unpaired one in optional mode when the id has no
   hash.
5. `screen-sleep` and the display-check report: require the kiosk principal when the id is paired or the mode is
   required; keep the peer check otherwise.
6. Backup: export and restore `credential_hash` and `credential_generation` with each kiosk row
   (`exporter.py:137-140`). A hash is not a credential, but say in `BACKUP_RESTORE.md` that the file now holds them.
7. `npm run gen:api`, commit `frontend/src/api/types.ts`.

**Agent (about 1 day)**

8. ⚠ Create, load and send the credential (bearer on all three calls), drive the `pair` flow with back-off, and
   report `kfeat=pair`. If the server says "unpaired" for a secret it once accepted, start pairing again rather
   than looping on 401s. Unit tests in `test_display_agent.py`.

**Installer and units (about half a day)**

9. Units: append `#pair=$(cat …)` to the start URL when the file exists (`calvin-kiosk-remote.service`,
   `calvin-cog.service`; the X11 and Wayland paths build the same URL). `install-kiosk.sh` and `setup-kiosk.sh`:
   accept `--pair-code` (and the baked `?pair=`), keep `/var/lib/calvin/agent` on reinstall. Bats tests.

**Browser (about 1 day)**

10. ⚠ `kioskId.js`: read and strip `#pair=` before the router or any request, swap it for the cookie, and
    `replaceState`. A full-screen pairing card while unpaired and pairing is possible; nothing changes for a
    plain browser tab. Vitest, plus an e2e check that the fragment is gone from `location` and never appears in a
    request URL or `Referer`.

**Settings (about 1 day)**

11. Screens: the paired/not-paired/needs-update line, **Pair a screen** (code entry), **Unpair**, the banner, the
    optional/required choice, and a one-time code in "Add a screen". Plain-words copy, vitest, a11y e2e.

**Docs (about half a day)**

12. `KIOSK_INSTALL.md` and `KIOSK_PROVISIONING.md` (pairing, reinstall, card swap, what is still open in optional
    mode), `ADMIN_AUTH.md` trust model, `BACKUP_RESTORE.md`.

**Tests that matter**

- Parametrised over `app.routes`: every `KIOSK_ROUTES` entry refuses no credential, another screen's credential,
  a revoked one, and an admin key with no kiosk principal where only the screen may write (or accepts admin where
  intended).
- In required mode, a forged poll with `khost` creates no row, changes no status and adds no `peer_ips`
  (regression on calvin-7aqu's rule).
- The config, list and overrides answers never contain `screenHold`, `power_hold`, `screenNow` or the
  display-check job for an anonymous caller, and do for the paired screen and for admin.
- Unpaired screen in either mode: the config read is 200 with layout and rotation. Never a 401.
- Pairing: a wrong code is rate-limited; a code expires; a code is single use; three pending rows per id at most;
  approving does not reveal the secret; the generation bump kills the cookie.
- Log redaction: a `clv_kiosk_…` or `clv_pair_…` in a query string or header never reaches a log line.
- Backup round trip keeps screens paired; an older backup (no hash) restores as unpaired, not broken.
- Old agent (no `kfeat=pair`) against the new server, in both modes: keeps its dashboard, and Settings shows
  "needs update".

**Size:** about 6 to 7 days including review. Ship it as two PRs: backend and agent first (high-risk paths:
`route_policy.py`, `kiosks.py`, `kiosk_registry`, Alembic), then the browser and Settings.

## Open questions for the owner

Most important first. My pick is marked ✔.

1. **Should a screen that isn't paired keep showing its dashboard?**
   - (a) Yes, always. It only loses holds, status reporting and the presence fields. ✔ A wall screen that goes blank
     after an update is worse than a leak that the banner tells you about.
   - (b) No: in required mode, an unpaired screen shows only the pairing card.
2. **How do existing screens move over?**
   - (a) Optional mode by default after the upgrade; the owner switches to required once Screens shows all paired;
     a paired screen is protected at once. ✔
   - (b) Required at once on upgrade, relying on (1a) to keep screens readable.
   - (c) Leave it optional for good.
3. **How does a new screen get paired?**
   - (a) Both: a code on the screen typed into Settings, and a one-time code in the "Add a screen" command. ✔
   - (b) Only the code on the screen (simpler; one more step at install).
   - (c) Only the install command (no pairing card; a browser-only tablet then needs another way).
4. **The rest of the dashboard stays readable by anyone on the home network** (calendar, photos, plugin data).
   Pairing closes the per-screen leak, not that one. Is that acceptable?
   - (a) Yes, keep the admin-auth design's line; revisit separately. ✔
   - (b) No: make dashboard reads need a paired screen or a session too, which is a much larger change (every phone
     and tablet that views the dashboard would need pairing).
5. **Where do the credential hashes live, and are they in backups?**
   - (a) In the kiosk row, included in backups, so a restore keeps screens paired. ✔
   - (b) In a file next to `api-keys.json`, not in backups: a restore means re-pairing every screen.
6. **Should a kiosk credential rotate on its own?**
   - (a) Not in the first version; unpair and pair again from Screens. ✔
   - (b) Yes, the server issues a new secret every few months through the config answer.
7. **Should `showUI` from an unpaired screen stay open?**
   - (a) Yes, it is presentational and already open for the household. ✔
   - (b) No, paired screens only.

## Could not answer from code or public docs

- The screen-power implementation itself (`feat/screen-power` is not on the remote yet). The fit in section 5 is
  checked against its research doc only.
- Whether cog (WPE WebKit) keeps an HttpOnly cookie across restarts in the kiosk's data directory the way Chromium's
  `--user-data-dir` profile does. If it does not, the fragment hand-off simply runs again at each start (the unit
  supplies it every time), so the design still works, but this needs a check on hardware.
- I found no official Fully Kiosk Browser documentation on how it stores start-URL credentials, so its row above
  rests on how such browsers are configured in general, not on their docs.
