"""The version the UI shows is stamped by the release and image builds (calvin-hshq).

These are file-level checks because the bug was a build-pipeline gap: the
runtime image had no git, and the frontend meta tag was never filled in.
"""

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_release_please_bumps_the_version_the_ui_shows():
    config = json.loads((REPO_ROOT / "release-please-config.json").read_text())
    extra_files = config["packages"]["."].get("extra-files", [])
    assert {"type": "generic", "path": "backend/app/__init__.py"} in extra_files

    init_py = (REPO_ROOT / "backend/app/__init__.py").read_text()
    match = re.search(r'^__version__ = "([^"]+)"', init_py, re.MULTILINE)
    assert match, "backend/app/__init__.py must define __version__"
    assert "x-release-please-version" in init_py

    manifest = json.loads((REPO_ROOT / ".release-please-manifest.json").read_text())
    assert manifest["."] == match.group(1)


def test_dockerfile_bakes_the_version_and_revision_into_the_image():
    dockerfile = (REPO_ROOT / "docker/Dockerfile").read_text()

    # The runtime image has no git and no frontend source checkout, so both
    # values must arrive as build args and survive as env.
    assert "ARG CALVIN_VERSION" in dockerfile
    assert "ARG CALVIN_GIT_SHA" in dockerfile
    assert "CALVIN_VERSION=${CALVIN_VERSION}" in dockerfile
    assert "CALVIN_GIT_SHA=${CALVIN_GIT_SHA}" in dockerfile
    # The frontend build reads this to stamp index.html's meta tag.
    assert "GIT_COMMIT_HASH=${CALVIN_GIT_SHA}" in dockerfile


def test_docker_workflow_passes_version_and_revision_to_every_image_build():
    workflow = (REPO_ROOT / ".github/workflows/docker-build.yml").read_text()

    assert workflow.count("CALVIN_GIT_SHA=${{ steps.version.outputs.sha }}") == 3
    assert 'echo "sha=${GITHUB_SHA::7}"' in workflow
    assert workflow.count("CALVIN_VERSION=${{ steps.version.outputs.value }}") == 3
    assert "id: version" in workflow
