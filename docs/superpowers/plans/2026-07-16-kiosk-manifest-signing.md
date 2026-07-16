# Kiosk Manifest Signing (HMAC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticate the kiosk update channel with HMAC-SHA256: the backend signs the manifest with a shared secret; a kiosk that has the secret baked (out-of-band) verifies the signature and fails closed on any invalid/missing/unknown-algorithm signature, closing the LAN-MITM.

**Architecture:** Backend auto-generates a `0600` shared secret, signs `build_manifest()` output (`{...manifest, signature, sig_alg}`). The operator carries the secret out-of-band to provisioning, which writes it to a dedicated `0600` `/etc/default/calvin-kiosk-signing`. The updater and the `bootstrap_kiosk` shim verify the manifest signature (pure stdlib `hmac`) before trusting anything; no key configured → unchanged LAN-trust.

**Tech Stack:** Python stdlib `hmac`/`hashlib`/`secrets` (backend + kiosk); FastAPI; bash + python3 provisioning scripts; pytest + shell test harnesses.

## Global Constraints

- **Stdlib only** for signing/verification — `hmac` + `hashlib` on both sides. No new pip dependency on backend or kiosk (no `cryptography`/PyNaCl). Updater/setup scripts stay pure bash + python3, no jq.
- **Canonical form for signing is identical on both sides:** `json.dumps(manifest, sort_keys=True, separators=(",", ":"))` over the manifest dict **without** the `signature`/`sig_alg` keys.
- **Signature fields are siblings** of the signed content: `signature` (hex) and `sig_alg` (`"hmac-sha256"`), never part of the canonical bytes.
- **Backend always signs** (key auto-created); the manifest **version hash is unchanged** (`_version_from` still hashes `name:sha256` only).
- **The secret lives in a dedicated `0600` root-only file** `/etc/default/calvin-kiosk-signing` (override `CALVIN_KIOSK_SIGNING_ENV_FILE`), never the world-readable `/etc/default/calvin-kiosk`.
- **Kiosk fails closed when a key is present:** invalid signature, **missing signature** (downgrade defense), or **unknown `sig_alg`** each abort with nothing installed. **No key present → no verification** (unchanged behavior; all pre-existing tests must still pass).
- Preserve the updater's existing env overrides (`CALVIN_CURL`, `CALVIN_SYSTEMCTL`, `CALVIN_PYTHON`, `CALVIN_AGENT_STATE_DIR`, `CALVIN_SYSTEMD_DIR`, `CALVIN_AGENT_READY_MARKER`, `CALVIN_KIOSK_ENV_FILE`, `CALVIN_UPDATE_HEALTH_TIMEOUT`) and add `CALVIN_KIOSK_SIGNING_ENV_FILE`.
- LAN-trust residual (shared key) is deferred to **calvin-580** (KDF per-kiosk); do not build per-kiosk keys here.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `backend/app/services/kiosk_signing.py` | New: key load/create (0600), canonical, sign, verify | T1 |
| `backend/app/config.py` | New `kiosk_signing_key_path` setting | T1 |
| `backend/app/services/kiosk_bundle.py` | `build_signed_manifest()` | T1 |
| `backend/app/api/routes/kiosks.py` | manifest route returns signed manifest | T1 |
| `backend/tests/unit/test_kiosk_signing.py` | signing-module tests | T1 |
| `backend/tests/unit/test_kiosk_bundle.py` | signed-manifest tests | T1 |
| `deploy/kiosk-agent/update-kiosk.sh` | source signing file; `verify_manifest_sig`; enforce (update + self-check) | T2 |
| `scripts/tests/test_update_kiosk.sh` | updater signature blocks | T2 |
| `scripts/setup-common.sh` | `install_signing_key`; `bootstrap_kiosk` verifies signature | T3 |
| `scripts/setup-kiosk.sh` | `--signing-key` arg → writes signing file before bootstrap | T3 |
| `scripts/tests/test_setup_kiosk_bundle.sh` | setup signature blocks | T3 |
| `scripts/bake-kiosk-firstrun.sh` | `--signing-key`/`--signing-key-file` → first-boot writes `0600` signing file | T4 |
| `scripts/tests/test_bake_kiosk_firstrun_emit.sh` | bake signing-key coverage | T4 |
| `docs/setup/KIOSK_PROVISIONING.md` | signing section | T5 |

## How to run tests

```bash
cd backend && uv run pytest tests/unit/test_kiosk_signing.py tests/unit/test_kiosk_bundle.py -v
bash scripts/tests/test_update_kiosk.sh
bash scripts/tests/test_setup_kiosk_bundle.sh
bash scripts/tests/test_bake_kiosk_firstrun_emit.sh
```

---

### Task 1: Backend — signing module, signed manifest, route

