"""Integration tests for the CSP security-headers middleware."""

import asyncio
import tempfile
from collections.abc import Generator
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import databases
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.testclient import TestClient

from app.models.db_models import PluginDB
from app.middleware.security_headers import SecurityHeadersMiddleware
from tests._support.db import (
    cleanup_db_file,
    create_tables_with_verify,
    update_ormar_models_database,
)


@pytest.fixture
def security_test_client(temp_image_dir: Path) -> Generator[TestClient, None, None]:
    """TestClient with SecurityHeadersMiddleware wired up, backed by a fresh DB."""
    import os

    import app.config

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    original_image_dir = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir.resolve())

    original_db_url = app.config.settings.database_url
    test_db_path_abs = db_path.resolve()
    app.config.settings.database_url = f"sqlite:///{test_db_path_abs}"

    create_tables_with_verify(db_path)

    test_db_url = f"sqlite+aiosqlite:///{test_db_path_abs}"
    test_database = databases.Database(test_db_url)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(test_database.connect())
    finally:
        loop.close()

    import app.database as db_module

    original_database = db_module.database
    db_module.database = test_database
    update_ormar_models_database(test_database)

    from app.api.routes import health

    test_app = FastAPI(title="Calvin Security Test API")
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    test_app.add_middleware(SecurityHeadersMiddleware)
    test_app.include_router(health.router, prefix="/api", tags=["health"])

    # HTMLResponse stand-in for the SPA's index.html FileResponse.
    # (Using HTMLResponse rather than FileResponse to avoid needing a real file
    # path in the fixture; the fragile BaseHTTPMiddleware+FileResponse combo is
    # covered by the dedicated test_csp_present_on_html_response test below.)
    @test_app.get("/spa")
    async def _spa_root():
        return HTMLResponse("<html><body>kiosk</body></html>")

    with TestClient(test_app) as client:
        yield client

    # Teardown
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_database.disconnect())
        finally:
            loop.close()
    except Exception:
        pass

    app.config.settings.database_url = original_db_url
    db_module.database = original_database
    update_ormar_models_database(original_database)

    if original_image_dir is None:
        os.environ.pop("IMAGE_DIR", None)
    else:
        os.environ["IMAGE_DIR"] = original_image_dir

    cleanup_db_file(db_path)


@pytest.mark.integration
class TestSecurityHeaders:
    def test_csp_present_on_api_response(self, security_test_client: TestClient):
        response = security_test_client.get("/api/health")
        csp = response.headers.get("content-security-policy")
        assert csp is not None
        assert "default-src 'self'" in csp
        assert "frame-src 'self'" in csp

    def test_frame_src_includes_configured_web_service_origin(
        self, security_test_client: TestClient
    ):
        # Seed an enabled built-in web-service (iframe) instance directly via
        # the async ORM, using the same pattern as conftest._seed_test_data.
        async def _seed():
            import ormar

            try:
                await PluginDB.objects.get(id="ws-grafana")
            except ormar.NoMatch:
                await PluginDB.objects.create(
                    id="ws-grafana",
                    type_id="iframe",
                    plugin_type="service",
                    name="Grafana",
                    enabled=True,
                    config={"url": "https://grafana.lab:3000/d/home"},
                    display_order=0,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_seed())
        finally:
            loop.close()

        response = security_test_client.get("/api/health")
        csp = response.headers.get("content-security-policy", "")
        assert "https://grafana.lab:3000" in csp

    def test_disabled_and_non_iframe_instances_excluded_from_frame_src(
        self, security_test_client: TestClient
    ):
        """Disabled iframe instances and enabled non-iframe instances must not
        appear in frame-src — only enabled type_id='iframe' instances count."""

        async def _seed():
            import ormar

            # (a) disabled iframe instance — should be excluded
            try:
                await PluginDB.objects.get(id="ws-disabled-iframe")
            except ormar.NoMatch:
                await PluginDB.objects.create(
                    id="ws-disabled-iframe",
                    type_id="iframe",
                    plugin_type="service",
                    name="Disabled Iframe",
                    enabled=False,
                    config={"url": "https://disabled-kiosk.internal/board"},
                    display_order=0,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )

            # (b) enabled non-iframe service instance — should be excluded
            try:
                await PluginDB.objects.get(id="ws-mealie-enabled")
            except ormar.NoMatch:
                await PluginDB.objects.create(
                    id="ws-mealie-enabled",
                    type_id="mealie",
                    plugin_type="service",
                    name="Mealie",
                    enabled=True,
                    config={"url": "https://mealie.internal/api"},
                    display_order=1,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_seed())
        finally:
            loop.close()

        response = security_test_client.get("/api/health")
        csp = response.headers.get("content-security-policy", "")
        assert "https://disabled-kiosk.internal" not in csp
        assert "https://mealie.internal" not in csp

    def test_csp_present_on_html_response(self, security_test_client: TestClient):
        """Middleware must stamp CSP on non-API HTML (SPA) responses.

        BaseHTTPMiddleware + FileResponse/HTMLResponse is a historically fragile
        combo in Starlette — this test locks in that stamping still works when
        the underlying response is HTML rather than JSON.  The route uses
        HTMLResponse (a FileResponse stand-in) to avoid requiring a real file
        path in the fixture.
        """
        response = security_test_client.get("/spa")
        assert response.status_code == 200
        csp = response.headers.get("content-security-policy")
        assert csp is not None, "CSP header must be present on HTML responses"
        assert "default-src 'self'" in csp
        assert "frame-src 'self'" in csp

    def test_db_error_falls_back_to_baseline_csp(self, security_test_client: TestClient):
        """A DB failure during origins lookup must never discard the response as a 500.

        The middleware must catch the exception and fall back to the baseline
        self-only CSP so the underlying route's response is still returned.
        """
        with patch(
            "app.middleware.security_headers.get_web_service_origins",
            new=AsyncMock(side_effect=Exception("simulated DB lock")),
        ):
            response = security_test_client.get("/api/health")

        assert response.status_code != 500
        csp = response.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "frame-src 'self'" in csp
