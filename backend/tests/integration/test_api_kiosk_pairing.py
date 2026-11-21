"""Pairing routes: start, show the code, approve, unpair, install codes (calvin-0xns)."""

import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from loguru import logger

from app.security.admin_auth import COOKIE_NAME, get_admin_store
from app.services.kiosk_pairing import CODE_ALPHABET, approve_limiter, pairing_store

_REPO_ROOT = Path(__file__).parent.parent.parent.parent

CODE_RE = re.compile(f"^[{CODE_ALPHABET}]{{3}}-[{CODE_ALPHABET}]{{3}}$")


@pytest.fixture(autouse=True)
def _clean_pairing_store():
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    approve_limiter._failures.clear()
    approve_limiter._lockouts.clear()
    yield
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    approve_limiter._failures.clear()
    approve_limiter._lockouts.clear()


@pytest.fixture(autouse=True)
def _bundle_from_repo_dir(monkeypatch):
    from app.services import kiosk_bundle

    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_bundle_dir", None)
    monkeypatch.setattr(kiosk_bundle.settings, "repo_dir", _REPO_ROOT)


def _auth(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


def _ids(client: TestClient) -> list[str]:
    return [kiosk["id"] for kiosk in client.get("/api/kiosks").json()["kiosks"]]


def _new_secret() -> str:
    from app.services.kiosk_pairing import new_secret

    return new_secret()


def _start(client: TestClient, kiosk_id: str = "kitchen", **body) -> tuple[str, dict]:
    secret = _new_secret()
    pending = client.post(f"/api/kiosks/{kiosk_id}/pair", json=body, headers=_auth(secret))
    return secret, pending


def _approve(client: TestClient, code: str):
    return client.post("/api/kiosks/pairings", json={"code": code})


def _register(client: TestClient, kiosk_id: str, query: str = "khost=pi") -> None:
    assert client.get(f"/api/kiosks/{kiosk_id}/config?{query}").status_code == 200


def _code_of(body: dict) -> str:
    assert body["state"] == "pending"
    assert CODE_RE.fullmatch(body["code"]), body
    assert body["expiresAt"].endswith("Z")
    return body["code"]


def _set_cookie_value(response, name: str = "calvin_kiosk") -> str:
    first = response.headers["set-cookie"].split(";", 1)[0]
    cookie_name, _, value = first.partition("=")
    assert cookie_name == name
    return value


@pytest.mark.integration
def test_agent_start_creates_a_pending_code_without_a_row(test_client: TestClient):
    secret, response = _start(test_client)
    assert response.status_code == 200, response.text
    body = response.json()
    code = _code_of(body)
    assert "kitchen" not in _ids(test_client)  # starting a pairing never creates a row

    again = test_client.post("/api/kiosks/kitchen/pair", json={}, headers=_auth(secret))
    assert again.json()["code"] == code  # the same secret gets the same code


@pytest.mark.integration
def test_get_pair_gives_the_code_only_to_its_holder(test_client: TestClient):
    secret_a, body_a = _start(test_client)
    code_a = _code_of(body_a.json())
    secret_b, body_b = _start(test_client)
    code_b = _code_of(body_b.json())
    assert code_a != code_b

    mine = test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret_a))
    assert mine.json() == {
        "state": "pending",
        "code": code_a,
        "expiresAt": body_a.json()["expiresAt"],
    }
    theirs = test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret_b))
    assert theirs.json()["code"] == code_b

    test_client.cookies.clear()
    anonymous = test_client.get("/api/kiosks/kitchen/pair")
    assert anonymous.status_code == 200
    assert anonymous.json() == {"state": "none", "code": None, "expiresAt": None}