**Files:**
- Create: `backend/app/services/kiosk_signing.py`
- Create: `backend/tests/unit/test_kiosk_signing.py`
- Modify: `backend/app/config.py` (add setting near the other system paths)
- Modify: `backend/app/services/kiosk_bundle.py` (add `build_signed_manifest`)
- Modify: `backend/app/api/routes/kiosks.py:75-78` (route returns signed manifest)
- Test: `backend/tests/unit/test_kiosk_bundle.py`

**Interfaces:**
- Produces:
  - `kiosk_signing.ALG = "hmac-sha256"`
  - `kiosk_signing.load_or_create_key(path: Path) -> bytes`
  - `kiosk_signing.canonical(manifest: dict) -> bytes`
  - `kiosk_signing.sign(manifest: dict, key: bytes) -> str`
  - `kiosk_signing.verify(manifest_without_sig: dict, signature: str, key: bytes) -> bool`
  - `kiosk_bundle.build_signed_manifest(root=None) -> dict` = `{**build_manifest(root), "signature": <hex>, "sig_alg": "hmac-sha256"}`
  - `settings.kiosk_signing_key_path: Path` (default `Path("./data/kiosk-signing.key")`)

- [ ] **Step 1: Write the failing signing-module tests**

Create `backend/tests/unit/test_kiosk_signing.py`:

```python
import stat

from app.services import kiosk_signing


def test_key_created_0600_and_idempotent(tmp_path):
    p = tmp_path / "sub" / "kiosk-signing.key"
    k1 = kiosk_signing.load_or_create_key(p)
    assert len(k1) == 32
    assert p.exists()
    assert stat.S_IMODE(p.stat().st_mode) == 0o600
    k2 = kiosk_signing.load_or_create_key(p)
    assert k1 == k2  # not regenerated


def test_canonical_is_sorted_and_compact():
    assert kiosk_signing.canonical({"b": 1, "a": 2}) == b'{"a":2,"b":1}'


def test_sign_verify_roundtrip_and_tamper():
    key = bytes(range(32))
    m = {"version": "abc", "files": [{"name": "x", "sha256": "0" * 64}]}
    sig = kiosk_signing.sign(m, key)
    assert kiosk_signing.verify(m, sig, key) is True
    assert kiosk_signing.verify({**m, "version": "abd"}, sig, key) is False
    assert kiosk_signing.verify(m, "deadbeef", key) is False
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_signing.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.kiosk_signing`.

- [ ] **Step 3: Create the signing module**

Create `backend/app/services/kiosk_signing.py`:

```python
"""HMAC-SHA256 signing for the kiosk bundle manifest (calvin-5vw)."""

import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path

from loguru import logger

ALG = "hmac-sha256"


def load_or_create_key(path: Path) -> bytes:
    """Return the 32-byte signing key at ``path``, creating it (0600) if absent."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return bytes.fromhex(path.read_text().strip())
    try:
        hex_key = secrets.token_hex(32)
        os.write(fd, hex_key.encode())
    finally:
        os.close(fd)
    logger.info(f"Generated kiosk manifest signing key at {path}")
    return bytes.fromhex(hex_key)


def canonical(manifest: dict) -> bytes:
    """Deterministic bytes for signing: sorted keys, no whitespace."""
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()


def sign(manifest: dict, key: bytes) -> str:
    return hmac.new(key, canonical(manifest), hashlib.sha256).hexdigest()


def verify(manifest_without_sig: dict, signature: str, key: bytes) -> bool:
    return hmac.compare_digest(sign(manifest_without_sig, key), signature)
```

- [ ] **Step 4: Run to verify the module tests pass**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_signing.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the setting**

In `backend/app/config.py`, in the "System paths (for Raspberry Pi deployment)" block (near `update_script_path`/`repo_dir`), add:

```python
    kiosk_signing_key_path: Path = Path("./data/kiosk-signing.key")
```

- [ ] **Step 6: Write the failing signed-manifest tests**

Add to `backend/tests/unit/test_kiosk_bundle.py` (the file already defines `_seed(tmp_path)` and imports `kiosk_bundle`):

```python
def test_signed_manifest_verifies(tmp_path, monkeypatch):
    from app.services import kiosk_signing

    _seed(tmp_path)
    keyfile = tmp_path / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    m = kiosk_bundle.build_signed_manifest(tmp_path)
    assert m["sig_alg"] == "hmac-sha256"
    unsigned = {k: v for k, v in m.items() if k not in ("signature", "sig_alg")}
    key = kiosk_signing.load_or_create_key(keyfile)
    assert kiosk_signing.verify(unsigned, m["signature"], key) is True
    # signing does not change the version hash
    assert unsigned["version"] == kiosk_bundle.build_manifest(tmp_path)["version"]


def test_signed_manifest_tamper_detected(tmp_path, monkeypatch):
    from app.services import kiosk_signing

    _seed(tmp_path)
    keyfile = tmp_path / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    m = kiosk_bundle.build_signed_manifest(tmp_path)
    key = kiosk_signing.load_or_create_key(keyfile)
    m["files"][0]["sha256"] = "f" * 64  # tamper after signing
    unsigned = {k: v for k, v in m.items() if k not in ("signature", "sig_alg")}
    assert kiosk_signing.verify(unsigned, m["signature"], key) is False
```

