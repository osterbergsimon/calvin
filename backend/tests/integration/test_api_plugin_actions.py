"""POST /api/plugins/{plugin_id}/actions/{action} (homey switch tiles §2).

The only plugin route that lets an anonymous caller change something, so every
case here runs logged out. The host must run only a declared action, with
params it validated, and must never leak config or exception text.
"""

import asyncio
import threading
import time
from typing import Any

import pytest
from loguru import logger

from app.plugins.actions import (
    MAX_ERROR_MESSAGE,
    PluginActionError,
    PluginActionRefused,
    action_in_flight,
    action_rate_limiter,
)
from app.plugins.definitions import PluginMetadata
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin, ServicePlugin
from tests.unit.test_plugin_actions import BAD_PARAMS

pytestmark = [pytest.mark.integration, pytest.mark.no_admin_login]

SECRET = "k-123-secret-value"
URL = "/api/plugins/{id}/actions/{action}"


class FakeSwitchPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="fake-switch",
        name="Fake Switch",
        actions=[
            {
                "name": "set_onoff",
                "params": {"device": {"type": "string"}, "on": {"type": "boolean"}},
            }
        ],
    )

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.initialize_calls = 0
        self.raise_error: BaseException | None = None
        self.config = {"api_key": SECRET, "host": "hub.invalid"}

    async def initialize(self) -> None:
        self.initialize_calls += 1

    async def fetch(self, start_date=None, end_date=None):
        return {"items": []}

    async def perform_action(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((name, params))
        if self.raise_error is not None:
            raise self.raise_error
        return {"item": {"id": params["device"], "state": "on" if params["on"] else "off"}}


class FakeBackendPlugin(BackendPlugin):
    metadata = PluginMetadata(type_id="fake-backend", name="Fake Backend")


@pytest.fixture(autouse=True)
def _reset_limiter():
    action_rate_limiter.reset()
    action_in_flight.reset()
    yield
    action_rate_limiter.reset()
    action_in_flight.reset()


@pytest.fixture
async def register(test_client):
    """Register a fake instance (plugin manager + DB row); clean up afterwards."""
    from app.models.db_models import PluginDB

    created: list[tuple[str, Any]] = []

    async def _register(
        plugin_id: str = "fake-switch-1",
        *,
        cls: type = FakeSwitchPlugin,
        enabled: bool = True,
        running: bool = True,
        plugin_type: str = "service",
    ):
        plugin = cls(plugin_id=plugin_id, name="Fake", enabled=enabled)
        await plugin_manager.register(plugin)
        if running and enabled:
            plugin.start()
        db_plugin = await PluginDB.objects.create(
            id=plugin_id,
            type_id=cls.metadata.type_id,
            plugin_type=plugin_type,
            name="Fake",
            enabled=enabled,
            config={"api_key": SECRET},
        )
        created.append((plugin_id, db_plugin))
        return plugin

    yield _register

    for plugin_id, db_plugin in created:
        await plugin_manager.unregister(plugin_id)
        await db_plugin.delete()


def _post(client, plugin_id="fake-switch-1", action="set_onoff", body=None, **kwargs):
    if body is None:
        body = {"params": {"device": "d1", "on": True}}
    return client.post(URL.format(id=plugin_id, action=action), json=body, **kwargs)


def _detail(response) -> dict[str, Any]:
    return response.json()["detail"]


async def test_anonymous_action_runs_and_returns_plugin_dict(test_client, register):
    plugin = await register()

    response = _post(test_client)

    assert response.status_code == 200, response.text
    assert response.json() == {"item": {"id": "d1", "state": "on"}}
    assert plugin.calls == [("set_onoff", {"device": "d1", "on": True})]
    assert SECRET not in response.text


async def test_unknown_instance_404(test_client):
    response = _post(test_client, plugin_id="no-such-instance")
    assert response.status_code == 404
    assert _detail(response)["code"] == "plugin_not_found"


async def test_db_row_without_running_manager_instance_404(test_client):
    from app.models.db_models import PluginDB

    db_plugin = await PluginDB.objects.create(
        id="orphan-1", type_id="fake-switch", plugin_type="service", name="X", enabled=True
    )
    try:
        response = _post(test_client, plugin_id="orphan-1")
        assert response.status_code == 404
        assert _detail(response)["code"] == "plugin_not_found"
    finally:
        await db_plugin.delete()


async def test_non_service_instance_404(test_client, register):
    await register("fake-backend-1", cls=FakeBackendPlugin, plugin_type="backend")
    response = _post(test_client, plugin_id="fake-backend-1")
    assert response.status_code == 404
    assert _detail(response)["code"] == "plugin_not_found"


async def test_disabled_instance_409(test_client, register):
    plugin = await register(enabled=False)
    response = _post(test_client)
    assert response.status_code == 409
    assert _detail(response)["code"] == "plugin_disabled"
    assert plugin.calls == []


async def test_stopped_instance_409_and_not_started(test_client, register):
    plugin = await register()
    assert await plugin_manager.stop_plugin("fake-switch-1") is True

    response = _post(test_client)

    assert response.status_code == 409
    assert _detail(response)["code"] == "plugin_stopped"
    assert plugin.calls == []
    assert plugin.is_running() is False
    assert plugin.initialize_calls == 0


async def test_never_started_instance_409_and_not_started(test_client, register):
    plugin = await register(running=False)

    response = _post(test_client)

    assert response.status_code == 409
    assert _detail(response)["code"] == "plugin_stopped"
    assert plugin.calls == []
    assert plugin.is_running() is False
    assert plugin.initialize_calls == 0


async def test_undeclared_action_404_and_plugin_not_called(test_client, register):
    plugin = await register()
    for action in ("toggle", "perform_action", "fetch", "SET_ONOFF"):
        response = _post(test_client, action=action)
        assert response.status_code == 404, action
        assert _detail(response)["code"] == "unknown_action"
    assert plugin.calls == []


async def test_plugin_without_actions_has_no_action(test_client, register):
    class Plain(ServicePlugin):
        metadata = PluginMetadata(type_id="plain-svc", name="Plain")

    await register("plain-1", cls=Plain)
    response = _post(test_client, plugin_id="plain-1", action="set_onoff")
    assert response.status_code == 404
    assert _detail(response)["code"] == "unknown_action"


@pytest.mark.parametrize("params", BAD_PARAMS)
async def test_bad_params_422_and_plugin_not_called(test_client, register, params):
    plugin = await register()
    response = _post(test_client, body={"params": params})
    assert response.status_code == 422
    assert plugin.calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"params": {"device": "d1", "on": True}, "extra": 1},  # top-level extra key
        {"device": "d1", "on": True},  # params not wrapped
        [],  # not an object
    ],
)
async def test_bad_body_422_and_plugin_not_called(test_client, register, body):
    plugin = await register()
    response = _post(test_client, body=body)
    assert response.status_code == 422
    assert plugin.calls == []


