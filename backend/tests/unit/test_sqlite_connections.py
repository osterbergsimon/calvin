"""SQLite connection hardening tests (audit R11).

`busy_timeout` used to be set on one connection only (`connect_db`). The
`databases` SQLite backend opens a fresh aiosqlite connection per
transaction, so every new connection needs the timeout from the driver.
"""

from pathlib import Path

import pytest

from app.database import create_database


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pooled_connections_get_a_busy_timeout(tmp_path: Path):
    db = create_database(f"sqlite+aiosqlite:///{tmp_path / 'busy.db'}")
    await db.connect()
    try:
        # A transaction gets its own aiosqlite connection, not the one used
        # by connect() — that is exactly the connection the PRAGMA used to miss.
        async with db.connection() as connection:
            busy_timeout = await connection.fetch_val("PRAGMA busy_timeout")
        assert busy_timeout == 5000
    finally:
        await db.disconnect()