- [ ] **Step 7: Run to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_bundle.py -k "signed" -v`
Expected: FAIL — `AttributeError: module 'app.services.kiosk_bundle' has no attribute 'build_signed_manifest'`.

- [ ] **Step 8: Add `build_signed_manifest` and wire the route**

In `backend/app/services/kiosk_bundle.py`, add an import near the top (it already has `from app.config import settings`):

```python
from app.services import kiosk_signing
```

and add (after `build_manifest`):

```python
def build_signed_manifest(root: Path | None = None) -> dict:
    """build_manifest() plus an HMAC signature over its canonical form."""
    m = build_manifest(root)
    key = kiosk_signing.load_or_create_key(settings.kiosk_signing_key_path)
    return {**m, "signature": kiosk_signing.sign(m, key), "sig_alg": kiosk_signing.ALG}
```

In `backend/app/api/routes/kiosks.py`, change the manifest route body:

```python
@router.get("/kiosks/agent/manifest")
async def get_agent_manifest():
    """Serve the signed kiosk bundle manifest (version + per-file hashes + HMAC signature)."""
    return kiosk_bundle.build_signed_manifest()
```

- [ ] **Step 9: Run the backend suite for this area**

Run: `cd backend && uv run pytest tests/unit/test_kiosk_signing.py tests/unit/test_kiosk_bundle.py -v`
Expected: PASS (all — including the pre-existing manifest/version/enable tests).

Also confirm no OpenAPI drift (route returns an untyped dict, so none expected):
Run: `cd backend && uv run pytest -k openapi -q`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/app/services/kiosk_signing.py backend/app/config.py \
        backend/app/services/kiosk_bundle.py backend/app/api/routes/kiosks.py \
        backend/tests/unit/test_kiosk_signing.py backend/tests/unit/test_kiosk_bundle.py
git commit -m "feat(kiosk): HMAC-sign the bundle manifest (calvin-5vw)"
```

---

### Task 2: Updater — verify the manifest signature (fail-closed)

**Files:**
- Modify: `deploy/kiosk-agent/update-kiosk.sh`
- Test: `scripts/tests/test_update_kiosk.sh`

**Interfaces:**
- Consumes: the signed manifest from Task 1 (`signature`, `sig_alg` sibling keys).
- Produces:
  - The updater sources `SIGNING_ENV_FILE="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"` (after the main env file) to pick up `CALVIN_KIOSK_SIGNING_KEY`.
  - `verify_manifest_sig(manifest_json)` — returns 0 (ok, or no key configured); on failure prints a reason to stdout and returns non-zero.
  - Enforcement in the main update path (after the manifest fetch, before anything else) and in `--self-check`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_update_kiosk.sh` (before the final line). This adds a fixed test key, a `sign_manifest` helper, and the signature blocks:

```bash
# ===== manifest signature verification (calvin-5vw) =====
TEST_SIGNING_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Sign the JSON manifest at $1 in place (adds signature + sig_alg), using TEST_SIGNING_KEY.
sign_manifest() {
  CALVIN_KIOSK_SIGNING_KEY="$TEST_SIGNING_KEY" python3 - "$1" <<'PY'
import sys, json, hmac, hashlib, os
path = sys.argv[1]
m = json.load(open(path))
key = bytes.fromhex(os.environ["CALVIN_KIOSK_SIGNING_KEY"])
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
m["signature"] = hmac.new(key, canon, hashlib.sha256).hexdigest()
m["sig_alg"] = "hmac-sha256"
json.dump(m, open(path, "w"))
PY
}

# healthy systemctl (agent restart recreates the readiness marker)
cat > "$tmp/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$tmp/systemctl.log"
if [ "\$1" = "restart" ]; then ( sleep 1 && mkdir -p "$tmp/run" && touch "$tmp/run/agent-ready" ) & fi
case "\$1" in "is-active"|"show") exit 0;; esac
exit 0
EOF
chmod +x "$tmp/bin/systemctl"
export CALVIN_UPDATE_HEALTH_TIMEOUT=4

# Build a fresh unsigned manifest (agent-only) into $tmp/srv/manifest.json
build_sig_manifest() {
  printf 'import sys\nsys.exit(0)\n' > "$tmp/srv/calvin_display_agent.py"
  local sha; sha="$(sha256sum "$tmp/srv/calvin_display_agent.py" | cut -d' ' -f1)"
  echo 'print("OLD")' > "$tmp/local/calvin_display_agent.py"
  cat > "$tmp/srv/manifest.json" <<MEOF
{"version":"sigv000000000000","min_python":"3.9","files":[
 {"name":"calvin_display_agent.py","sha256":"$sha","mode":"0755",
  "target_path":"$tmp/local/calvin_display_agent.py","restart_unit":"calvin-display-agent.service","enable":false}]}
MEOF
  cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in
  */agent/manifest) cat "$tmp/srv/manifest.json"; exit 0;;
  */agent/files/calvin_display_agent.py) cat "$tmp/srv/calvin_display_agent.py"; exit 0;;