async def test_invalid_params_detail_is_coded_and_does_not_echo_values(test_client, register):
    await register()
    response = _post(test_client, body={"params": {"device": SECRET * 20, "on": True}})
    assert response.status_code == 422
    assert _detail(response)["code"] == "invalid_action_params"
    assert SECRET not in response.text


async def test_refused_maps_to_403_with_message(test_client, register):
    plugin = await register()
    plugin.raise_error = PluginActionRefused("Can't be switched from here")
    response = _post(test_client)
    assert response.status_code == 403
    assert _detail(response) == {
        "code": "plugin_action_refused",
        "message": "Can't be switched from here",
    }


async def test_action_error_maps_to_502_with_message(test_client, register):
    plugin = await register()
    plugin.raise_error = PluginActionError("Couldn't reach Homey")
    response = _post(test_client)
    assert response.status_code == 502
    assert _detail(response) == {"code": "plugin_action_failed", "message": "Couldn't reach Homey"}


async def test_long_error_message_trimmed_to_200(test_client, register):
    plugin = await register()
    plugin.raise_error = PluginActionError("x" * 500)
    response = _post(test_client)
    assert response.status_code == 502
    assert len(_detail(response)["message"]) == MAX_ERROR_MESSAGE


async def test_other_exception_is_generic_500(test_client, register):
    plugin = await register()
    plugin.raise_error = RuntimeError("secret-value")
    response = _post(test_client)
    assert response.status_code == 500
    assert _detail(response)["code"] == "plugin_action_error"
    assert "secret-value" not in response.text
    assert "RuntimeError" not in response.text


async def test_non_dict_result_is_generic_500(test_client, register):
    class Weird(FakeSwitchPlugin):
        metadata = PluginMetadata(
            type_id="weird-switch",
            name="Weird",
            actions=[{"name": "set_onoff", "params": {"device": {"type": "string"}}}],
        )

        async def perform_action(self, name, params):
            return ["not", "a", "dict", SECRET]

    await register("weird-1", cls=Weird)
    response = _post(test_client, plugin_id="weird-1", body={"params": {"device": "d1"}})
    assert response.status_code == 500
    assert SECRET not in response.text


async def test_sixth_action_in_a_second_is_429(test_client, register, monkeypatch):
    plugin = await register()
    monkeypatch.setattr(action_rate_limiter, "clock", lambda: 1000.0)

    for _ in range(5):
        assert _post(test_client).status_code == 200
    response = _post(test_client)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "1"
    assert _detail(response)["code"] == "rate_limited"
    assert len(plugin.calls) == 5


