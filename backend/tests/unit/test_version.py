"""Version and build revision shown in Settings > System (calvin-hshq)."""

import subprocess
from types import SimpleNamespace

import pytest

from app import __version__
from app import version as version_module


@pytest.fixture(autouse=True)
def _clear_version_env(monkeypatch):
    for name in ("CALVIN_VERSION", "CALVIN_GIT_SHA", "GIT_COMMIT_HASH"):
        monkeypatch.delenv(name, raising=False)
    version_module.get_revision.cache_clear()
    yield
    version_module.get_revision.cache_clear()


def test_version_defaults_to_the_package_version():
    assert version_module.get_version() == __version__


def test_version_prefers_the_image_build_arg(monkeypatch):
    monkeypatch.setenv("CALVIN_VERSION", "1.2.3")
    assert version_module.get_version() == "1.2.3"


def test_version_accepts_a_v_prefixed_build_arg(monkeypatch):
    monkeypatch.setenv("CALVIN_VERSION", "v1.2.3")
    assert version_module.get_version() == "1.2.3"


def test_revision_prefers_the_image_build_arg(monkeypatch):
    monkeypatch.setenv("CALVIN_GIT_SHA", "8ea7088\n")

    def fail_if_called(*args, **kwargs):
        pytest.fail("git must not be invoked when CALVIN_GIT_SHA is set")

    monkeypatch.setattr(version_module.subprocess, "run", fail_if_called)
    assert version_module.get_revision() == "8ea7088"


def test_revision_accepts_the_frontend_build_env_name(monkeypatch):
    monkeypatch.setenv("GIT_COMMIT_HASH", "8ea7088")
    monkeypatch.setattr(
        version_module.subprocess, "run", lambda *a, **k: pytest.fail("git must not be invoked")
    )
    assert version_module.get_revision() == "8ea7088"


def test_revision_falls_back_to_git_in_a_checkout(monkeypatch):
    monkeypatch.setattr(
        version_module.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout="8ea7088\n"),
    )
    assert version_module.get_revision() == "8ea7088"


def test_revision_is_none_without_env_or_git(monkeypatch):
    def missing_git(*args, **kwargs):
        raise FileNotFoundError("git")

    monkeypatch.setattr(version_module.subprocess, "run", missing_git)
    assert version_module.get_revision() is None


def test_revision_is_none_when_git_fails(monkeypatch):
    monkeypatch.setattr(
        version_module.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=128, stdout=""),
    )
    assert version_module.get_revision() is None


def test_revision_is_none_when_git_times_out(monkeypatch):
    def time_out(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="git", timeout=5)

    monkeypatch.setattr(version_module.subprocess, "run", time_out)
    assert version_module.get_revision() is None


def test_revision_shells_out_at_most_once(monkeypatch):
    calls = []

    def fake_git(*args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=0, stdout="8ea7088\n")

    monkeypatch.setattr(version_module.subprocess, "run", fake_git)
    assert version_module.get_revision() == "8ea7088"
    assert version_module.get_revision() == "8ea7088"
    assert len(calls) == 1