esac; done
exit 22
CEOF
  chmod +x "$tmp/bin/curl"
}

# A signing env-file the updater will source.
printf 'CALVIN_KIOSK_SIGNING_KEY=%s\n' "$TEST_SIGNING_KEY" > "$tmp/signing.env"

# --- valid signature + key set -> update proceeds ---
mkdir -p "$tmp/state_sig1"
build_sig_manifest; sign_manifest "$tmp/srv/manifest.json"
CALVIN_AGENT_STATE_DIR="$tmp/state_sig1" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env" \
  bash "$SCRIPT" || { echo "FAIL sig-valid: exited non-zero"; exit 1; }
grep -q 'sys.exit(0)' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-valid: agent not swapped"; exit 1; }
echo "PASS sig-valid"

# --- tampered manifest (field changed after signing) -> abort, nothing installed ---
mkdir -p "$tmp/state_sig2"
build_sig_manifest; sign_manifest "$tmp/srv/manifest.json"
sed -i 's/sigv000000000000/TAMPERED00000000/' "$tmp/srv/manifest.json"   # break the signed bytes
if CALVIN_AGENT_STATE_DIR="$tmp/state_sig2" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env" bash "$SCRIPT"; then
  echo "FAIL sig-tamper: should abort"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-tamper: agent swapped despite bad signature"; exit 1; }
grep -q 'verify' "$tmp/state_sig2/agent-update-state.json" || { echo "FAIL sig-tamper: no verify error state"; exit 1; }
echo "PASS sig-tampered-manifest"

# --- corrupt signature value -> abort ---
mkdir -p "$tmp/state_sig3"
build_sig_manifest; sign_manifest "$tmp/srv/manifest.json"
python3 - "$tmp/srv/manifest.json" <<'PY'
import sys, json
p = sys.argv[1]; m = json.load(open(p)); m["signature"] = "00" * 32; json.dump(m, open(p, "w"))
PY
if CALVIN_AGENT_STATE_DIR="$tmp/state_sig3" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env" bash "$SCRIPT"; then
  echo "FAIL sig-bad: should abort"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-bad: agent swapped"; exit 1; }
echo "PASS sig-bad-signature"

# --- missing signature while key set -> abort (downgrade defense) ---
mkdir -p "$tmp/state_sig4"
build_sig_manifest   # NOT signed
if CALVIN_AGENT_STATE_DIR="$tmp/state_sig4" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env" bash "$SCRIPT"; then
  echo "FAIL sig-missing: should abort"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-missing: agent swapped"; exit 1; }
echo "PASS sig-missing-is-downgrade-defense"

# --- unknown sig_alg while key set -> abort ---
mkdir -p "$tmp/state_sig5"
build_sig_manifest; sign_manifest "$tmp/srv/manifest.json"
sed -i 's/hmac-sha256/hmac-sha512/' "$tmp/srv/manifest.json"
if CALVIN_AGENT_STATE_DIR="$tmp/state_sig5" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env" bash "$SCRIPT"; then
  echo "FAIL sig-alg: should abort"; exit 1; fi
grep -q 'OLD' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-alg: agent swapped"; exit 1; }
echo "PASS sig-unknown-alg"

# --- no key configured -> signature ignored, update proceeds (backward compatible) ---
mkdir -p "$tmp/state_sig6"
build_sig_manifest   # unsigned; no signing env file provided
CALVIN_AGENT_STATE_DIR="$tmp/state_sig6" CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/nonexistent.env" \
  bash "$SCRIPT" || { echo "FAIL sig-nokey: exited non-zero"; exit 1; }
grep -q 'sys.exit(0)' "$tmp/local/calvin_display_agent.py" || { echo "FAIL sig-nokey: agent not swapped"; exit 1; }
echo "PASS sig-no-key-backward-compatible"
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: existing blocks PASS, then FAIL at `sig-tampered-manifest` (the updater has no signature verification yet, so it installs despite the bad signature).

- [ ] **Step 3: Source the signing file + add the verify helper**

In `deploy/kiosk-agent/update-kiosk.sh`, after the main env-file source line
(`[ -f "$ENV_FILE" ] && . "$ENV_FILE"`), add:

```bash
SIGNING_ENV_FILE="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
# shellcheck disable=SC1090
[ -f "$SIGNING_ENV_FILE" ] && . "$SIGNING_ENV_FILE"
```

Immediately after the `log()` definition (and **before** the `--self-check` block, so it is
defined for both callers), add:

