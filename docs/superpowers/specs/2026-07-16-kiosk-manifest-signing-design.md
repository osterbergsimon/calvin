# Kiosk Manifest Signing (HMAC) — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorming), pending implementation plan
**Closes:** calvin-5vw. **Follows:** calvin-l83 / the authoritative-updater work (5ti+ixk+0ug, PR #103).
**Forward-composes with:** calvin-580 (KDF-derived per-kiosk keys — no kiosk-side rework).

## Problem

The kiosk update channel has **integrity** (sha256) but no **authenticity**: the manifest and
its files come from the same plain-HTTP backend over the LAN, and the updater runs as **root**.
A LAN attacker who can MITM the backend can serve a malicious manifest plus matching-sha
malicious files and obtain root on every kiosk. The authoritative-updater spec documented this
as an accepted risk explicitly to be closed here.

The fix must respect two hard constraints from the existing design:

- **The kiosk is dependency-free.** The updater and agent are pure-stdlib `python3` — no pip
  packages on a bare Pi. So verification must use only the standard library.
- **No trust-on-first-use window.** The provisioning bake step runs on the operator's
  workstation, which reaches the server over a trusted path; it is the out-of-band channel used
  to plant trust before the kiosk ever talks to the backend over the LAN.

## Decision: HMAC-SHA256 with a shared, baked secret

Python's stdlib provides `hmac` + `hashlib` on both sides; it does **not** provide Ed25519
(that needs a native `cryptography`/`PyNaCl` wheel, which would break the dependency-free
kiosk). HMAC-SHA256 closes the LAN-MITM threat with **zero new dependencies** on backend or
kiosk.

**Key scope: one shared deployment key** (this spec). The manifest is a global artifact
(`build_manifest()` is identical for every kiosk), so a single key signs the single manifest and
every kiosk verifies with the same baked secret. Residual risk: the secret lives on every kiosk,
so a kiosk that is *already root-compromised* holds a secret usable to forge to another kiosk the
attacker can also MITM — narrow lateral movement after an already-total local compromise.
**KDF-derived per-kiosk keys (calvin-580)** remove that residual risk later; because the
kiosk-side verification here is deliberately **key-source-agnostic** (bake a key, verify the
manifest HMAC with it), that upgrade needs no kiosk rework.

## Non-goals

- **Asymmetric signatures / public-key distribution** — rejected: needs a native crypto lib on
  the kiosk. (HMAC symmetric is sufficient for the LAN-MITM threat.)
- **Confidentiality / encryption of the update channel** — out of scope; this is about
  authenticity only. The bundle is not secret.
- **Serving the secret over the network** — explicitly forbidden (see §3). The secret travels
  out-of-band only.
- **Per-kiosk keys, key rotation tooling, revocation** — deferred (calvin-580 for per-kiosk;
  rotation is a documented manual re-bake).
- **Transferring a per-kiosk key over the wire after a shared-key handshake** — rejected during
  brainstorming: it reintroduces a TOFU/MITM window and needs encryption for confidentiality; the
  KDF derivation (calvin-580) achieves per-kiosk isolation without any wire transfer.

## Design

### 1. Backend key management — `backend/app/services/kiosk_signing.py` (new)

A small, single-responsibility module: load-or-create the key, sign, verify.

- New setting `kiosk_signing_key_path: Path` (default `./data/kiosk-signing.key`), added to
  `backend/app/config.py` `Settings`.
- `load_or_create_key(path) -> bytes`: if the file exists, read the hex and return the decoded
  bytes. Otherwise generate `secrets.token_hex(32)` (256-bit), write it with
  `os.open(path, O_CREAT|O_EXCL|O_WRONLY, 0o600)` then `os.write`; if a concurrent creator won
  the race (`FileExistsError`), read the existing file. Return the decoded key bytes.
- The resolved key path is logged once at startup (via the existing lifespan/init path) so the
  operator knows where to read it from — the value is never logged.
- `canonical(manifest: dict) -> bytes`: `json.dumps(manifest, sort_keys=True,
  separators=(",", ":")).encode()`. Manifest values are only str/int/bool/list/dict (no floats),
  so this round-trips identically on both sides.
- `sign(manifest, key) -> str`: `hmac.new(key, canonical(manifest), hashlib.sha256).hexdigest()`.
- `verify(manifest_without_sig, signature_hex, key) -> bool`: recompute and
  `hmac.compare_digest`.

### 2. Signing the manifest — `kiosk_bundle.py` + the manifest route

- `build_manifest()` is unchanged (produces the unsigned dict).
- New `build_signed_manifest(root=None) -> dict`: `m = build_manifest(root)`; `sig =
  kiosk_signing.sign(m, key)`; return `{**m, "signature": sig, "sig_alg": "hmac-sha256"}`. The
  signature fields are **siblings** of the signed content, never part of the canonical bytes.
- `GET /api/kiosks/agent/manifest` returns `build_signed_manifest()`. The backend **always
  signs** (key auto-created) — no toggle. Old kiosks ignore the two extra keys (they already
  ignore unknown fields), so the wire change is backward-compatible.
- The manifest **version hash is unchanged** — `_version_from` still hashes `name:sha256` only;
  signing does not perturb it.

### 3. Obtaining the secret for baking (out-of-band)

There is no public key to publish — with HMAC the secret *is* the verifier, so it must **never**
be served over the LAN (that would leak it to the very attacker we defend against, or reintroduce
TOFU). The operator reads it from the server out-of-band, over their existing trusted server
access:

```
cat <kiosk_signing_key_path>       # e.g. cat ./data/kiosk-signing.key on the server
```

and passes the hex to provisioning:

- `scripts/bake-kiosk-firstrun.sh` gains `--signing-key <hex>` (and `--signing-key-file <path>`
  reading a local copy) → writes `CALVIN_KIOSK_SIGNING_KEY=<hex>` into the baked
  `/etc/default/calvin-kiosk`.
- `scripts/setup-kiosk.sh` gains `--signing-key <hex>` → same, for manual installs (threaded
  through `install_kiosk_config`, preserved across env-file rewrites like `CALVIN_KIOSK_ID`).
- Omitting it → `CALVIN_KIOSK_SIGNING_KEY` absent → current LAN-trust behavior (opt-in per
  kiosk).

### 4. Kiosk verification — fail-closed when a key is present

The env file gains `CALVIN_KIOSK_SIGNING_KEY` (hex, or absent). Verification is pure stdlib
(`hmac` + `hashlib`, `compare_digest`): parse the fetched manifest JSON, remove the `signature`
and `sig_alg` keys, recompute `canonical()` over the remainder, HMAC with the decoded key, and
`compare_digest` against the provided `signature`.

Applied wherever the manifest is fetched-and-trusted:

- **`deploy/kiosk-agent/update-kiosk.sh`** — verify **immediately after** fetching the manifest,
  **before** the min_python check, file parsing, or any download. Covers the default update path
  and `--bootstrap` (both fetch the manifest through this code). `--self-check` also verifies
  (catches a misconfigured/rotated key early, read-only).
- **`bootstrap_kiosk()` in `scripts/setup-common.sh`** — the critical first fetch: it selects and
  runs the root updater *by sha from the manifest*. It must verify the manifest signature with
  the baked key **before** trusting that sha and running the updater. A small verify snippet is
  duplicated here (justified: it is the trust bootstrap; the updater it is about to run cannot be
  trusted to verify itself).

**Rules when `CALVIN_KIOSK_SIGNING_KEY` is set (non-empty):**

- Valid signature → proceed.
- Invalid signature → abort: `write_state error verify "manifest signature invalid" "$version"`,
  install nothing. (`bootstrap_kiosk` `error_exit`s without running the updater.)
- **Missing signature** (`signature`/`sig_alg` absent) → **also abort**. This is the
  **downgrade defense**: an attacker must not be able to strip the signature to fall back to
  LAN-trust. Message: `manifest signature required but missing`.
- **Unknown `sig_alg`** (present but not `hmac-sha256`) → **abort** (fail closed). The kiosk
  implements only HMAC-SHA256; it must not silently accept a signature it cannot check, nor treat
  an unknown algorithm as "unsigned". Message: `unsupported manifest sig_alg`.

**When `CALVIN_KIOSK_SIGNING_KEY` is unset/empty:** no verification — unchanged behavior
(backward compatible with existing kiosks and existing tests).

This closes the MITM: without the secret an attacker can neither forge a valid tag nor strip the
signature to downgrade.

### 5. Rollout / compatibility

- The backend must be on this version before baking keys onto kiosks (it always signs after this
  change). A keyed kiosk pointed at an older, unsigned backend fails closed — correct for a
  security control; documented.
- The signature covers the manifest; individual files are chained via the manifest's per-file
  sha256 (the updater already verifies each downloaded file against its manifest sha). So signing
  the manifest authenticates the whole bundle.
- **Key rotation** = regenerate `kiosk-signing.key` on the server and re-bake / re-run
  `--signing-key` on the affected kiosks. No rotation tooling (YAGNI). Documented.

## Testing

### Backend — `backend/tests/unit/test_kiosk_signing.py` + `test_kiosk_bundle.py`

- `load_or_create_key`: creates a 64-hex-char file at `0600` when absent; returns the same key on
  a second call (idempotent); does not overwrite an existing key.
- `build_signed_manifest`: carries `sig_alg == "hmac-sha256"` and a `signature` that
  `kiosk_signing.verify` accepts for the canonical manifest; the version hash equals the unsigned
  manifest's (signing doesn't perturb `_version_from`).