async def test_rate_limit_is_per_instance(test_client, register, monkeypatch):
    await register("fake-switch-1")
    await register("fake-switch-2")
    monkeypatch.setattr(action_rate_limiter, "clock", lambda: 1000.0)
    for _ in range(5):
        assert _post(test_client, plugin_id="fake-switch-1").status_code == 200
    assert _post(test_client, plugin_id="fake-switch-1").status_code == 429
    assert _post(test_client, plugin_id="fake-switch-2").status_code == 200


async def test_invalid_calls_do_not_use_up_the_rate_limit(test_client, register, monkeypatch):
    await register()
    monkeypatch.setattr(action_rate_limiter, "clock", lambda: 1000.0)
    for _ in range(10):
        assert _post(test_client, body={"params": {"device": "d1"}}).status_code == 422
    assert _post(test_client).status_code == 200


async def test_action_logged_without_config(test_client, register):
    await register()
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    try:
        _post(test_client)
    finally:
        logger.remove(sink_id)

    joined = "".join(lines)
    info = [line for line in lines if "set_onoff" in line and "INFO" in line]
    assert info, joined
    assert "fake-switch-1" in info[0]
    assert "'device': 'd1'" in info[0] and "'on': True" in info[0]
    assert SECRET not in joined
    assert "hub.invalid" not in joined


async def test_error_paths_do_not_log_config(test_client, register):
    plugin = await register()
    plugin.raise_error = RuntimeError("boom")
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    try:
        _post(test_client)
    finally:
        logger.remove(sink_id)
    assert SECRET not in "".join(lines)