```bash
# Verify the manifest HMAC signature when a signing key is configured (calvin-5vw).
# $1 = manifest JSON. Prints a failure reason to stdout and returns non-zero on failure.
# No key configured -> returns 0 (LAN-trust, unchanged behavior).
verify_manifest_sig() {
  [ -n "${CALVIN_KIOSK_SIGNING_KEY:-}" ] || return 0
  printf '%s' "$1" | CALVIN_KIOSK_SIGNING_KEY="$CALVIN_KIOSK_SIGNING_KEY" "$PYTHON" - <<'PY'
import sys, json, hmac, hashlib, os
key_hex = os.environ.get("CALVIN_KIOSK_SIGNING_KEY", "")
def fail(msg):
    sys.stdout.write(msg)
    sys.exit(1)
try:
    m = json.load(sys.stdin)
except Exception:
    fail("signature: manifest unparseable")
sig = m.pop("signature", None)
alg = m.pop("sig_alg", None)
if sig is None or alg is None:
    fail("signature required but missing")
if alg != "hmac-sha256":
    fail("unsupported manifest sig_alg")
try:
    key = bytes.fromhex(key_hex)
except ValueError:
    fail("signing key malformed")
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
tag = hmac.new(key, canon, hashlib.sha256).hexdigest()
if not hmac.compare_digest(tag, str(sig)):
    fail("signature invalid")
PY
}
```

- [ ] **Step 4: Enforce in `--self-check` and the main update path**

In the `--self-check` block, after the existing structural check and before `log "self-check: ok"; exit 0`, add:

```bash
  if ! verify_manifest_sig "$_m" >/dev/null; then
    log "self-check: manifest signature verification failed"; exit 1; fi
```

In the main flow, immediately after the manifest fetch block
(`manifest="$("$CURL" ... )" || { write_state error fetch ...; exit 1; }`) and **before**
`version=...`, add:

```bash
_sig_reason="$(verify_manifest_sig "$manifest")" || {
  write_state error verify "manifest ${_sig_reason:-signature verification failed}"
  log "manifest ${_sig_reason:-signature verification failed}"; exit 1; }
```

- [ ] **Step 5: Run to verify they pass**

Run: `bash scripts/tests/test_update_kiosk.sh`
Expected: all pre-existing blocks PASS, plus `PASS sig-valid`, `PASS sig-tampered-manifest`, `PASS sig-bad-signature`, `PASS sig-missing-is-downgrade-defense`, `PASS sig-unknown-alg`, `PASS sig-no-key-backward-compatible`.

- [ ] **Step 6: Commit**

```bash
git add deploy/kiosk-agent/update-kiosk.sh scripts/tests/test_update_kiosk.sh
git commit -m "feat(kiosk-updater): verify manifest HMAC signature, fail closed (calvin-5vw)"
```

---

### Task 3: Setup — write the signing file; bootstrap verifies before running the updater

**Files:**
- Modify: `scripts/setup-common.sh` (add `install_signing_key`; `bootstrap_kiosk` verifies)
- Modify: `scripts/setup-kiosk.sh` (`--signing-key` arg; write signing file before bootstrap)
- Test: `scripts/tests/test_setup_kiosk_bundle.sh`

**Interfaces:**
- Consumes: the signed manifest (Task 1); `--bootstrap` updater (existing).
- Produces:
  - `install_signing_key <hex>` — writes `CALVIN_KIOSK_SIGNING_KEY=<hex>` to
    `${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}` at mode `0600`; no-op on empty key.
  - `bootstrap_kiosk <backend_url>` — now reads the key from the signing file and, when present,
    verifies the manifest signature **before** trusting the updater sha and running it (aborts via
    `error_exit` on a bad/missing signature). Signature unchanged (still one positional arg), so
    existing callers/tests are unaffected.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/test_setup_kiosk_bundle.sh` (before it ends). Reuse the file's existing
`$tmp`, mock `curl` (PATH-based), and `MARKER` conventions:

```bash
# ===== manifest signature verification in bootstrap (calvin-5vw) =====
SIG_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
export CALVIN_KIOSK_SIGNING_ENV_FILE="$tmp/signing.env"

# install_signing_key writes a 0600 file with the key
install_signing_key "$SIG_KEY"
grep -q "CALVIN_KIOSK_SIGNING_KEY=$SIG_KEY" "$tmp/signing.env" || { echo "FAIL: signing key not written"; exit 1; }
[ "$(stat -c '%a' "$tmp/signing.env")" = "600" ] || { echo "FAIL: signing file not 0600"; exit 1; }
echo "PASS install-signing-key-0600"

# Build a SIGNED manifest (update-kiosk.sh entry) served by the mock curl.
cat > "$tmp/updater.sh" <<'UEOF'
#!/usr/bin/env bash
[ "${1:-}" = "--bootstrap" ] && { echo "BOOTSTRAPPED $CALVIN_BACKEND_URL" > "$MARKER"; exit 0; }
exit 1
UEOF
UPD_SHA="$(sha256sum "$tmp/updater.sh" | cut -d' ' -f1)"
cat > "$tmp/manifest-unsigned.json" <<EOF
{"version":"setupsig00000000","min_python":"3.9","files":[
 {"name":"update-kiosk.sh","sha256":"${UPD_SHA}","mode":"0755","target_path":"/usr/local/bin/update-kiosk.sh","restart_unit":"","enable":false}]}
