"""The in-memory kiosk pairing store (calvin-0xns)."""

import re
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services import kiosk_pairing
from app.services.kiosk_pairing import (
    CODE_ALPHABET,
    CODE_TTL_S,
    INSTALL_TTL_S,
    PairingStore,
    RateLimited,
    format_code,
    hash_secret,
    is_secret,
    new_secret,
    normalize_code,
)

SECRET_RE = re.compile(r"^clv_kiosk_[A-Za-z0-9_-]{43}$")


@pytest.fixture
def store() -> PairingStore:
    return PairingStore()


def test_new_secret_matches_the_global_constraint():
    first, second = new_secret(), new_secret()
    assert SECRET_RE.fullmatch(first)
    assert first != second
    assert is_secret(first)
    assert not is_secret("clv_kiosk_short")
    assert not is_secret("clv_" + "a" * 50)
    assert not is_secret(None)


def test_hash_secret_is_stable_and_sha256_hex():
    secret = new_secret()
    assert hash_secret(secret) == hash_secret(secret)
    assert len(hash_secret(secret)) == 64
    assert hash_secret(secret) != hash_secret(new_secret())


def test_code_alphabet_is_pinned():
    assert len(CODE_ALPHABET) == 30
    assert set(CODE_ALPHABET) & set("0O1ILU") == set()
    assert len(set(CODE_ALPHABET)) == 30


def test_codes_use_only_the_alphabet(store):
    pending = store.start("kitchen", hash_secret(new_secret()), "10.0.0.2")
    assert len(pending.code) == 6
    assert set(pending.code) <= set(CODE_ALPHABET)
    assert format_code(pending.code) == f"{pending.code[:3]}-{pending.code[3:]}"


def test_codes_are_unique_when_the_generator_collides(store, monkeypatch):
    """A forced collision is re-rolled; no two live entries share a code."""
    real_choice = secrets.choice
    monkeypatch.setattr(secrets, "choice", lambda alphabet: "A")
    first = store.start("kitchen", hash_secret(new_secret()), "10.0.0.2")
    assert first.code == "AAAAAA"

    calls = {"n": 0}

    def colliding_choice(alphabet):
        calls["n"] += 1
        return "A" if calls["n"] <= 6 else real_choice(alphabet)

    monkeypatch.setattr(secrets, "choice", colliding_choice)
    second = store.start("hall", hash_secret(new_secret()), "10.0.0.3")
    assert second.code != first.code


def test_normalize_code_ignores_case_and_dash():
    assert normalize_code("k7q-4md") == normalize_code("K7Q4MD") == "K7Q4MD"
    assert normalize_code(" k7q4md ") == "K7Q4MD"
    assert normalize_code("K7Q-4M") is None  # five characters
    assert normalize_code("K7Q-4MU") is None  # U is outside the alphabet
    assert normalize_code("K7Q-4M0") is None  # 0 is outside the alphabet
    assert normalize_code("") is None


def test_same_hash_twice_returns_the_same_code(store):
    kiosk_hash = hash_secret(new_secret())
    first = store.start("kitchen", kiosk_hash, "10.0.0.2")
    again = store.start("kitchen", kiosk_hash, "10.0.0.9")
    assert again.code == first.code
    assert len(store.live()) == 1


def test_a_fourth_pending_drops_the_oldest_not_asked_lately(store):
    hashes = [hash_secret(new_secret()) for _ in range(4)]
    oldest = store.start("kitchen", hashes[0], "10.0.0.2", now=1000)
    store.start("kitchen", hashes[1], "10.0.0.2", now=1000)
    store.start("kitchen", hashes[2], "10.0.0.2", now=1000)

    newest = store.start("kitchen", hashes[3], "10.0.0.2", now=1000 + 121)
    codes = {pending.code for pending in store.live(now=1000 + 121)}
    assert newest.code in codes
    assert oldest.code not in codes  # the entry nobody asked about is the one dropped
    assert len(codes) == 3


def test_live_code_is_never_evicted(store):
    """Three entries asked about in the last 2 minutes cannot be pushed out by a LAN caller."""
    hashes = [hash_secret(new_secret()) for _ in range(3)]
    for offset, kiosk_hash in enumerate(hashes):
        store.start("kitchen", kiosk_hash, "10.0.0.2", now=1000 + offset)
    for kiosk_hash in hashes:
        assert store.pending_for("kitchen", kiosk_hash, now=1001) is not None

    with pytest.raises(RateLimited) as excinfo:
        store.start("kitchen", hash_secret(new_secret()), "10.0.0.2", now=1002)
    assert excinfo.value.wait >= 1
    assert len(store.live(now=1002)) == 3