@pytest.mark.integration
def test_admin_approval_stores_the_hash_and_creates_the_row(test_client: TestClient, monkeypatch):
    from app.services import kiosk_registry

    adopted: list[bool] = []
    original = kiosk_registry._adopt_global_settings

    async def spy():
        adopted.append(True)
        await original()

    monkeypatch.setattr(kiosk_registry, "_adopt_global_settings", spy)
    test_client.post("/api/config", json={"displayName": "The Kitchen"})

    secret, started = _start(test_client, hostname="pi-kitchen")
    code = _code_of(started.json())
    approved = _approve(test_client, code)
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["id"] == "kitchen"
    assert body["displayName"] == "The Kitchen"
    assert body["pairedAt"].endswith("Z")
    assert body["replaced"] is False
    assert adopted == [True]

    row = next(k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "kitchen")
    assert row["hostname"] == "pi-kitchen"
    assert row["paired"] is True
    assert row["pairedAt"] == body["pairedAt"]

    assert test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret)).json() == {
        "state": "paired",
        "code": None,
        "expiresAt": None,
    }


@pytest.mark.integration
def test_approving_again_replaces_the_old_secret(test_client: TestClient):
    old_secret, started = _start(test_client)
    _approve(test_client, _code_of(started.json()))

    new_secret, again = _start(test_client)
    approved = _approve(test_client, _code_of(again.json()))
    assert approved.status_code == 200
    assert approved.json()["replaced"] is True

    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(old_secret)).json()["state"]
        == "none"
    )
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(new_secret)).json()["state"]
        == "paired"
    )


@pytest.mark.integration
def test_approval_code_works_once(test_client: TestClient):
    _, started = _start(test_client)
    code = _code_of(started.json())
    assert _approve(test_client, code).status_code == 200
    second = _approve(test_client, code)
    assert second.status_code == 404
    assert second.json()["detail"]["code"] == "pairing_code_invalid"


@pytest.mark.integration
def test_approval_needs_an_admin_session(test_client: TestClient):
    _, started = _start(test_client)
    code = _code_of(started.json())

    test_client.cookies.clear()
    anonymous = _approve(test_client, code)
    assert anonymous.status_code == 401
    assert anonymous.json()["detail"]["code"] == "admin_required"

    login = test_client.post("/api/auth/login", json={"password": "test-admin-password"})
    assert login.status_code == 200
    created = test_client.post("/api/auth/keys", json={"name": "Script", "scope": "admin"})
    assert created.status_code == 201, created.text
    test_client.cookies.clear()
    with_key = test_client.post(
        "/api/kiosks/pairings",
        json={"code": code},
        headers=_auth(created.json()["secret"]),
    )
    assert with_key.status_code == 403
    assert with_key.json()["detail"]["code"] == "session_required"


@pytest.mark.integration
def test_pairing_answers_setup_required_without_a_password(test_client: TestClient):
    secret = _new_secret()
    get_admin_store().reset()
    paired = test_client.post("/api/kiosks/kitchen/pair", json={}, headers=_auth(secret))
    assert paired.status_code == 409
    assert paired.json()["detail"]["code"] == "setup_required"

    session = test_client.post("/api/kiosks/kitchen/browser-session", headers=_auth(secret))
    assert session.status_code == 409
    assert session.json()["detail"]["code"] == "setup_required"


@pytest.mark.integration
def test_browser_only_is_refused_when_an_agent_is_present(test_client: TestClient):
    _register(test_client, "kitchen", "kagent=1.0.0")
    test_client.cookies.clear()
    response = test_client.post("/api/kiosks/kitchen/pair", json={"browser": True})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "screen_has_agent"


@pytest.mark.integration
def test_pairings_list_has_no_code_or_hash(test_client: TestClient):
    _, started = _start(test_client, hostname="pi-kitchen")
    _code_of(started.json())

    listed = test_client.get("/api/kiosks/pairings")
    assert listed.status_code == 200
    pending = listed.json()["pending"]
    assert len(pending) == 1
    assert set(pending[0]) == {"kioskId", "hostname", "createdAt", "byAgent"}
    assert pending[0]["kioskId"] == "kitchen"
    assert pending[0]["hostname"] == "pi-kitchen"
    assert pending[0]["byAgent"] is True
    assert pending[0]["createdAt"].endswith("Z")
    text = listed.text
    assert "clv_" not in text

    test_client.cookies.clear()
    assert test_client.get("/api/kiosks/pairings").status_code == 401


