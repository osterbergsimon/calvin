"""The kiosk credential columns and the registry helpers around them (calvin-0xns)."""

import pytest

from app.models.db_models import KioskDB
from app.services import kiosk_registry
from app.services.kiosk_registry import (
    _HEARTBEAT_COLUMNS,
    agent_pairs,
    clear_credential,
    create_paired_kiosk,
    get_credential_hash,
    list_kiosks,
    record_kiosk,
    set_credential,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

KIOSK = "kitchen"
HASH_A = "a" * 64
HASH_B = "b" * 64


def _hashes_in(row: dict) -> list[str]:
    return [key for key in row if "hash" in key.lower()]


async def test_set_get_clear_round_trip(test_db):
    await record_kiosk(KIOSK, hostname="pi")
    assert await get_credential_hash(KIOSK) is None

    await set_credential(KIOSK, HASH_A)
    assert await get_credential_hash(KIOSK) == HASH_A
    row = await KioskDB.objects.get(id=KIOSK)
    assert row.paired_at is not None

    assert await clear_credential(KIOSK) is True
    assert await get_credential_hash(KIOSK) is None
    row = await KioskDB.objects.get(id=KIOSK)
    assert row.credential_hash is None and row.paired_at is None

    assert await clear_credential(KIOSK) is False  # nothing left to clear


async def test_clear_unknown_id_returns_none_and_creates_no_row(test_db):
    assert await clear_credential("never-seen") is None
    assert await KioskDB.objects.count() == 0


async def test_set_credential_creates_a_missing_row_with_its_hostname(test_db):
    await set_credential("new-screen", HASH_A, hostname="pi-new")
    row = await KioskDB.objects.get(id="new-screen")
    assert row.credential_hash == HASH_A
    assert row.paired_at is not None
    assert row.hostname == "pi-new"
    # Approval is not a poll: the screen has no last_seen until it asks once.
    assert row.last_seen is None


async def test_create_paired_kiosk_only_ever_creates(test_db):
    """The install-code write: create-if-absent, never update someone's row."""
    assert await create_paired_kiosk("fresh", HASH_A, hostname="pi-fresh") is True
    row = await KioskDB.objects.get(id="fresh")
    assert row.credential_hash == HASH_A
    assert row.hostname == "pi-fresh"
    assert row.paired_at is not None
    assert row.last_seen is None

    await record_kiosk(KIOSK, hostname="pi-kitchen")
    assert await create_paired_kiosk(KIOSK, HASH_B) is False
    assert await get_credential_hash(KIOSK) is None
    assert await KioskDB.objects.count() == 2


async def test_set_credential_keeps_an_existing_hostname(test_db):
    await record_kiosk(KIOSK, hostname="pi-kitchen")
    await set_credential(KIOSK, HASH_A, hostname="a-different-host")
    row = await KioskDB.objects.get(id=KIOSK)
    assert row.credential_hash == HASH_A
    assert row.hostname == "pi-kitchen"  # only set on create


async def test_heartbeat_columns_never_carry_the_credential(test_db):
    assert "credential_hash" not in _HEARTBEAT_COLUMNS
    assert "paired_at" not in _HEARTBEAT_COLUMNS

    await record_kiosk(KIOSK, hostname="pi")
    await set_credential(KIOSK, HASH_A)
    await record_kiosk(KIOSK, hostname="pi", agent_version="v1", agent_status="ok")
    assert await get_credential_hash(KIOSK) == HASH_A


async def test_list_rows_carry_paired_state_but_never_the_hash(test_db):
    await record_kiosk("unpaired", hostname="pi-a")
    await set_credential(KIOSK, HASH_A, hostname="pi-b")

    rows = {row["id"]: row for row in await list_kiosks()}
    assert rows[KIOSK]["paired"] is True
    assert rows[KIOSK]["pairedAt"].endswith("Z")  # ISO-8601 UTC, like a hold's setAt
    assert rows["unpaired"]["paired"] is False
    assert rows["unpaired"]["pairedAt"] is None
    for row in rows.values():
        assert _hashes_in(row) == []


async def test_record_kiosk_reports_agent_pairs(test_db):
    await record_kiosk(KIOSK, agent_version="v", agent_features="hold,pair")
    row = (await list_kiosks())[0]
    assert row["agentPairs"] is True
    assert row["agentHolds"] is True

    await record_kiosk(KIOSK, agent_version="v", agent_features="hold")
    row = (await list_kiosks())[0]
    assert row["agentPairs"] is False


async def test_agent_pairs_reads_unknown_as_none():
    assert agent_pairs(None) is None
    assert agent_pairs("") is False
    assert agent_pairs("pair") is True
    assert kiosk_registry.AGENT_FEATURES == ("hold", "pair")
    assert kiosk_registry.PAIR_FEATURE == "pair"
