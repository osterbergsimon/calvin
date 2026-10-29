"""HTTP-level regression tests for plugin id traversal (audit S1, calvin-ua2).

``DELETE /api/plugins/installed/%2E%2E`` used to ``rmtree(plugins_dir / "..")``,
i.e. the whole data dir. The conftest points the plugins dir at
``tmp_path/plugins``, so the "data dir" here is ``tmp_path``.
"""

import pytest


@pytest.fixture
def sentinel(tmp_path):
    path = tmp_path / "calvin.db"
    path.write_text("db")
    return path


@pytest.mark.parametrize("encoded", ["%2E%2E", "%2e%2e", "..%2Fplugins", "%2E%2E%2F"])
def test_delete_percent_encoded_dotdot_is_rejected(test_client, sentinel, encoded):
    response = test_client.delete(f"/api/plugins/installed/{encoded}")

    # A decoded "/" changes which route (if any) matches; what matters is that
    # nothing is deleted and nothing succeeds.
    assert response.status_code in (400, 404, 405)
    assert sentinel.exists()
    assert (sentinel.parent / "plugins").is_dir()


def test_delete_invalid_id_returns_400(test_client, sentinel):
    response = test_client.delete("/api/plugins/installed/%2E%2E")

    assert response.status_code == 400


def test_get_installed_invalid_id_returns_400(test_client):
    response = test_client.get("/api/plugins/installed/%2E%2E")

    assert response.status_code == 400


def test_upload_install_rejects_traversal_plugin_id_override(test_client, tmp_path, sentinel):
    response = test_client.post(
        "/api/plugins/install",
        params={"plugin_id": "../escaped"},
        files={"file": ("p.zip", b"PK\x05\x06" + b"\x00" * 18, "application/zip")},
    )

    assert response.status_code == 400
    assert not (tmp_path / "escaped").exists()


@pytest.mark.parametrize("endpoint", ["/api/plugins/github/install", "/api/plugins/local/install"])
def test_repo_install_rejects_traversal_plugin_id_override(test_client, endpoint, tmp_path):
    response = test_client.post(
        endpoint,
        json={
            "repo_url": "https://github.com/example/repo",
            "local_path": str(tmp_path),
            "plugin_path": "okay",
            "plugin_id": "..",
            "force": True,
        },
    )

    # local/install is 403 outside dev mode; either way nothing is touched.
    assert response.status_code in (400, 403)
    assert (tmp_path / "plugins").is_dir()
