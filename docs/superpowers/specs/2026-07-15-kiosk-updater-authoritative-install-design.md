# Kiosk Updater — Authoritative Install & Decommission — Design

**Date:** 2026-07-15
**Status:** Approved (brainstorming), pending implementation plan
**Follows:** calvin-l83 (kiosk updater self-verification). **Bundles:** calvin-5ti (bootstrap), calvin-ixk (enable new units), calvin-0ug (remove dropped files).
**Precedes:** calvin-5vw (baked-key manifest signing — closes accepted-risk #4 below).

## Problem

The kiosk updater (`deploy/kiosk-agent/update-kiosk.sh`) safely updates the agent and
systemd units — verify (sha256 + `py_compile` + `bash -n` + `--self-check`) → backup → atomic
swap of changed files → restart only affected services → auto-rollback if the agent is
unhealthy. Self-verification (calvin-l83) made it safe for the updater to replace itself. What
remains for "provision a kiosk once and never touch it again" is making the updater the
**single, authoritative** manager of kiosk-side state:

1. **First-boot install still bypasses the updater.** `setup-kiosk.sh` calls a *second,
   duplicate* fetch→verify→install→seed implementation, `install_kiosk_bundle` (in
   `setup-common.sh`). Two code paths install the same bundle; only one is hardened. (calvin-5ti)
2. **New always-on units can't arrive via an update.** The set of units enabled on boot is a
   hardcoded list in `setup-kiosk.sh`. A future bundle that adds a new service installs its unit
   *file* but nothing enables/starts it — so the "never touch again" promise fails for new
   services. (calvin-ixk)
3. **Dropped components are never removed.** When a file/unit leaves the bundle, the updater has
   no record of what it previously installed, so the stale file/unit lingers forever. (calvin-0ug)

## Goal

Make `update-kiosk.sh` the one path that installs, enables, and decommissions kiosk-side bundle
state — for both first boot and every subsequent update — so that any future kiosk-side change
(new agent, new unit, removed unit) is delivered through the already-hardened updater with no
manual Pi intervention.

## Non-goals

- **Manifest authenticity / anti-MITM (signing).** Deferred to calvin-5vw — see accepted-risk
  #4. This spec keeps the existing LAN-trust model and documents the residual risk explicitly.
- **A/B (dual-bank) or transactional/image-based updates.** Those solve *whole-OS* atomic
  rollback; this is a 6-file application-level bundle. The in-place-swap + health-gated-rollback
  tier is the right one for this scope (see "Mechanism & known limits").
- **Anti-rollback / monotonic versioning.** The version is a content hash ("different", not
  "newer"). A server rolled back to an older bundle will be adopted. Accepted for a
  single-source-of-truth home server; the `last_failed_version` guard still prevents loops. (#5)

## Design

### Modes of `update-kiosk.sh`

One hardened apply path serves three modes, selected by the first argument:

- `--self-check` (exists) — read-only manifest fetch/parse; mutates nothing.
- `--bootstrap` (**new — calvin-5ti**) — first-boot install: fetch → verify → swap → enable →
  seed, with **no** restart, health check, or rollback (nothing is running yet; the Pi reboots
  after provisioning).
- default `update` (exists — **extended by calvin-ixk + calvin-0ug**).

### 1. Manifest + bundle (`backend/app/services/kiosk_bundle.py`)

Add one field to `BundleFile` and to each manifest file entry: `enable: bool`.

- `True` for the three always-on service units: `calvin-display-agent.service`,
  `calvin-kiosk-remote.service`, `calvin-x.service`.
- `False` for `calvin-kiosk-update.service` (oneshot, triggered on demand — never enabled),
  `calvin_display_agent.py`, and `update-kiosk.sh`.

`build_manifest()` emits `"enable"` per file. The version hash (`_version_from`) is unchanged
(still `name:sha256`), so adding the field does not spuriously bump the version. Already-deployed
old updaters ignore the unknown `enable` field (backward compatible).

### 2. Device receipt (enables calvin-0ug)

A new receipt file records what the last successful apply installed, so the updater can detect
drops on the next apply:

`/var/lib/calvin/agent-manifest.json`:

```json
{"version": "<16hex>", "files": [{"name": "...", "target_path": "...", "enable": true}]}
```

Written atomically (see #2 hardening) on every successful apply — bootstrap, update, and noop.
A missing or unparseable receipt is treated as **empty** (→ no drops detected → safe: nothing is
decommissioned).

### 3. `--bootstrap` mode (calvin-5ti)

Reuses the existing fetch/verify/stage/swap loop unchanged (so the `--self-check` gate on a
staged `update-kiosk.sh` and all checksum/`py_compile`/`bash -n` verification still apply). After
the swap loop:

1. `daemon-reload` (unit files were installed).
2. `systemctl enable` every `enable:true` unit (idempotent).
3. Seed `agent-version.json` **and** the receipt (atomically, strictly last).
4. `write_state success bootstrap "installed <version>"`; exit 0.

**No restart, no health check, no rollback.** Idempotent: a re-run with nothing changed is a
`noop` that still (re-)seeds version + receipt. At bootstrap the receipt starts empty, so drop
detection is a natural noop.

`setup-kiosk.sh` rewire:

- Replace the `install_kiosk_bundle` call with a small `bootstrap_kiosk()` shim: fetch the
  manifest → extract `update-kiosk.sh`'s `sha256` → fetch that one file → **verify its sha
  against the manifest** → `CALVIN_BACKEND_URL=<url> bash <tmpfile> --bootstrap`. This ~10-line
  shim is the irreducible kernel that places the first updater; everything else moves into
  `--bootstrap`.
- **Delete `install_kiosk_bundle`** from `setup-common.sh`.
- Drop the hardcoded `enable` list from `install_kiosk_services` — the updater now owns
  enablement. Keep the ordered immediate `start` (`calvin-x` → sleep → `calvin-kiosk-remote` →
  `calvin-display-agent`) for the manual-operator "up immediately" UX; on reboot the units come
  up because `--bootstrap` enabled them.

### 4. Enable brand-new units on update (calvin-ixk)

In the default update path, a unit is **newly introduced** when its `target_path` did not exist
before this run (its `installed_sha` was empty). Newly-introduced units are **excluded from the
restart set** (`RESTART_UNITS` is populated only for units whose target already existed — i.e.
in-place updates); they are handled exclusively by the post-health path below. This keeps all
new-unit state out of the rollback envelope.

After the agent health check passes, for each newly-introduced `enable:true` unit: `systemctl
enable` + `systemctl start` (a fresh always-on service; the box is already running, so it should
run now, not only after the next reboot). Existing units continue through the current
`restart_unit` logic (which runs before the health check, as today). A new unit that fails to
start is logged non-fatally — the agent health gate governs rollback, not peripheral units.
Enable is asserted idempotently.

### 5. Remove dropped files/units (calvin-0ug)

Drops = receipt entries whose `name` is absent from the new manifest. Decommission runs **only
after the agent health check passes**, so it never needs to be rolled back. For each drop:

- if it is a unit (`target_path` under `$SYSTEMD_DIR` and ends `.service`): `systemctl stop` +
  `systemctl disable`;
- `rm -f "$target_path"`;
- `daemon-reload` once if any unit was removed.

Then the new receipt is written. At bootstrap the receipt is empty, so this is a noop.

### 6. Ordering (default update path)

```
stage + verify changed files (checksum, py_compile, bash -n, updater --self-check)
backup changed files
swap changed files (install, new inode)
daemon-reload (if any unit file changed)
restart changed units — pre-existing in-place updates only (existing restart_unit logic)
health-check agent (active + ready marker within timeout)
  ├─ unhealthy → roll back changed files + daemon-reload + restart; exit 1
  │              (no new-unit enablement or decommission has run yet — nothing else to undo)
  └─ healthy → continue
── post-health reconciliation (never in the rollback envelope) ──
enable + start newly-introduced enable:true units               [ixk]
decommission drops (stop/disable unit, rm file, daemon-reload)  [0ug]
seed agent-version.json + receipt (atomically, STRICTLY LAST)   [hardening #1, #2]
write_state success complete
```

Newly-introduced units and dropped units are both reconciled **only after** the agent is
confirmed healthy, so neither is ever in the rollback envelope: rollback reverts changed files
only. This is why new-unit enablement needs no track-and-undo bookkeeping.

## Hardening (folded in from mechanism review)

These make load-bearing safety properties explicit rather than accidental:

1. **Version + receipt are seeded strictly last**, after decommission. This is the safety net
   for the non-atomic multi-file swap: if power is lost mid-swap, the version file is not
   advanced, so the backend still sees the old version, the update flag stays set, the next poll
   re-fires the updater, and the checksum loop re-syncs any half-written file. Documented as a
   guaranteed invariant, not a side effect.
2. **All state files are written atomically** (temp file + `rename` on the same filesystem):
   `agent-version.json`, `agent-manifest.json` (receipt), and `agent-update-state.json`. SD cards
   on Raspberry Pis lose power routinely; a truncated receipt must never corrupt the next update.
   A missing/unparseable receipt is treated as empty (safe).
3. **New-unit enablement and decommission are post-health, so they stay out of the rollback
   envelope.** Both `enable`+`start` of newly-introduced units (ixk) and decommission of dropped
   units (0ug) run only after the agent health check passes; newly-introduced units are also
   excluded from the pre-health restart set. Rollback therefore reverts changed files only and
   never has to undo an `enable` symlink or a started process — no track-and-undo bookkeeping is
   needed. (This is the reordered resolution of the review finding that a rollback would
   otherwise leave a newly-enabled unit dangling.)
4. **Accepted risk — integrity, not authenticity (LAN-trust).** The manifest's sha256 values
   come from the same plain-HTTP backend over the LAN, and the updater runs as **root**. A LAN
   MITM can serve a malicious manifest plus matching-sha malicious files and obtain root on every
   kiosk. This is the existing LAN-trust posture (same as `/api/config`), now stated explicitly
   because self-updating-as-root raises the stakes. **Closed by calvin-5vw** (baked-key manifest
   signing, using the bake step as an out-of-band trust channel so there is no trust-on-first-use
   window). Documented in `KIOSK_PROVISIONING.md`.
5. **Accepted risk — non-monotonic version, no anti-rollback** (see Non-goals). One-line note in
   docs.

## Mechanism & known limits (for reviewers)

This is an application-level self-updater on a trusted LAN, not an OS image updater. In-place
per-file `install` is **not atomic across the file set**; the safety net is invariant #1
(version seeded last → interrupted update re-fires and self-heals via the checksum loop). Whole
atomicity (A/B banks, symlinked release dir) is out of scope and unwarranted for a 6-file bundle
whose targets are fixed paths under `/usr/local/bin` and `/etc/systemd/system`. Self-replacement
of the running updater is safe because `install` gives the new file a new inode while the running
bash process keeps reading the old, unlinked inode. systemd serializes the oneshot, so a manual
trigger and the agent trigger cannot double-run.

## Testing

### `scripts/tests/test_update_kiosk.sh` (extend; mocked `curl`/`systemctl`, temp filesystem)

- **bootstrap installs fresh** — with nothing installed, `--bootstrap` fetches+verifies+installs
  every file, `enable`s the three `enable:true` units, seeds `agent-version.json` **and** the
  receipt, records **no** `systemctl restart`/health calls, exits 0.
- **bootstrap idempotent** — a second `--bootstrap` with an unchanged manifest is a `noop`
  (nothing swapped) but still seeds version + receipt; exits 0.
- **update enables + starts a new unit** — a manifest gaining a new `enable:true` unit →
  after health passes the unit is `enable`d and `start`ed; pre-existing units are not
  re-enabled redundantly in a way that changes behavior.
- **update decommissions a dropped unit** — receipt lists a unit absent from the new manifest →
  after health passes it is `stop`+`disable`d and its file removed; happens **only** after the
  health check.
- **unhealthy update rolls back changed files and reconciles nothing** — agent unhealthy →
  changed files roll back; because new-unit enable/start and decommission are both post-health,
  neither ran, so a would-be-new unit is never enabled/started and a would-be-dropped unit is
  left intact.
- **receipt contents** — after a successful apply the receipt lists exactly the applied files'
  `name`/`target_path`/`enable`; a missing/corrupt receipt on the next run is treated as empty
  (no spurious decommission).
- **atomic state writes** — version file, receipt, and state file are written via a temp file +
  rename (assert no partial/temp file remains and content is valid JSON).

### `scripts/tests/test_setup_kiosk_bundle.sh` (reframe as a bootstrap test)

- `setup-kiosk`'s `bootstrap_kiosk()` fetches the manifest, fetches `update-kiosk.sh`, **verifies
  its sha against the manifest**, and invokes it `--bootstrap`; a checksum mismatch on the
  updater aborts. The old `install_kiosk_bundle` happy-path/negative assertions are removed with
  the deleted function.

### Backend

- `test` for `build_manifest()` including `enable` per file with the correct true/false split.
- Regenerate the OpenAPI snapshot if the manifest response is typed (`UPDATE_OPENAPI_SNAPSHOT=1`
  + `npm run gen:api`).

## Docs

- `docs/setup/KIOSK_PROVISIONING.md`: update the self-update section for `--bootstrap` as the
  single install path; add the enable-new-units and remove-dropped-files behavior; document
  accepted-risks #4 (with the pointer to calvin-5vw) and #5, and invariant #1 (interrupted-update
  self-heal).

## Follow-ups (filed as bd issues)

- **calvin-5vw** — Baked-key manifest signing: close LAN-MITM on the kiosk update channel
  (the immediate next spec; closes accepted-risk #4).
