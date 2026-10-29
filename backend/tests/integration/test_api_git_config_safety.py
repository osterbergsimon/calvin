"""git/branches and update-channel config input validation (audit S6/S7, calvin-ua2).

``git ls-remote`` used to run on any URL (file://, ssh, ``--upload-pack=...``)
inside the event loop, and gitBranch/gitRepoUrl were written unvalidated into
/etc/default/calvin-update, which the update script sources as shell.
"""

import threading
from unittest.mock import MagicMock, patch

import pytest

import app.api.routes.config as config_routes

BAD_REPO_URLS = [
    "file:///etc",
    "ssh://git@github.com/user/repo.git",
    "git@github.com:user/repo.git",
    "http://github.com/user/repo.git",
    "--upload-pack=touch /tmp/pwned",
    "https://github.com/user/repo.git; touch /tmp/pwned",
    "https://github.com/user/repo.git\nGIT_BRANCH=x",
    "https://github.com/$(id)/repo.git",
    "https://github.com/`id`/repo.git",
]

BAD_BRANCHES = [
    "main; touch /tmp/pwned",
    "$(id)",
    "`id`",
    "main\nGIT_REPO=https://evil.example/x.git",
    "-n",
    "--upload-pack=x",
    "a..b",
    "feature/",
    "main.lock",
    "has space",
]


def _ok_ls_remote():
    result = MagicMock()
    result.returncode = 0
    result.stdout = "abc\trefs/heads/main\n"
    result.stderr = ""
    return result


@pytest.mark.parametrize("repo_url", BAD_REPO_URLS)
def test_git_branches_rejects_non_https_or_unsafe_urls(test_client, repo_url):
    with patch("app.api.routes.config.subprocess.run") as mock_run:
        response = test_client.get("/api/config/git/branches", params={"repo_url": repo_url})

    assert response.status_code == 400
    mock_run.assert_not_called()


def test_git_branches_puts_double_dash_before_url(test_client):
    with patch("app.api.routes.config.subprocess.run", return_value=_ok_ls_remote()) as mock_run:
        response = test_client.get(
            "/api/config/git/branches", params={"repo_url": "https://github.com/user/repo.git"}
        )

    assert response.status_code == 200
    argv = mock_run.call_args.args[0]
    assert argv[-2:] == ["--", "https://github.com/user/repo.git"]


def test_git_branches_runs_off_the_event_loop(test_client):
    seen = {}

    def fake_run(*args, **kwargs):
        seen["thread"] = threading.current_thread()
        return _ok_ls_remote()

    with patch("app.api.routes.config.subprocess.run", side_effect=fake_run):
        response = test_client.get(
            "/api/config/git/branches", params={"repo_url": "https://github.com/user/repo.git"}
        )

    assert response.status_code == 200
    assert seen["thread"] is not threading.main_thread()
    assert seen["thread"].name.startswith("asyncio")


def test_git_branches_error_does_not_echo_stderr(test_client):
    failed = MagicMock(returncode=128, stdout="", stderr="fatal: secret-token-in-stderr")
    with patch("app.api.routes.config.subprocess.run", return_value=failed):
        response = test_client.get(
            "/api/config/git/branches", params={"repo_url": "https://github.com/user/repo.git"}
        )

    assert response.status_code == 400
    assert "secret-token-in-stderr" not in response.text


@pytest.fixture
def update_file(tmp_path, monkeypatch):
    path = tmp_path / "calvin-update"
    path.write_text("CALVIN_MODE=prod\nGIT_BRANCH=main\nGIT_REPO=https://github.com/a/b.git\n")
    monkeypatch.setattr(config_routes, "CALVIN_UPDATE_FILE", path)
    return path


@pytest.mark.parametrize("branch", BAD_BRANCHES)
def test_config_rejects_unsafe_git_branch(test_client, update_file, branch):
    before = update_file.read_text()

    response = test_client.post("/api/config", json={"gitBranch": branch})

    assert response.status_code == 422
    assert update_file.read_text() == before


@pytest.mark.parametrize("repo_url", BAD_REPO_URLS)
def test_config_rejects_unsafe_git_repo_url(test_client, update_file, repo_url):
    before = update_file.read_text()

    response = test_client.post("/api/config", json={"gitRepoUrl": repo_url})

    assert response.status_code == 422
    assert update_file.read_text() == before


def test_config_writes_valid_git_settings(test_client, update_file):
    response = test_client.post(
        "/api/config",
        json={"gitBranch": "feature/x-1.2", "gitRepoUrl": "https://github.com/me/calvin.git"},
    )

    assert response.status_code == 200
    text = update_file.read_text()
    assert "GIT_BRANCH=feature/x-1.2\n" in text
    assert "GIT_REPO=https://github.com/me/calvin.git\n" in text
    assert "CALVIN_MODE=prod\n" in text


@pytest.mark.parametrize(
    "payload",
    [
        {"git_branch": "--upload-pack=touch /tmp/pwned"},
        {"git_repo_url": "file:///etc"},
    ],
)
def test_config_rejects_unsafe_snake_case_git_keys(test_client, payload):
    """ConfigUpdate allows extra keys; the snake_case aliases must not bypass validation."""
    response = test_client.post("/api/config", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{"gitBranch": ""}, {"gitRepoUrl": ""}])
def test_config_allows_empty_git_settings(test_client, update_file, payload):
    """Empty means "use the update script's default", as before."""
    response = test_client.post("/api/config", json=payload)

    assert response.status_code == 200


def test_update_refuses_stored_unsafe_git_branch(test_client, tmp_path, monkeypatch):
    """A value stored before validation existed must not reach update-calvin.sh."""
    import asyncio

    import app.api.routes.system as system_routes
    from app.services.config_service import config_service

    script_path = tmp_path / "update.sh"
    script_path.write_text("#!/bin/bash\n")
    original_settings = system_routes.settings

    class _StubSettings:
        deployment = "native"  # bare-metal install: the UI update route is allowed
        repo_dir = tmp_path
        system_path = original_settings.system_path

        def get_update_script_path(self):
            return script_path

    monkeypatch.setattr(system_routes, "settings", _StubSettings())
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(config_service.set_value("git_branch", "--upload-pack=x"))
    finally:
        loop.close()

    with patch("subprocess.Popen") as mock_popen:
        response = test_client.post("/api/system/update")

    assert response.status_code == 400
    mock_popen.assert_not_called()
