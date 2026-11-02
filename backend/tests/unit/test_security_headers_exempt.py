"""Unit tests for the _is_csp_exempt path helper in SecurityHeadersMiddleware."""

import pytest

from app.middleware.security_headers import _is_csp_exempt


@pytest.mark.unit
class TestIsCspExempt:
    # --- paths that MUST be exempt ---

    def test_docs_root_is_exempt(self):
        assert _is_csp_exempt("/docs") is True

    def test_docs_oauth2_redirect_is_exempt(self):
        assert _is_csp_exempt("/docs/oauth2-redirect") is True

    def test_redoc_is_exempt(self):
        assert _is_csp_exempt("/redoc") is True

    def test_openapi_json_is_exempt(self):
        assert _is_csp_exempt("/openapi.json") is True

    def test_openapi_prefix_variant_is_exempt(self):
        # /openapi covers any path starting with /openapi
        assert _is_csp_exempt("/openapi/v3") is True

    # --- paths that must NOT be exempt ---

    def test_root_not_exempt(self):
        assert _is_csp_exempt("/") is False

    def test_api_health_not_exempt(self):
        assert _is_csp_exempt("/api/health") is False

    def test_api_images_not_exempt(self):
        assert _is_csp_exempt("/api/images/1") is False

    def test_assets_not_exempt(self):
        assert _is_csp_exempt("/assets/x.js") is False

    def test_documents_not_exempt(self):
        # "/documents" starts with "/doc" but is NOT "/docs" or "/docs/" —
        # must NOT be exempted (exact-or-slash matching, not bare startswith).
        assert _is_csp_exempt("/documents") is False