@pytest.mark.integration
def test_removing_a_screen_drops_its_pending_entries(test_client: TestClient):
    _register(test_client, "kitchen")
    secret, started = _start(test_client)
    _code_of(started.json())

    assert test_client.delete("/api/kiosks/kitchen").status_code == 200
    assert test_client.get("/api/kiosks/pairings").json()["pending"] == []
    assert test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret)).json()["state"] == (
        "none"
    )


@pytest.mark.integration
def test_pairing_routes_answer_no_store(test_client: TestClient):
    secret, started = _start(test_client)
    code = _code_of(started.json())
    assert started.headers["cache-control"] == "no-store"
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret)).headers["cache-control"]
        == "no-store"
    )
    assert _approve(test_client, code).headers["cache-control"] == "no-store"
    assert test_client.get("/api/kiosks/pairings").headers["cache-control"] == "no-store"
    minted = test_client.post("/api/kiosks/install-codes")
    assert minted.headers["cache-control"] == "no-store"
    assert test_client.delete("/api/kiosks/kitchen/pairing").headers["cache-control"] == (
        "no-store"
    )


@pytest.mark.integration
def test_six_wrong_codes_are_rate_limited(test_client: TestClient):
    _, started = _start(test_client)
    _code_of(started.json())  # a live code exists and must survive the wrong tries

    for wrong in ("222222", "333333", "444444", "555555", "666666"):
        response = _approve(test_client, wrong)
        assert response.status_code == 404, wrong
        assert response.json()["detail"]["code"] == "pairing_code_invalid"

    blocked = _approve(test_client, "777777")
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "rate_limited"
    assert int(blocked.headers["Retry-After"]) >= 1


@pytest.mark.integration
def test_pairing_limits_key_on_the_client_host_not_proxy_headers(test_client: TestClient):
    """The per-address bucket follows design §14: request.client.host, not a header."""
    for index in range(20):
        _, started = _start(test_client, f"screen-{index}")
        assert started.status_code == 200, started.text

    # Old code keyed this on the (absent) direct peer and called it "unknown",
    # giving a forged header a fresh bucket. The limit must not move.
    refused = test_client.post(
        "/api/kiosks/screen-20/pair",
        json={},
        headers={**_auth(_new_secret()), "X-Forwarded-For": "203.0.113.9"},
    )
    assert refused.status_code == 429
    assert refused.json()["detail"]["code"] == "rate_limited"


@pytest.mark.integration
def test_a_garbled_cookie_is_no_credential_not_a_500(test_client: TestClient):
    """A cookie Starlette unquotes to non-ASCII must not reach compare_digest."""
    test_client.cookies.clear()
    garbled = "k1.68616c6c.0123456789abcdef.1.\\351"
    response = test_client.get(
        "/api/kiosks/hall/pair", headers={"cookie": f'calvin_kiosk="{garbled}"'}
    )
    assert response.status_code == 200
    assert response.json()["state"] == "none"


@pytest.mark.integration
def test_approving_drops_the_other_pending_entries(test_client: TestClient):
    _, first = _start(test_client)
    other_secret, _second = _start(test_client)
    assert _approve(test_client, _code_of(first.json())).status_code == 200
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(other_secret)).json()["state"]
        == "none"
    )


@pytest.mark.integration
def test_concurrent_approval_single_winner(test_client: TestClient):
    _, started = _start(test_client)
    code = _code_of(started.json())
    barrier = threading.Barrier(2)

    def approve():
        barrier.wait()
        return _approve(test_client, code).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(
            future.result() for future in [pool.submit(approve), pool.submit(approve)]
        )
    assert statuses == [200, 404]

    rows = [k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "kitchen"]
    assert len(rows) == 1 and rows[0]["paired"] is True