EOF
sign_manifest_file() {  # $1 in -> $2 out, signed with SIG_KEY
  CALVIN_KIOSK_SIGNING_KEY="$SIG_KEY" python3 - "$1" "$2" <<'PY'
import sys, json, hmac, hashlib, os
m = json.load(open(sys.argv[1]))
key = bytes.fromhex(os.environ["CALVIN_KIOSK_SIGNING_KEY"])
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
m["signature"] = hmac.new(key, canon, hashlib.sha256).hexdigest(); m["sig_alg"] = "hmac-sha256"
json.dump(m, open(sys.argv[2], "w"))
PY
}
sign_manifest_file "$tmp/manifest-unsigned.json" "$tmp/manifest-signed.json"

# Mock curl serving the SIGNED manifest + the updater bytes verbatim.
cat > "$tmp/bin/curl" <<CEOF
#!/usr/bin/env bash
outfile=""; url=""
args=("\$@"); i=0
while [ \$i -lt \${#args[@]} ]; do
  case "\${args[\$i]}" in
    -o) i=\$((i+1)); outfile="\${args[\$i]}";;
    http*) url="\${args[\$i]}";;
  esac; i=\$((i+1))
done
case "\$url" in
  */agent/manifest) [ -n "\$outfile" ] && cat "\${MOCK_SIGNED}" > "\$outfile" || cat "\${MOCK_SIGNED}";;
  */agent/files/update-kiosk.sh) [ -n "\$outfile" ] && cat "$tmp/updater.sh" > "\$outfile" || cat "$tmp/updater.sh";;
  *) exit 22;;
esac
CEOF
chmod +x "$tmp/bin/curl"

# --- valid signature -> bootstrap verifies + runs updater ---
rm -f "$MARKER"
export MOCK_SIGNED="$tmp/manifest-signed.json"
bootstrap_kiosk "http://server.local:8000"
grep -q 'BOOTSTRAPPED' "$MARKER" || { echo "FAIL: valid-signature bootstrap did not run updater"; exit 1; }
echo "PASS bootstrap-valid-signature-runs"

# --- tampered signed manifest -> abort, updater never runs ---
rm -f "$MARKER"
cp "$tmp/manifest-signed.json" "$tmp/manifest-bad.json"
sed -i 's/setupsig00000000/TAMPERED00000000/' "$tmp/manifest-bad.json"
if ( export MOCK_SIGNED="$tmp/manifest-bad.json"
     . "$here/../setup-common.sh"
     bootstrap_kiosk "http://server.local:8000" ) 2>/dev/null; then
  echo "FAIL: bootstrap should reject a bad manifest signature"; exit 1; fi
[ ! -f "$MARKER" ] || { echo "FAIL: updater ran despite bad signature"; exit 1; }
echo "PASS bootstrap-bad-signature-aborts"
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh`
Expected: existing blocks PASS, then FAIL at `install-signing-key-0600` (`install_signing_key: command not found`).

- [ ] **Step 3: Add `install_signing_key` and signature verification to `bootstrap_kiosk`**

In `scripts/setup-common.sh`, add near `bootstrap_kiosk`:

```bash
# Write the kiosk manifest signing key to a root-only 0600 file (calvin-5vw). No-op if empty.
install_signing_key() {
    local key="$1"
    local file="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
    [ -n "$key" ] || return 0
    install -m 0600 /dev/null "$file"
    printf 'CALVIN_KIOSK_SIGNING_KEY=%s\n' "$key" > "$file"
}
```

Modify `bootstrap_kiosk` to read the key from the signing file and verify the manifest before
trusting the updater sha. Replace the function body's start (through the `manifest=...` fetch)
with:

```bash
bootstrap_kiosk() {
    local backend_url="${1%/}"
    local sig_file="${CALVIN_KIOSK_SIGNING_ENV_FILE:-/etc/default/calvin-kiosk-signing}"
    local key="" manifest sha tmp got
    [ -f "$sig_file" ] && key="$(grep '^CALVIN_KIOSK_SIGNING_KEY=' "$sig_file" | cut -d= -f2- || true)"
    manifest="$(curl -fsSL "${backend_url}/api/kiosks/agent/manifest")" \
        || error_exit "Failed to fetch kiosk bundle manifest from ${backend_url}" 1
    if [ -n "$key" ]; then
        # Pass the manifest via env var, NOT a pipe: a heredoc (`<<'PY'`) claims python's
        # stdin, so a `printf ... | python - <<'PY'` pipe is silently discarded.
        MANIFEST_JSON="$manifest" CALVIN_KIOSK_SIGNING_KEY="$key" python3 - <<'PY' \
            || error_exit "kiosk manifest signature verification failed" 1
import json, hmac, hashlib, os
m = json.loads(os.environ["MANIFEST_JSON"])
key = os.environ["CALVIN_KIOSK_SIGNING_KEY"]
sig = m.pop("signature", None)
alg = m.pop("sig_alg", None)
if sig is None or alg is None or alg != "hmac-sha256":
    raise SystemExit(1)
canon = json.dumps(m, sort_keys=True, separators=(",", ":")).encode()
raise SystemExit(0 if hmac.compare_digest(
    hmac.new(bytes.fromhex(key), canon, hashlib.sha256).hexdigest(), str(sig)) else 1)
PY
    fi
```

Keep the rest of the function (extract `sha`, fetch the updater, checksum-verify, run
`--bootstrap`) exactly as it is today. The `--bootstrap` run already sources the signing file
itself, so no key needs to be passed through.

- [ ] **Step 4: Wire `--signing-key` into `setup-kiosk.sh`**

In `scripts/setup-kiosk.sh`:

Add a `SIGNING_KEY=""` global next to `BACKEND_URL=""`. In `parse_args`, add cases (before the `*)` catch-all):

```bash
            --signing-key) SIGNING_KEY="${2:-}"; shift 2 ;;
            --signing-key=*) SIGNING_KEY="${1#*=}"; shift ;;
