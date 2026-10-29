"""Secret config values never reach the frontend and survive an edit (audit S4, calvin-ua2).

The instance list used to return ``s***t``; the edit form loaded that and PUT
merged it verbatim, so the first edit or rename broke every stored credential.
"""

import asyncio

import pytest

from app.models.db_models import PluginDB
from app.plugins.base import PluginType
from app.plugins.definitions import PluginMetadata
from app.plugins.loader import plugin_loader
from app.plugins.protocols import ServicePlugin

TYPE_ID = "secretdemo"
INSTANCE_ID = "secretdemo-1"
SECRET = "s3cr3t-value"
PIN = "4321"


class SecretDemoPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id=TYPE_ID,
        name="Secret Demo",
        instance_config_schema={
            "url": {"type": "string", "default": ""},
            "api_key": {"type": "password", "default": ""},
            "pin": {"type": "string", "default": "", "ui": {"component": "password"}},
            # Key name looks sensitive, schema says it isn't: schema wins.
            "token_count": {"type": "integer", "default": 5},
        },
    )

    @classmethod
    async def test_connection(cls, config):
        return {"success": config.get("api_key") == SECRET, "message": "checked"}

    async def fetch(self, start_date=None, end_date=None):
        return {}


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture
def secret_instance(test_client, monkeypatch):
    monkeypatch.setitem(plugin_loader._types, TYPE_ID, SecretDemoPlugin)

    async def create():
        await PluginDB.objects.create(
            id=INSTANCE_ID,
            type_id=TYPE_ID,
            plugin_type=PluginType.SERVICE.value,
            name="Demo",
            enabled=False,
            config={"url": "http://demo.local", "api_key": SECRET, "pin": PIN, "token_count": 7},
        )

    _run(create())
    yield INSTANCE_ID


def _stored_config():
    async def get():
        return (await PluginDB.objects.get(id=INSTANCE_ID)).config

    return _run(get())


def _listed_instance(test_client):
    response = test_client.get(f"/api/plugins/{TYPE_ID}/instances")
    assert response.status_code == 200
    assert SECRET not in response.text
    assert PIN not in response.text
    (instance,) = response.json()["instances"]
    return instance


def test_list_returns_blank_secrets_with_has_value(test_client, secret_instance):
    instance = _listed_instance(test_client)

    assert instance["config"]["api_key"] == ""
    assert instance["config"]["pin"] == ""
    assert instance["config"]["url"] == "http://demo.local"
    assert instance["config"]["token_count"] == 7
    assert instance["has_value"] == {"api_key": True, "pin": True}


def test_edit_round_trip_keeps_secret(test_client, secret_instance):
    """Load the instance as the edit form does, rename it, save it back."""
    instance = _listed_instance(test_client)

    response = test_client.put(
        f"/api/plugins/instances/{INSTANCE_ID}",
        json={"name": "Renamed", "config": instance["config"], "enabled": False},
    )

    assert response.status_code == 200
    assert SECRET not in response.text
    stored = _stored_config()
    assert stored["api_key"] == SECRET
    assert stored["pin"] == PIN
    assert response.json()["instance"]["has_value"]["api_key"] is True


@pytest.mark.parametrize("masked", ["s***e", "***", None])
def test_put_ignores_masked_or_null_secret(test_client, secret_instance, masked):
    response = test_client.put(
        f"/api/plugins/instances/{INSTANCE_ID}", json={"config": {"api_key": masked}}
    )

    assert response.status_code == 200
    assert _stored_config()["api_key"] == SECRET


def test_put_with_new_secret_replaces_it(test_client, secret_instance):
    response = test_client.put(
        f"/api/plugins/instances/{INSTANCE_ID}", json={"config": {"api_key": "rotated"}}
    )

    assert response.status_code == 200
    assert _stored_config()["api_key"] == "rotated"
    assert "rotated" not in response.text


def test_test_connection_fills_blank_secret_from_instance(test_client, secret_instance):
    instance = _listed_instance(test_client)

    response = test_client.post(
        f"/api/plugins/{TYPE_ID}/test",
        params={"instance_id": INSTANCE_ID},
        json=instance["config"],
    )

    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.fixture
def secret_type_config(test_client, monkeypatch):
    import json

    from app.services.config_service import config_service

    monkeypatch.setitem(plugin_loader._types, TYPE_ID, SecretDemoPlugin)
    _run(
        config_service.set_value(
            f"plugin_{TYPE_ID}_config", json.dumps({"url": "http://demo.local", "api_key": SECRET})
        )
    )

    def stored():
        return json.loads(_run(config_service.get_value(f"plugin_{TYPE_ID}_config")))

    return stored


def test_type_config_get_returns_blank_secret(test_client, secret_type_config):
    response = test_client.get(f"/api/plugins/{TYPE_ID}/config")

    assert response.status_code == 200
    assert SECRET not in response.text
    assert response.json()["api_key"] == ""
    assert response.json()["url"] == "http://demo.local"


@pytest.mark.parametrize("sent", ["", "s***e"])
def test_type_config_put_keeps_secret_sent_back_blank(test_client, secret_type_config, sent):
    response = test_client.put(
        f"/api/plugins/{TYPE_ID}/config",
        json={"config": {"url": "http://new.local", "api_key": sent}},
    )

    assert response.status_code == 200
    assert SECRET not in response.text
    assert secret_type_config() == {"url": "http://new.local", "api_key": SECRET}


def test_test_connection_fills_blank_secret_from_type_config(test_client, secret_type_config):
    response = test_client.post(
        f"/api/plugins/{TYPE_ID}/test", json={"url": "http://demo.local", "api_key": ""}
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