@pytest.mark.integration
def test_install_code_pairs_at_once(test_client: TestClient):
    minted = test_client.post("/api/kiosks/install-codes")
    assert minted.status_code == 200, minted.text
    body = minted.json()
    assert set(body) == {"code", "expiresAt", "command"}
    assert body["code"].startswith("clv_pair_")
    assert body["expiresAt"].endswith("Z")
    assert f"/api/kiosks/install.sh?pair={body['code']}" in body["command"]
    assert "sudo bash" in body["command"]

    secret = _new_secret()
    paired = test_client.post(
        "/api/kiosks/kitchen/pair",
        json={"installCode": body["code"]},
        headers=_auth(secret),
    )
    assert paired.status_code == 200, paired.text
    assert paired.json()["state"] == "paired"
    assert "kitchen" in _ids(test_client)
    assert test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret)).json()["state"] == (
        "paired"
    )

    reused = test_client.post(
        "/api/kiosks/hall/pair",
        json={"installCode": body["code"]},
        headers=_auth(_new_secret()),
    )
    assert reused.status_code == 409
    assert reused.json()["detail"]["code"] == "install_code_invalid"


@pytest.mark.integration
def test_minting_an_install_code_needs_a_session(test_client: TestClient):
    test_client.cookies.clear()
    assert test_client.post("/api/kiosks/install-codes").status_code == 401

    assert (
        test_client.post("/api/auth/login", json={"password": "test-admin-password"}).status_code
        == 200
    )
    created = test_client.post(
        "/api/auth/keys",
        json={"name": "Homey", "scope": "read", "permissions": ["screens.power"]},
    )
    assert created.status_code == 201, created.text
    test_client.cookies.clear()
    refused = test_client.post("/api/kiosks/install-codes", headers=_auth(created.json()["secret"]))
    assert refused.status_code == 403


@pytest.mark.integration
def test_unpair_clears_the_hash(test_client: TestClient):
    secret, started = _start(test_client)
    assert _approve(test_client, _code_of(started.json())).status_code == 200

    unpair = test_client.delete("/api/kiosks/kitchen/pairing")
    assert unpair.status_code == 200
    assert unpair.json() == {"id": "kitchen", "changed": True}
    assert test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret)).json()["state"] == (
        "none"
    )
    row = next(k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "kitchen")
    assert row["paired"] is False

    again = test_client.delete("/api/kiosks/kitchen/pairing")
    assert again.status_code == 200 and again.json()["changed"] is False


@pytest.mark.integration
def test_unpair_unknown_kiosk_is_404(test_client: TestClient):
    response = test_client.delete("/api/kiosks/never-existed/pairing")
    assert response.status_code == 404


@pytest.mark.integration
def test_browser_only_pairing_sets_a_cookie_and_no_secret(test_client: TestClient):
    response = test_client.post("/api/kiosks/hall/pair", json={"browser": True})
    assert response.status_code == 200, response.text
    assert response.json() == {"state": "pending", "code": None, "expiresAt": None}
    assert "clv_kiosk_" not in response.text

    cookie_header = response.headers["set-cookie"]
    assert "calvin_kiosk=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=strict" in cookie_header.replace("samesite", "SameSite")
    assert "Path=/" in cookie_header

    mine = test_client.get("/api/kiosks/hall/pair")  # the cookie is in the jar
    assert mine.status_code == 200
    code = _code_of(mine.json())

    assert len(test_client.get("/api/kiosks/pairings").json()["pending"]) == 1
    again = test_client.post("/api/kiosks/hall/pair", json={"browser": True})
    assert again.status_code == 200
    assert test_client.get("/api/kiosks/hall/pair").json()["code"] == code
    assert len(test_client.get("/api/kiosks/pairings").json()["pending"]) == 1


