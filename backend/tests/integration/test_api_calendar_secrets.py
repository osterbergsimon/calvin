"""Calendar source lists never return feed URLs or API keys (audit S5, calvin-ua2).

A private ICS URL works as a bearer credential. The settings page loads a
source from the list and PUTs it back, so a blank value must keep the stored one.
"""

import asyncio

import pytest

from app.models.db_models import PluginDB
from app.plugins.base import PluginType

SOURCE_ID = "ical-secret-1"
FEED = "https://calendar.example.com/private/abc123def/basic.ics"
KEY = "cal-api-key-xyz"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture
def ical_source(test_client):
    async def create():
        await PluginDB.objects.create(
            id=SOURCE_ID,
            type_id="ical",
            plugin_type=PluginType.CALENDAR.value,
            name="Private",
            enabled=False,
            config={"ical_url": FEED, "api_key": KEY, "color": "#ff0000", "show_time": True},
        )

    _run(create())
    return SOURCE_ID


def _stored_config():
    async def get():
        return (await PluginDB.objects.get(id=SOURCE_ID)).config

    return _run(get())


def _listed_source(test_client):
    response = test_client.get("/api/calendar/sources")
    assert response.status_code == 200
    assert FEED not in response.text
    assert KEY not in response.text
    return next(s for s in response.json()["sources"] if s["id"] == SOURCE_ID)


def test_sources_list_blanks_feed_url_and_api_key(test_client, ical_source):
    source = _listed_source(test_client)

    assert source["ical_url"] == ""
    assert source["api_key"] == ""
    assert source["has_value"] == {"ical_url": True, "api_key": True}
    assert source["color"] == "#ff0000"


def test_source_edit_round_trip_keeps_feed_url_and_api_key(test_client, ical_source):
    source = _listed_source(test_client)

    response = test_client.put(
        f"/api/calendar/sources/{SOURCE_ID}", json={**source, "color": "#00ff00"}
    )

    assert response.status_code == 200
    assert FEED not in response.text
    stored = _stored_config()
    assert stored["ical_url"] == FEED
    assert stored["api_key"] == KEY
    assert stored["color"] == "#00ff00"
