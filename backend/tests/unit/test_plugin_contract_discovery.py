"""Discovery rules for the calvin-plugins contract test.

An explicitly configured ``CALVIN_PLUGINS_DIR`` must resolve to a real
directory: CI sets it so the contract test can never silently skip when the
plugins checkout is missing or broken.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.integration.test_calvin_plugins_contracts import _resolve_plugins_dir


def test_configured_dir_is_used(tmp_path: Path) -> None:
    plugins = tmp_path / "checkout"
    plugins.mkdir()

    assert _resolve_plugins_dir(str(plugins), tmp_path / "repo") == plugins.resolve()


def test_configured_dir_must_exist(tmp_path: Path) -> None:
    missing = tmp_path / "not-checked-out"

    with pytest.raises(RuntimeError, match="CALVIN_PLUGINS_DIR"):
        _resolve_plugins_dir(str(missing), tmp_path / "repo")


def test_sibling_checkout_is_found(tmp_path: Path) -> None:
    repo_root = tmp_path / "calvin"
    repo_root.mkdir()
    sibling = tmp_path / "calvin-plugins"
    sibling.mkdir()

    assert _resolve_plugins_dir(None, repo_root) == sibling.resolve()


def test_missing_sibling_is_allowed(tmp_path: Path) -> None:
    repo_root = tmp_path / "calvin"
    repo_root.mkdir()

    assert _resolve_plugins_dir(None, repo_root) is None
