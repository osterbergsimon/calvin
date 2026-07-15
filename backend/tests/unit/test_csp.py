"""Unit tests for the CSP builder + origin parser."""

import pytest

from app.services.csp import build_csp, origin_from_url


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


@pytest.mark.unit
class TestBuildCsp:
    def test_baseline_contains_self_directives(self):
        csp = build_csp([])
        assert "default-src 'self'" in csp
        assert "img-src 'self' data:" in csp
        assert "connect-src 'self'" in csp
        assert "font-src 'self'" in csp
        assert "frame-src 'self'" in csp

    def test_frame_src_includes_given_origins(self):
        csp = build_csp(["https://grafana.lab", "http://192.168.1.50:3000"])
        assert "frame-src 'self' https://grafana.lab http://192.168.1.50:3000" in csp

    def test_frame_src_dedupes(self):
        csp = build_csp(["https://a.lab", "https://a.lab"])
        assert csp.count("https://a.lab") == 1