def test_the_201st_live_entry_is_rate_limited(store):
    for index in range(200):
        store.start(f"kiosk-{index}", hash_secret(new_secret()), f"10.0.1.{index % 250}")
    assert len(store.live()) == 200
    with pytest.raises(RateLimited):
        store.start("one-too-many", hash_secret(new_secret()), "10.0.2.1")


def test_per_address_limit_counts_new_entries_only(store):
    kiosk_hash = hash_secret(new_secret())
    for _ in range(5):
        store.start("kitchen", kiosk_hash, "10.0.0.2")  # repeats never count
    for index in range(19):
        store.start(f"kiosk-{index}", hash_secret(new_secret()), "10.0.0.2")
    with pytest.raises(RateLimited):
        store.start("the-21st", hash_secret(new_secret()), "10.0.0.2")

    # Another address is unaffected.
    store.start("elsewhere", hash_secret(new_secret()), "10.0.0.3")


def test_an_entry_expires_after_ten_minutes(store):
    kiosk_hash = hash_secret(new_secret())
    pending = store.start("kitchen", kiosk_hash, "10.0.0.2", now=1000)
    assert store.live(now=1000 + CODE_TTL_S - 1) == [pending]
    assert store.live(now=1000 + CODE_TTL_S) == []
    assert store.pending_for("kitchen", kiosk_hash, now=1000 + CODE_TTL_S) is None


def test_take_by_code_drops_the_other_entries_for_that_kiosk(store):
    hashes = [hash_secret(new_secret()) for _ in range(3)]
    first = store.start("kitchen", hashes[0], "10.0.0.2", now=1000)
    store.start("kitchen", hashes[1], "10.0.0.2", now=1000)
    store.start("kitchen", hashes[2], "10.0.0.2", now=1000)

    taken = store.take_by_code(format_code(first.code).lower(), now=1001)
    assert taken is not None and taken.code == first.code
    assert store.live(now=1001) == []
    assert store.take_by_code(first.code, now=1001) is None  # works once


def test_concurrent_approval_single_winner(store):
    pending = store.start("kitchen", hash_secret(new_secret()), "10.0.0.2")
    barrier = threading.Barrier(2)

    def approve():
        barrier.wait()
        return store.take_by_code(pending.code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [future.result() for future in [pool.submit(approve), pool.submit(approve)]]
    assert sum(1 for result in results if result is not None) == 1


def test_drop_kiosk_drops_every_pending_entry(store):
    store.start("kitchen", hash_secret(new_secret()), "10.0.0.2", by_agent=True)
    store.start("kitchen", hash_secret(new_secret()), "10.0.0.2", by_agent=False)
    store.start("hall", hash_secret(new_secret()), "10.0.0.2")
    store.drop_kiosk("kitchen")
    assert [pending.kiosk_id for pending in store.live()] == ["hall"]


def test_has_agent_pending(store):
    store.start("hall", hash_secret(new_secret()), "10.0.0.2", by_agent=False)
    assert store.has_agent_pending("hall") is False
    store.start("kitchen", hash_secret(new_secret()), "10.0.0.2", by_agent=True)
    assert store.has_agent_pending("kitchen") is True
    assert store.has_agent_pending("nowhere") is False


def test_install_code_works_once_and_expires(store):
    code, expires = store.mint_install_code(now=1000)
    assert code.startswith("clv_pair_")
    assert expires == 1000 + INSTALL_TTL_S
    assert store.use_install_code(code, now=1001) is True
    assert store.use_install_code(code, now=1002) is False

    other, _ = store.mint_install_code(now=2000)
    assert store.use_install_code(other, now=2000 + INSTALL_TTL_S) is False


def test_at_most_five_install_codes_are_live(store):
    codes = [store.mint_install_code(now=1000 + index)[0] for index in range(6)]
    assert store.use_install_code(codes[0], now=1006) is False  # the sixth dropped the oldest
    assert store.use_install_code(codes[-1], now=1006) is True


def test_install_codes_never_store_the_plaintext(store):
    code, _ = store.mint_install_code(now=1000)
    assert any("install" in key for key in vars(store))
    assert code not in repr(store.__dict__)


def test_module_singletons():
    assert isinstance(kiosk_pairing.pairing_store, PairingStore)
    assert kiosk_pairing.approve_limiter is not None