@pytest.mark.integration
def test_browser_only_callers_with_one_peer_never_share_a_secret(test_client: TestClient):
    """A shared address (or a proxy header) is never proof of holding an entry."""
    admin = test_client.cookies.get(COOKIE_NAME)
    assert admin
    test_client.cookies.clear()
    # Both callers look like the same ("unknown") peer: the same forged proxy
    # header, which is what a reverse proxy or an attacker can arrange.
    proxy = {"X-Forwarded-For": "198.51.100.9", "cookie": f"{COOKIE_NAME}={admin}"}

    first = test_client.post("/api/kiosks/hall/pair", json={"browser": True}, headers=proxy)
    second = test_client.post("/api/kiosks/hall/pair", json={"browser": True}, headers=proxy)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    first_cookie = _set_cookie_value(first)
    second_cookie = _set_cookie_value(second)
    assert first_cookie != second_cookie
    assert first_cookie.split(".")[2] != second_cookie.split(".")[2]  # fingerprints

    def state(cookie: str) -> dict:
        return test_client.get(
            "/api/kiosks/hall/pair",
            headers={**proxy, "cookie": f"{COOKIE_NAME}={admin}; calvin_kiosk={cookie}"},
        ).json()

    assert state(first_cookie)["state"] == "pending"
    assert state(second_cookie)["state"] == "pending"
    code_a = state(first_cookie)["code"]
    code_b = state(second_cookie)["code"]
    assert code_a and code_b and code_a != code_b

    approved = test_client.post(
        "/api/kiosks/pairings",
        json={"code": code_a},
        headers={"cookie": f"{COOKIE_NAME}={admin}"},
    )
    assert approved.status_code == 200
    assert state(first_cookie)["state"] == "paired"
    # Approving the first caller's code never makes the second caller's cookie
    # a principal for the screen.
    assert state(second_cookie)["state"] == "none"


@pytest.mark.integration
def test_browser_session_sets_the_cookie_for_a_pending_secret(test_client: TestClient):
    secret, started = _start(test_client)
    code = _code_of(started.json())
    test_client.cookies.clear()

    response = test_client.post("/api/kiosks/kitchen/browser-session", headers=_auth(secret))
    assert response.status_code == 200, response.text
    assert response.json() == {"state": "pending"}
    assert "calvin_kiosk=" in response.headers["set-cookie"]
    assert "clv_kiosk_" not in response.text
    assert test_client.get("/api/kiosks/kitchen/pair").json()["code"] == code


@pytest.mark.integration
def test_browser_session_refuses_an_unknown_secret(test_client: TestClient):
    test_client.cookies.clear()
    response = test_client.post("/api/kiosks/kitchen/browser-session", headers=_auth(_new_secret()))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "kiosk_unpaired"


@pytest.mark.integration
def test_install_script_passes_the_pair_code_to_the_renderer(test_client: TestClient, monkeypatch):
    from app.services import kiosk_bundle

    rendered: list[str | None] = []

    def render(base_url: str, pair_code: str | None = None) -> str:
        rendered.append(pair_code)
        return "the script"

    monkeypatch.setattr(kiosk_bundle, "render_install_script", render)
    code = "clv_pair_" + "a" * 22
    embedded = test_client.get(f"/api/kiosks/install.sh?pair={code}")
    assert embedded.status_code == 200
    assert embedded.text == "the script"
    assert rendered == [code]

    plain = test_client.get("/api/kiosks/install.sh")
    assert plain.status_code == 200
    assert rendered[-1] is None