- Tamper detection: flipping any file `sha256`, bumping `version`, or editing the `signature`
  each makes `verify` return `False`.
- `canonical` is stable/sorted and excludes the signature siblings.

### Updater — `scripts/tests/test_update_kiosk.sh` (extend; mocked curl/systemctl)

- **key set + valid signature** → update proceeds and installs as today.
- **key set + tampered manifest** (sha/version changed after signing) → abort with `error`/`verify`,
  nothing installed.
- **key set + tampered/garbage signature** → same abort.
- **key set + missing signature** (manifest without `signature`) → abort (downgrade defense),
  nothing installed.
- **no key set** → all pre-existing blocks pass unchanged (backward compatibility).
- The mock manifest gains a correctly-computed HMAC (a tiny helper signs the mock manifest with
  the test key using the same canonicalization).

### Setup — `scripts/tests/test_setup_kiosk_bundle.sh` (extend) + env-write coverage

- `--signing-key <hex>` writes `CALVIN_KIOSK_SIGNING_KEY=<hex>` to the env file.
- `bootstrap_kiosk` with a key set + valid manifest signature → verifies, then runs `--bootstrap`.
- `bootstrap_kiosk` with a key set + bad/missing manifest signature → aborts; the updater is
  **never executed** (marker not written).

## Files touched

| File | Change |
|---|---|
| `backend/app/services/kiosk_signing.py` | New: key load/create, canonical, sign, verify |
| `backend/app/config.py` | New `kiosk_signing_key_path` setting |
| `backend/app/services/kiosk_bundle.py` | `build_signed_manifest()` |
| `backend/app/api/routes/kiosks.py` | manifest route returns signed manifest |
| `backend/app/main.py` (or lifespan/init) | log key path once at startup |
| `deploy/kiosk-agent/update-kiosk.sh` | verify signature post-fetch (update + bootstrap + self-check) |
| `scripts/setup-common.sh` | `bootstrap_kiosk` verifies signature; env plumbing |
| `scripts/setup-kiosk.sh` | `--signing-key` arg → env file |
| `scripts/bake-kiosk-firstrun.sh` | `--signing-key` / `--signing-key-file` → baked env |
| `docs/setup/KIOSK_PROVISIONING.md` | signing section: obtain key, bake, fail-closed, rotation |
| tests | backend signing tests; updater sig tests; setup sig tests |

## Follow-ups (bd)

- **calvin-580** — KDF-derived per-kiosk keys (`Ki = HMAC(master, kiosk_id)`); removes the
  shared-key lateral-movement residual with no kiosk-side rework.
