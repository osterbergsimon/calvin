"""Simple test for plugin type enable/disable - minimal test case."""

import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import PluginTypeDB


def test_simple_enable_plugin_type(test_client):
    """Simplest possible test: set enabled=True, verify via API."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Step 1: Set enabled=False
        async def setup():
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(PluginTypeDB).where(PluginTypeDB.type_id == "local")
                )
                db_type = result.scalar_one_or_none()
                if db_type:
                    db_type.enabled = False
                    await session.commit()

        loop.run_until_complete(setup())

        # Step 2: Call API to set enabled=True
        response = test_client.put("/api/plugins/local", json={"enabled": True})
        assert response.status_code == 200

        # Step 3: Verify enabled=True via GET endpoint (tests full stack)
        get_response = test_client.get("/api/plugins/local")
        assert get_response.status_code == 200
        plugin_data = get_response.json()
        assert (
            plugin_data["enabled"] is True
        ), f"Expected enabled=True, got {plugin_data.get('enabled')}"
    finally:
        loop.close()
