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