```

In `main()`, immediately **before** the `bootstrap_kiosk "${BACKEND_URL}"` call, add:

```bash
    install_signing_key "${SIGNING_KEY}"
```

(`install_signing_key` no-ops when `--signing-key` was not supplied and leaves any existing
signing file in place. `bootstrap_kiosk` then reads whatever key is present.)

- [ ] **Step 5: Run to verify they pass**

Run: `bash scripts/tests/test_setup_kiosk_bundle.sh`
Expected: all blocks PASS, including `PASS install-signing-key-0600`, `PASS bootstrap-valid-signature-runs`, `PASS bootstrap-bad-signature-aborts`.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-common.sh scripts/setup-kiosk.sh scripts/tests/test_setup_kiosk_bundle.sh
git commit -m "feat(setup): write 0600 signing key; bootstrap verifies manifest signature (calvin-5vw)"
```

---

### Task 4: Bake — `--signing-key` bakes the signing file at first boot

**Files:**
- Modify: `scripts/bake-kiosk-firstrun.sh`
- Test: `scripts/tests/test_bake_kiosk_firstrun_emit.sh`

**Interfaces:**
- Produces: `bake-kiosk-firstrun.sh --signing-key <hex>` (and `--signing-key-file <path>`) →
  the generated first-boot script emits `SIGNING_KEY=<hex>` and, when non-empty, writes
  `/etc/default/calvin-kiosk-signing` (mode `0600`) with `CALVIN_KIOSK_SIGNING_KEY=<hex>`.

- [ ] **Step 1: Write the failing test**

The existing test sources the script with `--source-only`, then for each case calls
`parse_args ...` followed by `out="$(emit_firstrun)"` and greps `$out`. Follow that exact pattern.
Insert this block **immediately before** the file's final `echo "PASS"` line:

```bash
# --- signing key is baked and written to a 0600 file at first boot (calvin-5vw) ---
SIG_KEY_HEX="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
parse_args --backend-url http://h:8000 --boot-dir /tmp --signing-key "$SIG_KEY_HEX"
out3="$(emit_firstrun)"
echo "$out3" | grep -qF "SIGNING_KEY=$SIG_KEY_HEX" || { echo "FAIL: signing key not baked (emit_var)"; exit 1; }
echo "$out3" | grep -q "calvin-kiosk-signing" || { echo "FAIL: firstrun does not write the signing file"; exit 1; }
echo "$out3" | grep -q "chmod 600" || { echo "FAIL: signing file not chmod 600"; exit 1; }
# And with no signing key, printf '%q' of empty string bakes SIGNING_KEY=''
parse_args --backend-url http://h:8000 --boot-dir /tmp
echo "$(emit_firstrun)" | grep -qF "SIGNING_KEY=''" || { echo "FAIL: empty signing key not baked"; exit 1; }
```

