"""Unit tests for the CSP builder + origin parser."""

import pytest

from app.services.csp import (
    build_csp,
    get_allowed_origins,
    get_plugin_browser_origins,
    get_sealed_mode,
    is_valid_origin,
    origin_from_url,
    validate_origin,
)


@pytest.mark.unit
class TestOriginFromUrl:
    def test_https_host_and_path_reduced_to_origin(self):
        assert origin_from_url("https://grafana.lab/some/path") == "https://grafana.lab"

    def test_keeps_explicit_port(self):
        assert origin_from_url("http://192.168.1.50:3000/x") == "http://192.168.1.50:3000"

    def test_none_for_empty(self):
        assert origin_from_url("") is None
        assert origin_from_url(None) is None

    def test_none_for_schemeless(self):
        assert origin_from_url("grafana.lab:3000") is None

    def test_none_for_ftp_scheme(self):
        assert origin_from_url("ftp://x.lab") is None

    def test_http_scheme_accepted(self):
        assert origin_from_url("http://x.lab") == "http://x.lab"

    def test_https_scheme_accepted(self):
        assert origin_from_url("https://x.lab") == "https://x.lab"


@pytest.mark.unit
class TestBuildCsp:
    def test_baseline_contains_self_directives(self):
        csp = build_csp([])
        assert "default-src 'self'" in csp
        assert "img-src 'self' data:" in csp
        assert "connect-src 'self'" in csp
        assert "font-src 'self' data:" in csp
        assert "frame-src 'self'" in csp
        assert "frame-ancestors 'self'" in csp

    def test_frame_src_includes_given_origins(self):
        csp = build_csp(["https://grafana.lab", "http://192.168.1.50:3000"])
        assert "frame-src 'self' https://grafana.lab http://192.168.1.50:3000" in csp

    def test_frame_src_dedupes(self):
        csp = build_csp(["https://a.lab", "https://a.lab"])
        assert csp.count("https://a.lab") == 1


@pytest.mark.unit
class TestValidateOrigin:
    def test_bare_host(self):
        assert validate_origin("grafana.lab") == "grafana.lab"

    def test_host_and_port(self):
        assert validate_origin("192.168.1.50:3000") == "192.168.1.50:3000"

    def test_subdomain_wildcard(self):
        assert validate_origin("*.lab.example.com") == "*.lab.example.com"

    def test_scheme_host_port(self):
        assert validate_origin("https://grafana.lab:3000") == "https://grafana.lab:3000"

    def test_lowercases_host_keeps_scheme(self):
        assert validate_origin("HTTPS://Grafana.Lab") == "https://grafana.lab"

    def test_rejects_cidr(self):
        with pytest.raises(ValueError):
            validate_origin("10.0.0.0/24")

    def test_rejects_path(self):
        with pytest.raises(ValueError):
            validate_origin("grafana.lab/d/home")

    def test_rejects_space(self):
        with pytest.raises(ValueError):
            validate_origin("a b")

    def test_rejects_empty(self):
        with pytest.raises(ValueError):
            validate_origin("")

    def test_rejects_bare_wildcard(self):
        with pytest.raises(ValueError):
            validate_origin("*")

    def test_rejects_non_http_scheme(self):
        with pytest.raises(ValueError):
            validate_origin("ftp://x.lab")

    def test_is_valid_origin_bool(self):
        assert is_valid_origin("grafana.lab") is True
        assert is_valid_origin("10.0.0.0/24") is False


@pytest.mark.unit
class TestBuildCspAllowlist:
    def test_empty_allowlist_is_byte_identical_to_no_allowlist(self):
        assert build_csp(["https://a.lab"], []) == build_csp(["https://a.lab"])
        assert build_csp([], None) == build_csp([])

    def test_allowlist_extends_three_directives(self):
        csp = build_csp([], ["https://grafana.lab"])
        assert "img-src 'self' data: https://grafana.lab" in csp
        assert "connect-src 'self' https://grafana.lab" in csp
        assert "frame-src 'self' https://grafana.lab" in csp

    def test_frame_src_merges_web_service_and_allowlist_deduped(self):
        csp = build_csp(["https://a.lab"], ["https://a.lab", "https://b.lab"])
        # 'a.lab' appears once in frame-src despite being in both inputs
        frame = [d for d in csp.split("; ") if d.startswith("frame-src")][0]
        assert frame.count("https://a.lab") == 1
        assert "https://b.lab" in frame


@pytest.mark.unit
class TestGetAllowedOrigins:
    async def test_reads_and_filters_config(self, monkeypatch):
        async def fake_get_value(key, default=None):
            assert key == "security_allowed_origins"
            return ["grafana.lab", "10.0.0.0/24", "grafana.lab"]  # bad + dupe

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_allowed_origins() == ["grafana.lab"]

    async def test_non_list_config_returns_empty(self, monkeypatch):
        async def fake_get_value(key, default=None):
            return "not-a-list"

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_allowed_origins() == []


@pytest.mark.unit
class TestGetPluginBrowserOrigins:
    async def test_unions_and_dedupes_enabled_plugin_origins(self, monkeypatch):
        class _Meta:
            def __init__(self, origins):
                self.browser_origins = origins

        class _Plugin:
            def __init__(self, origins):
                self.metadata = _Meta(origins)

        import app.plugins.manager as manager_module

        def fake_get_plugins(enabled_only=True):
            assert enabled_only is True
            return [_Plugin(["a.lab", "10.0.0.0/24"]), _Plugin(["b.lab", "a.lab"])]

        monkeypatch.setattr(manager_module.plugin_manager, "get_plugins", fake_get_plugins)

        # invalid entry (CIDR) is defensively dropped; valid ones deduped, order preserved
        assert await get_plugin_browser_origins() == ["a.lab", "b.lab"]

    async def test_empty_when_no_plugins(self, monkeypatch):
        import app.plugins.manager as manager_module

        monkeypatch.setattr(
            manager_module.plugin_manager, "get_plugins", lambda enabled_only=True: []
        )
        assert await get_plugin_browser_origins() == []


@pytest.mark.unit
class TestGetSealedMode:
    async def test_true_when_config_true(self, monkeypatch):
        async def fake_get_value(key, default=None):
            assert key == "sealed_mode"
            return True

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_sealed_mode() is True

    async def test_false_when_absent(self, monkeypatch):
        async def fake_get_value(key, default=None):
            return default

        import app.services.csp as csp_module

        monkeypatch.setattr(csp_module.config_service, "get_value", fake_get_value)
        assert await get_sealed_mode() is False
