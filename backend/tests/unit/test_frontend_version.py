"""The frontend bundle version read from the built index.html (calvin-hshq)."""

from pathlib import Path

from app.api.routes import config as config_module

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_frontend_dist_resolves_to_the_built_frontend_in_a_checkout():
    # The image layout is the same shape with root=/ (backend at /app, dist at
    # /frontend/dist); the old parent count pointed inside backend/.
    assert config_module._FRONTEND_DIST == REPO_ROOT / "frontend" / "dist"


def test_reads_the_frontend_version_meta_tag(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text(
        '<html><head><meta name="frontend-version" content="8ea7088"></head></html>'
    )
    monkeypatch.setattr(config_module, "_FRONTEND_DIST", tmp_path)

    assert config_module.get_frontend_version() == "8ea7088"


def test_missing_built_frontend_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(config_module, "_FRONTEND_DIST", tmp_path)

    assert config_module.get_frontend_version() is None