@pytest.mark.integration
def test_pairing_routes_keep_secrets_out_of_logs(test_client: TestClient):
    lines: list[str] = []
    sink = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    try:
        secret = _new_secret()
        code = "clv_pair_" + "b" * 22
        test_client.get(f"/api/kiosks/install.sh?pair={code}")
        test_client.post("/api/kiosks/kitchen/pair", json={}, headers=_auth(secret))
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(secret))
    finally:
        logger.remove(sink)
    joined = "\n".join(lines)
    assert "clv_kiosk_" not in joined
    assert "clv_pair_" not in joined


@pytest.mark.integration
def test_install_code_never_takes_over_a_paired_screen(test_client: TestClient):
    """A sniffed install code can give an attacker a screen, never someone else's."""
    old_secret, started = _start(test_client)
    assert _approve(test_client, _code_of(started.json())).status_code == 200
    minted = test_client.post("/api/kiosks/install-codes").json()["code"]

    attacker_secret = _new_secret()
    refused = test_client.post(
        "/api/kiosks/kitchen/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "install_code_invalid"
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(old_secret)).json()["state"]
        == "paired"
    )
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(attacker_secret)).json()["state"]
        == "none"
    )

    # The refused code was not used up: it still pairs a fresh screen.
    fresh = test_client.post(
        "/api/kiosks/hall/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert fresh.status_code == 200
    assert fresh.json()["state"] == "paired"


@pytest.mark.integration
def test_install_code_refuses_a_registered_unpaired_screen(test_client: TestClient):
    """A sniffed code gives a screen of one's own, never a registered screen's."""
    _register(test_client, "kitchen")  # a row exists, still unpaired
    minted = test_client.post("/api/kiosks/install-codes").json()["code"]
    attacker_secret = _new_secret()

    refused = test_client.post(
        "/api/kiosks/kitchen/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "install_code_invalid"
    row = next(k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "kitchen")
    assert row["paired"] is False
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(attacker_secret)).json()["state"]
        == "none"
    )

    # Refused before it was consumed: it still pairs a screen of the attacker's own.
    fresh = test_client.post(
        "/api/kiosks/hall/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert fresh.status_code == 200
    assert fresh.json()["state"] == "paired"


@pytest.mark.integration
def test_install_code_refuses_a_screen_whose_agent_is_pending(test_client: TestClient):
    """The real screen's in-flight agent pairing is not overwritten either."""
    agent_secret, started = _start(test_client)
    agent_code = _code_of(started.json())
    minted = test_client.post("/api/kiosks/install-codes").json()["code"]
    attacker_secret = _new_secret()

    refused = test_client.post(
        "/api/kiosks/kitchen/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "install_code_invalid"
    # The real screen's pending entry and code are untouched.
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(agent_secret)).json()["code"]
        == agent_code
    )
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(attacker_secret)).json()["state"]
        == "none"
    )

    # The refused code was not consumed.
    fresh = test_client.post(
        "/api/kiosks/hall/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert fresh.status_code == 200


@pytest.mark.integration
def test_install_code_write_is_create_only(test_client: TestClient, monkeypatch):
    """A row that appears after the pre-check is never overwritten by an install code.

    ``kiosk_exists`` is made to say "no row" after a poll registered one: that is
    the check-then-act window a concurrent approval (or a second install code)
    opens. The write must be create-if-absent and refuse, not update the row.
    """
    from app.services import kiosk_registry

    _register(test_client, "kitchen")  # the row already exists at the write

    async def no_row(_kiosk_id: str) -> bool:
        return False

    monkeypatch.setattr(kiosk_registry, "kiosk_exists", no_row)

    minted = test_client.post("/api/kiosks/install-codes").json()["code"]
    attacker_secret = _new_secret()
    refused = test_client.post(
        "/api/kiosks/kitchen/pair",
        json={"installCode": minted},
        headers=_auth(attacker_secret),
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "install_code_invalid"
    row = next(k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "kitchen")
    assert row["paired"] is False
    assert (
        test_client.get("/api/kiosks/kitchen/pair", headers=_auth(attacker_secret)).json()["state"]
        == "none"
    )
