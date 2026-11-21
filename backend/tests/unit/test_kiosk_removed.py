"""The removed-screen list: ids only, oldest first, capped (calvin-0xns, Task 8)."""

import json

import pytest
from loguru import logger

from app.models.db_models import ConfigDB
from app.services import kiosk_registry
from app.services.config_service import config_service

pytestmark = pytest.mark.unit


async def _raw():
    row = await ConfigDB.objects.get_or_none(key="kioskRemoved")
    return None if row is None else row.value


async def test_absent_reads_as_an_empty_list(test_db):
    await config_service.delete_value("kioskRemoved")
    assert await kiosk_registry.removed_kiosk_ids() == []


@pytest.mark.parametrize(
    "value",
    [
        "kitchen",  # a bare string
        {"kitchen": True},  # a dict
        17,  # a number
    ],
)
async def test_a_value_that_is_not_a_list_reads_as_empty(test_db, value):
    await config_service.set_value("kioskRemoved", value, value_type="json")
    lines: list[str] = []
    sink = logger.add(lambda message: lines.append(str(message)), level="WARNING")
    try:
        assert await kiosk_registry.removed_kiosk_ids() == []
    finally:
        logger.remove(sink)
    assert any("kioskRemoved" in line for line in lines)


async def test_non_string_entries_are_dropped_with_a_warning(test_db):
    await config_service.set_value(
        "kioskRemoved", ["kitchen", 7, {"id": "hall"}, None], value_type="json"
    )
    lines: list[str] = []
    sink = logger.add(lambda message: lines.append(str(message)), level="WARNING")
    try:
        assert await kiosk_registry.removed_kiosk_ids() == ["kitchen"]
    finally:
        logger.remove(sink)
    assert any("kioskRemoved" in line for line in lines)


async def test_note_appends_once_and_returns_the_list(test_db):
    await config_service.delete_value("kioskRemoved")
    assert await kiosk_registry.note_kiosk_removed("kitchen") == ["kitchen"]
    assert await kiosk_registry.note_kiosk_removed("hall") == ["kitchen", "hall"]
    assert await kiosk_registry.note_kiosk_removed("kitchen") == ["kitchen", "hall"]
    assert await kiosk_registry.removed_kiosk_ids() == ["kitchen", "hall"]
    # An ordinary household config row, JSON typed.
    row = await ConfigDB.objects.get(key="kioskRemoved")
    assert row.value_type == "json"
    assert json.loads(row.value) == ["kitchen", "hall"]


async def test_the_list_holds_ids_only(test_db):
    await config_service.delete_value("kioskRemoved")
    await kiosk_registry.note_kiosk_removed("kitchen")
    raw = await _raw()
    assert raw is not None
    assert "clv_" not in raw
    assert "pi-kitchen" not in raw
    assert "10.0.0." not in raw
    # A SHA-256 hex would be 64 characters; an id is never one here.
    assert not any(len(part) == 64 for part in json.loads(raw))


async def test_the_cap_keeps_the_last_fifty_in_order(test_db):
    await config_service.delete_value("kioskRemoved")
    for index in range(51):
        await kiosk_registry.note_kiosk_removed(f"screen-{index}")
    kept = await kiosk_registry.removed_kiosk_ids()
    assert kept == [f"screen-{index}" for index in range(1, 51)]


async def test_forget_removes_an_id_and_is_a_no_op_otherwise(test_db):
    await config_service.set_value("kioskRemoved", ["kitchen", "hall"], value_type="json")
    await kiosk_registry.forget_kiosk_removed("not-listed")
    assert await kiosk_registry.removed_kiosk_ids() == ["kitchen", "hall"]
    await kiosk_registry.forget_kiosk_removed("kitchen")
    assert await kiosk_registry.removed_kiosk_ids() == ["hall"]