async def test_cross_site_request_is_refused(test_client, register):
    plugin = await register()
    response = _post(
        test_client,
        headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403
    assert plugin.calls == []


async def test_foreign_host_header_is_refused(test_client, register):
    plugin = await register()
    response = _post(test_client, headers={"Host": "evil.example"})
    assert response.status_code in (400, 403, 421)
    assert plugin.calls == []


async def test_crash_with_secret_in_message_is_not_logged_even_with_diagnose(test_client, register):
    """A traceback with loguru's diagnose on prints locals; the route must not log one."""

    class Leaky(FakeSwitchPlugin):
        metadata = PluginMetadata(
            type_id="leaky-switch",
            name="Leaky",
            actions=[{"name": "set_onoff", "params": {"device": {"type": "string"}}}],
        )

        async def perform_action(self, name, params):
            key = self.config["api_key"]
            raise RuntimeError(f"auth failed for {key}")

    await register("leaky-1", cls=Leaky)
    lines: list[str] = []
    sink_id = logger.add(
        lambda message: lines.append(str(message)), level="DEBUG", diagnose=True, backtrace=True
    )
    try:
        response = _post(test_client, plugin_id="leaky-1", body={"params": {"device": "d1"}})
    finally:
        logger.remove(sink_id)
    assert response.status_code == 500
    joined = "".join(lines)
    assert "RuntimeError" in joined
    assert SECRET not in joined
    assert SECRET not in response.text


# ---- review round 1 ----------------------------------------------------------


class HangingPlugin(FakeSwitchPlugin):
    """``perform_action`` waits on ``gate`` (never set unless the test sets it)."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.gate = asyncio.Event()
        self.started = 0
        self.cancelled = 0

    async def perform_action(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        self.started += 1
        try:
            await self.gate.wait()
        except asyncio.CancelledError:
            self.cancelled += 1
            raise
        return {"ok": True}


async def test_hung_action_times_out_504_and_plugin_is_cancelled(
    test_client, register, monkeypatch
):
    import app.api.routes.plugins.actions as route

    monkeypatch.setattr(route, "ACTION_TIMEOUT_S", 0.05)
    plugin = await register(cls=HangingPlugin)
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    try:
        response = _post(test_client)
    finally:
        logger.remove(sink_id)
    assert response.status_code == 504
    assert _detail(response)["code"] == "plugin_action_timeout"
    assert SECRET not in response.text
    assert plugin.started == 1
    assert plugin.cancelled == 1
    assert "timed out" in "".join(lines)
    assert SECRET not in "".join(lines)
    assert action_in_flight.tracked_keys() == 0


async def test_plugin_raised_timeout_is_generic_500_not_the_host_504(test_client, register):
    """Only the host's own deadline is a 504; a plugin's timeout is any other crash."""
    plugin = await register()
    plugin.raise_error = TimeoutError(f"upstream timed out with {SECRET}")
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    try:
        response = _post(test_client)
    finally:
        logger.remove(sink_id)

    assert response.status_code == 500
    assert _detail(response)["code"] == "plugin_action_error"
    assert "plugin_action_timeout" not in response.text
    assert SECRET not in response.text

    joined = "".join(lines)
    # The same answer and log as any other unexpected plugin exception: type and
    # raise site, never the message.
    assert "TimeoutError" in joined
    assert "test_api_plugin_actions.py" in joined
    assert "timed out with" not in joined
    assert SECRET not in joined
    assert action_in_flight.tracked_keys() == 0


class GatedPlugin(FakeSwitchPlugin):
    """``perform_action`` blocks until ``release`` (a thread-safe event) is set."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.release = threading.Event()
        self.started = 0

    async def perform_action(self, name: str, params: dict[str, Any]) -> dict[str, Any]:
        self.started += 1
        await asyncio.to_thread(self.release.wait, 10)
        return {"ok": True}


async def test_third_concurrent_action_is_429_without_calling_plugin(
    test_client, register, monkeypatch
):
    plugin = await register(cls=GatedPlugin)
    # The in-flight cap is what is under test here, not the 5/s limiter.
    monkeypatch.setattr(action_rate_limiter, "limit", 100)

    results: list[int] = []
    threads = [
        threading.Thread(target=lambda: results.append(_post(test_client).status_code))
        for _ in range(2)
    ]
    for t in threads:
        t.start()
    deadline = time.monotonic() + 5
    while plugin.started < 2 and time.monotonic() < deadline:
        time.sleep(0.01)
    assert plugin.started == 2

    response = _post(test_client)
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "1"
    assert _detail(response)["code"] == "action_busy"
    assert plugin.started == 2

    plugin.release.set()
    for t in threads:
        t.join(5)
    assert results == [200, 200]
    assert _post(test_client).status_code == 200
    assert plugin.started == 3
    assert action_in_flight.tracked_keys() == 0


async def test_in_flight_slot_is_released_after_errors(test_client, register, monkeypatch):
    plugin = await register()
    monkeypatch.setattr(action_rate_limiter, "limit", 100)
    plugin.raise_error = RuntimeError("boom")
    for _ in range(3):
        assert _post(test_client).status_code == 500
    plugin.raise_error = PluginActionError("nope")
    for _ in range(3):
        assert _post(test_client).status_code == 502
    assert action_in_flight.tracked_keys() == 0
    plugin.raise_error = None
    assert _post(test_client).status_code == 200


async def test_extra_top_level_keys_get_a_small_422_and_plugin_not_called(test_client, register):
    plugin = await register()
    body = {"params": {"device": "d1", "on": True}}
    body.update({f"{i:04d}-" + "x" * 5000: 1 for i in range(2000)})
    response = _post(test_client, body=body)
    assert response.status_code == 422
    assert len(response.content) < 2000
    assert _detail(response)["code"] == "invalid_action_body"
    assert "and 1990 more" in response.text
    assert plugin.calls == []


async def _viewer_key() -> str:
    from app.security.api_keys import get_api_key_store

    _, secret = get_api_key_store().create("action-viewer", "read")
    return secret


async def test_viewer_key_gets_no_more_than_anonymous(test_client, register):
    plugin = await register()
    secret = await _viewer_key()
    headers = {"Authorization": f"Bearer {secret}"}
    anonymous = _post(test_client)
    keyed = _post(test_client, headers=headers)
    assert keyed.status_code == anonymous.status_code == 200
    # Unknown action / bad params behave the same with and without the key.
    assert _post(test_client, action="nope", headers=headers).status_code == 404
    assert _post(test_client, body={"params": {}}, headers=headers).status_code == 422
    assert len(plugin.calls) == 2


@pytest.mark.parametrize(
    "headers",
    [{"Origin": "null"}, {"Sec-Fetch-Site": "cross-site"}],
    ids=["origin-null", "cross-site-no-origin"],
)
async def test_hostile_browser_headers_are_refused(test_client, register, headers):
    plugin = await register()
    response = _post(test_client, headers=headers)
    assert response.status_code == 403
    assert plugin.calls == []


async def test_bogus_bearer_key_is_401(test_client, register):
    from app.security.admin_auth import api_key_limiter

    api_key_limiter._failures.clear()
    api_key_limiter._lockouts.clear()
    plugin = await register()
    response = _post(test_client, headers={"Authorization": "Bearer not-a-real-key"})
    assert response.status_code == 401
    assert plugin.calls == []
    api_key_limiter._failures.clear()
    api_key_limiter._lockouts.clear()


async def test_api_key_lockout_429_carries_retry_after(test_client, register):
    from app.security.admin_auth import api_key_limiter

    api_key_limiter._failures.clear()
    api_key_limiter._lockouts.clear()
    plugin = await register()
    headers = {"Authorization": "Bearer not-a-real-key"}
    try:
        statuses = [_post(test_client, headers=headers) for _ in range(8)]
        assert statuses[0].status_code == 401
        locked = [r for r in statuses if r.status_code == 429]
        assert locked
        assert int(locked[0].headers["Retry-After"]) >= 1
    finally:
        api_key_limiter._failures.clear()
        api_key_limiter._lockouts.clear()
    assert plugin.calls == []