(The existing block ends with a bare `echo "PASS"`; leaving that as the file's final line means a
clean run still prints `PASS` after these assertions.)

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_emit.sh`
Expected: FAIL at `bake-signing-key` — `--signing-key` is an unknown argument / not baked.

- [ ] **Step 3: Parse the flags and set `SIGNING_KEY`**

In `scripts/bake-kiosk-firstrun.sh`, add `SIGNING_KEY=""` to both the top-level defaults
(near `BACKEND_URL=""; ...`) and the `parse_args` reset line. In `parse_args`, add cases (before the `*)` catch-all):

```bash
            --signing-key) SIGNING_KEY="${2:-}"; shift 2 ;;
            --signing-key=*) SIGNING_KEY="${1#*=}"; shift ;;
            --signing-key-file) SIGNING_KEY="$(cat "${2:-}")"; shift 2 ;;
            --signing-key-file=*) SIGNING_KEY="$(cat "${1#*=}")"; shift ;;
```

- [ ] **Step 4: Emit the value and write the signing file at first boot**

In `emit_firstrun`, add to the `emit_var` block (next to `emit_var BACKEND_URL ...`):

```bash
    emit_var SIGNING_KEY     "${SIGNING_KEY}"
```

In the generated first-boot body (the `<<'FIRSTRUN_EOF'` section), immediately **after** the
`# 4. Seed /etc/default/calvin-kiosk ...` block that writes `${ENV_FILE}`, add:

```bash

# 4b. Seed the root-only manifest signing key (calvin-5vw), if one was baked.
if [ -n "${SIGNING_KEY}" ]; then
    SIGNING_ENV_FILE=/etc/default/calvin-kiosk-signing
    touch "${SIGNING_ENV_FILE}"; chmod 600 "${SIGNING_ENV_FILE}"
    echo "CALVIN_KIOSK_SIGNING_KEY=${SIGNING_KEY}" > "${SIGNING_ENV_FILE}"
fi
```

(`${SIGNING_KEY}` here resolves to the `emit_var`-emitted assignment, exactly like `${BACKEND_URL}`
and `${SSH_PUBKEY}` in the surrounding lines.)

- [ ] **Step 5: Run to verify it passes**

Run: `bash scripts/tests/test_bake_kiosk_firstrun_emit.sh`
Expected: all blocks PASS, including `PASS bake-signing-key`.

Also run the other bake tests to confirm no regression:
Run: `for t in scripts/tests/test_bake_kiosk_firstrun_*.sh; do bash "$t" || exit 1; done`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/bake-kiosk-firstrun.sh scripts/tests/test_bake_kiosk_firstrun_emit.sh
git commit -m "feat(bake): --signing-key bakes the 0600 manifest signing file (calvin-5vw)"
```

---

### Task 5: Docs — manifest signing section

**Files:**
- Modify: `docs/setup/KIOSK_PROVISIONING.md`

- [ ] **Step 1: Add a "Manifest signing" section**

In `docs/setup/KIOSK_PROVISIONING.md`, under the "Kiosk agent self-update" area (after the
"Trust model (accepted risk)" subsection added by the previous feature), add:

```markdown
### Manifest signing (closing the LAN-MITM)

The backend signs the bundle manifest with HMAC-SHA256 using a shared secret generated on first
run at `./data/kiosk-signing.key` (mode `0600`; the path is logged the first time it is created).
When a kiosk has that secret baked, it verifies the manifest signature before trusting the
manifest, the file hashes, or any downloaded file — closing the LAN man-in-the-middle gap that
plain sha256 integrity leaves open.

**Enable it on a kiosk (out-of-band — never over the LAN):**

1. On the server, read the secret over your existing trusted access:
   ```bash
   cat ./data/kiosk-signing.key
   ```
2. Pass it to provisioning:
   - Zero-touch: `bake-kiosk-firstrun.sh ... --signing-key <hex>` (or `--signing-key-file <path>`).
   - Manual: `setup-kiosk.sh --backend-url <url> --signing-key <hex>`.

   The key is written to a dedicated root-only file `/etc/default/calvin-kiosk-signing` (mode
   `0600`) — never the world-readable `/etc/default/calvin-kiosk`.

**Behavior once a key is baked (fail-closed):** the updater aborts and installs nothing if the
signature is invalid, **missing** (an attacker must not be able to strip it to fall back to
LAN-trust), or uses an unknown algorithm. A kiosk with **no** key baked keeps the previous
LAN-trust behavior, so signing is opt-in per kiosk — but note the backend always signs, so a
keyed kiosk requires a backend running this version or newer.

**Key rotation:** delete `./data/kiosk-signing.key` on the server (a new one is generated on the
next manifest request) and re-bake / re-run `--signing-key` on each kiosk. There is no automatic
rotation.

**Stronger isolation (future):** the shared key means a kiosk that is already root-compromised
holds a secret usable to forge to another kiosk the attacker can also MITM. Per-kiosk keys
derived from a backend master (`Ki = HMAC(master, kiosk_id)`) remove that residual and are
tracked as a follow-up; the kiosk-side verification here is unchanged by that upgrade.
```

- [ ] **Step 2: Verify the additions landed**

Run: `grep -n "Manifest signing\|kiosk-signing.key\|calvin-kiosk-signing\|--signing-key" docs/setup/KIOSK_PROVISIONING.md`
Expected: matches present.

- [ ] **Step 3: Commit**

```bash
git add docs/setup/KIOSK_PROVISIONING.md
git commit -m "docs(kiosk): document HMAC manifest signing + out-of-band key baking (calvin-5vw)"
```

---

## Final verification (after all tasks)

```bash
cd backend && uv run pytest tests/unit/test_kiosk_signing.py tests/unit/test_kiosk_bundle.py -v
cd .. && bash scripts/tests/test_update_kiosk.sh
bash scripts/tests/test_setup_kiosk_bundle.sh
for t in scripts/tests/test_bake_kiosk_firstrun_*.sh; do bash "$t"; done
uvx ruff@0.14.11 check backend/ && uvx ruff@0.14.11 format --check backend/
```
