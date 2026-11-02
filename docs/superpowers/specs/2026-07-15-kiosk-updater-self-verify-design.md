# Kiosk Updater Self-Verification — Design

**Date:** 2026-07-15
**Status:** Approved (brainstorming), pending implementation plan
**Follows:** calvin-lxw (kiosk-agent self-update). **Precedes:** updater-driven bootstrap (tracked separately).

## Problem

The kiosk updater (`deploy/kiosk-agent/update-kiosk.sh`) safely updates the agent and
systemd units — verify (sha256 + `py_compile`) → backup → atomic swap of changed files →
restart only affected services → auto-rollback if the agent is unhealthy. But the updater is
part of its own bundle (`update-kiosk.sh` and `calvin-kiosk-update.service` are in
`BUNDLE_FILES`), and it is the **one component not protected by that safety net**:

- The health check + rollback only fire when `calvin-display-agent.service` is among the
  restarted units. The updater's bundle entries have `restart_unit = None`, so a change to
  *only* the updater triggers no restart, no health check, and no rollback.
- A syntactically or structurally broken new `update-kiosk.sh` would be swapped in, this run
  would finish fine (the agent is untouched), and the breakage would surface only on the
  **next** update — with no automatic recovery.

This matters because the updater is the **bootstrap for every future kiosk-side change**: as
long as it can always *safely replace itself* with a verified-good new updater, any capability
it lacks can be delivered later through the updater itself, with no manual Pi intervention. So
safe self-replacement is the linchpin of "provision a kiosk once and never touch it again."

## Goal

Guarantee the updater never transitions into a broken state: a new `update-kiosk.sh` is
verified **before** it is trusted, and a bad one aborts the whole update atomically, leaving
the known-good updater installed.

## Non-goals

- **Enabling brand-new systemd units** on update (a new always-on service starting on boot) —
  deferred, reachable later via the hardened updater. Tracked separately.
- **Removing files/units dropped from the bundle** (decommissioning a component) — deferred,
  same rationale. Tracked separately.
- **Updater-driven bootstrap** (making the updater the single install path, collapsing
  `install_kiosk_bundle`) — the immediate next piece, its own spec.
- Verifying `.service` unit files with `systemd-analyze verify` (needs systemd, noisy) — out.

## Design

### 1. `--self-check` mode (new, in `update-kiosk.sh`)

`update-kiosk.sh --self-check` exercises the updater's read/startup plumbing and **mutates
nothing**:

1. Source the env file; require `CALVIN_BACKEND_URL`.
2. `curl` the manifest from `$CALVIN_BACKEND_URL/api/kiosks/agent/manifest`.
3. Parse it with `python3` (must yield a `version` and a `files` list).
4. Exit `0` on success, non-zero on any failure.

It must **not**: swap files, restart services, write the state file, write the version file,
create backups, or touch the ready marker. Because it triggers no update, it cannot recurse.
It honors the existing overrides (`CALVIN_CURL`, `CALVIN_PYTHON`, `CALVIN_SYSTEMCTL`,
`CALVIN_AGENT_STATE_DIR`, `CALVIN_KIOSK_ENV_FILE`) so tests mock it and production hits the real
backend. Implemented as an early branch at the top of the script (after option parsing, before
any mutating work).

### 2. Verify-phase integration (pre-swap, abort-whole-on-fail)

In the existing pre-swap verify loop (`update-kiosk.sh` ~L68–82, where the agent is already
`py_compile`d), add per-file checks on the **staged** copy in `$STAGE`:

- any `*.sh` file → `bash -n "$STAGE/<name>"` (syntax);
- the updater specifically (`name == "update-kiosk.sh"`) → additionally
  `bash "$STAGE/update-kiosk.sh" --self-check`, run with the current environment.

If either fails: `write_state error verify "<reason>" "$version"` and `exit 1`. This runs
**before any file is swapped**, so a bad new updater aborts the entire update atomically — the
installed updater stays byte-identical and nothing else changes. This upholds the existing
"verify everything before swapping anything" invariant and closes the "no health-check/rollback
for an updater-only change" gap: the updater is now verified even though it is never restarted.

The `# atomic replace` comment on the swap `install` line is corrected (it describes a
new-inode replacement, not an atomic rename).

### 3. Residual risk (documented, not solved here)

`bash -n` + a fetch/parse dry-run catches *dead-on-arrival* updaters — syntax errors, broken
startup, unbound-variable-under-`set -u`, config/fetch/parse failures — which is the
overwhelmingly common breakage. It does not exercise the swap/restart path of a hypothetical
updater that starts cleanly but misbehaves only mid-apply. That residual case is bounded by the
existing durable no-retry guard (`last_failed_version`), which prevents a failing version from
looping. Documented in `KIOSK_PROVISIONING.md`.

## Testing

Extend `scripts/tests/test_update_kiosk.sh` (mocked `curl`/`systemctl`, temp filesystem):

- **valid new updater** — a staged `update-kiosk.sh` that passes `bash -n` and `--self-check`
  is adopted and installed; the run completes success.
- **broken-syntax new updater** — a staged `update-kiosk.sh` with a syntax error → whole update
  aborts; the installed updater is byte-identical to before; `agent-update-state.json` shows
  `error`/`verify`; no other changed file was swapped.
- **self-check-failing new updater** — a staged updater that parses (`bash -n` passes) but whose
  `--self-check` exits non-zero (simulated via an unreachable backend / malformed manifest for
  the self-check subprocess) → same atomic abort + intact installed updater.
- **`--self-check` mode contract** — exits `0` on a good mocked manifest; exits non-zero when the
  backend is unreachable; and provably mutates nothing (no state file, no version file, no swap,
  no `systemctl` restart calls recorded in the mock log).

## Follow-ups (filed as bd issues)

- Updater-driven bootstrap: `update-kiosk.sh --bootstrap` (install-only, no restart/health),
  rewire `setup-kiosk.sh` to install + run it, delete the duplicate `install_kiosk_bundle`.
- Updater: `systemctl enable` brand-new units declared in the manifest.
- Updater: remove installed files/units that have been dropped from the bundle.
