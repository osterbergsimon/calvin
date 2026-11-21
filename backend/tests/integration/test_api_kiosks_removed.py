"""Removal records the id, re-adding forgets it (calvin-0xns, Task 8)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.services import kiosk_registry
from app.services.config_service import config_service
from app.services.kiosk_pairing import format_code, hash_secret, new_secret, pairing_store

KIOSK = "kitchen"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture(autouse=True)
def _clean():
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()
    yield
    pairing_store._pending.clear()
    pairing_store._install_codes.clear()
    pairing_store._new_by_address.clear()


def _register(kiosk_id: str = KIOSK) -> None:
    _run(kiosk_registry.record_kiosk(kiosk_id, hostname="pi", agent_version="v1"))


def _removed() -> list[str]:
    return _run(kiosk_registry.removed_kiosk_ids())


@pytest.mark.integration
def test_removing_a_screen_records_its_id(test_client: TestClient):
    _register()
    assert test_client.delete(f"/api/kiosks/{KIOSK}").status_code == 200
    assert _removed() == [KIOSK]
    assert "clv_" not in str(_run(config_service.get_value("kioskRemoved")))


@pytest.mark.integration
def test_removing_the_same_id_twice_does_not_duplicate_it(test_client: TestClient):
    _register()
    assert test_client.delete(f"/api/kiosks/{KIOSK}").status_code == 200
    _register()  # the screen polls again and comes back
    assert test_client.delete(f"/api/kiosks/{KIOSK}").status_code == 200
    assert _removed() == [KIOSK]


@pytest.mark.integration
def test_approving_a_code_forgets_the_removed_id(test_client: TestClient):
    _register()
    assert test_client.delete(f"/api/kiosks/{KIOSK}").status_code == 200
    secret = new_secret()
    pending = pairing_store.start(KIOSK, hash_secret(secret), "10.0.0.2", by_agent=True)
    approved = test_client.post("/api/kiosks/pairings", json={"code": format_code(pending.code)})
    assert approved.status_code == 200, approved.text
    assert _removed() == []
    assert _run(kiosk_registry.get_credential_hash(KIOSK)) == hash_secret(secret)


@pytest.mark.integration
def test_an_install_code_forgets_the_removed_id(test_client: TestClient):
    _register()
    assert test_client.delete(f"/api/kiosks/{KIOSK}").status_code == 200
    code = test_client.post("/api/kiosks/install-codes").json()["code"]
    secret = new_secret()
    paired = test_client.post(
        f"/api/kiosks/{KIOSK}/pair",
        json={"installCode": code},
        headers={"Authorization": f"Bearer {secret}"},
    )
    assert paired.status_code == 200, paired.text
    assert paired.json()["state"] == "paired"
    assert _removed() == []


@pytest.mark.integration
def test_no_config_route_accepts_kiosk_removed(test_client: TestClient):
    _run(config_service.set_value("kioskRemoved", ["hall"], value_type="json"))
    test_client.cookies.clear()
    anonymous = test_client.post("/api/config", json={"kioskRemoved": ["kitchen"]})
    assert anonymous.status_code == 401

    assert (
        test_client.post("/api/auth/login", json={"password": "test-admin-password"}).status_code
        == 200
    )
    refused = test_client.post("/api/config", json={"kioskRemoved": ["kitchen"]})
    assert refused.status_code == 422
    assert _removed() == ["hall"]


def test_kiosk_removed_is_never_a_display_key():
    from app.security.route_policy import CONFIG_DISPLAY_KEYS

    assert "kioskRemoved" not in CONFIG_DISPLAY_KEYS
