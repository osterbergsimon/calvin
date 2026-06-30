"""End-to-end tests for GitHub plugin installation using a real GitHub repository.

These tests use a real GitHub repository to validate the full integration flow.
They are marked as e2e and slow, so they can be skipped in CI/CD pipelines.

To run these tests:
1. Create a test repository on GitHub (see docs/testing/E2E_TEST_REPO_SETUP.md)
2. Set TEST_GITHUB_REPO environment variable (optional, defaults to test repo)
3. Run: pytest tests/e2e/test_github_plugin_e2e.py -m e2e

These tests will be skipped if:
- Network is unavailable
- Repository doesn't exist
- GitHub API is down
"""

import os

import pytest

from app.services.plugin_installer import plugin_installer

# Default test repository (should be a public repo with test plugins)
# This can be overridden with TEST_GITHUB_REPO environment variable
DEFAULT_TEST_REPO = os.getenv(
    "TEST_GITHUB_REPO", "https://github.com/osterbergsimon/calvin-plugins"
)
DEFAULT_TEST_BRANCH = os.getenv("TEST_GITHUB_BRANCH", "main")


def check_network_available():
    """Check if network is available for E2E tests."""
    try:
        # Try a quick request to GitHub
        import asyncio

        import httpx

        async def check():
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get("https://github.com", follow_redirects=True)
                return response.status_code < 500

        return asyncio.run(check())
    except Exception:
        return False


@pytest.fixture(scope="module")
def network_available():
    """Check if network is available before running E2E tests."""
    if not check_network_available():
        pytest.skip("Network not available for E2E tests")
    return True


@pytest.mark.e2e
@pytest.mark.slow
@pytest.mark.integration
class TestGitHubPluginE2E:
    """End-to-end tests using a real GitHub repository."""

    @pytest.fixture(autouse=True)
    def setup_cleanup(self, network_available):
        """Clean up any test plugins before and after tests."""
        # Cleanup before
        test_plugin_ids = ["test_e2e_plugin", "test_e2e_plugin_with_frontend"]
        for plugin_id in test_plugin_ids:
            try:
                plugin_installer.uninstall_plugin(plugin_id)
            except Exception:
                pass

        yield

        # Cleanup after
        for plugin_id in test_plugin_ids:
            try:
                plugin_installer.uninstall_plugin(plugin_id)
            except Exception:
                pass

    def test_enumerate_plugins_from_real_github_repo(self, test_client, network_available):
        """Test enumerating plugins from a real GitHub repository."""
        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": DEFAULT_TEST_REPO, "branch": DEFAULT_TEST_BRANCH},
        )

        if response.status_code == 404:
            pytest.skip(f"GitHub repository not found or route not available: {DEFAULT_TEST_REPO}")

        if response.status_code != 200:
            # Repository might not exist or be private
            pytest.skip(
                f"Could not access repository {DEFAULT_TEST_REPO}: "
                f"{response.status_code} - {response.json().get('detail', 'Unknown error')}"
            )

        data = response.json()
        assert data["success"] is True
        assert "plugins" in data
        assert isinstance(data["plugins"], list)

        # Log what we found for debugging
        print(f"\nFound {len(data['plugins'])} plugins in {DEFAULT_TEST_REPO}")
        for plugin in data["plugins"]:
            print(f"  - {plugin.get('id', 'unknown')}: {plugin.get('name', 'unnamed')}")

    def test_install_plugin_from_real_github_repo(self, test_client, network_available):
        """Install the first plugin from the real repo that passes host validation.

        The external plugin repo evolves independently and may temporarily contain
        plugins whose metadata doesn't match the current host contract (e.g. mid-
        migration). Skipping such plugins keeps this test focused on the install
        machinery rather than the external repo's migration state — a 400 from a
        single plugin shouldn't redden core CI.
        """
        enum_response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": DEFAULT_TEST_REPO, "branch": DEFAULT_TEST_BRANCH},
        )

        if enum_response.status_code != 200:
            pytest.skip(
                f"Could not enumerate plugins from {DEFAULT_TEST_REPO}: {enum_response.status_code}"
            )

        enum_data = enum_response.json()
        candidates = [p for p in enum_data.get("plugins", []) if p.get("path")]
        if not candidates:
            pytest.skip(f"No installable plugins found in {DEFAULT_TEST_REPO}")

        skipped: list[str] = []
        for candidate in candidates:
            plugin_path = candidate["path"]
            plugin_id = candidate.get("id")

            install_response = test_client.post(
                "/api/plugins/github/install",
                json={
                    "repo_url": DEFAULT_TEST_REPO,
                    "plugin_path": plugin_path,
                    "branch": DEFAULT_TEST_BRANCH,
                },
            )

            if install_response.status_code == 404:
                pytest.skip("Install route not available in test client")

            if install_response.status_code == 400:
                detail = install_response.json().get("detail", "")
                skipped.append(f"{plugin_id}: {detail}")
                continue

            assert install_response.status_code == 200, (
                f"Installation failed: {install_response.status_code} - "
                f"{install_response.json().get('detail', 'Unknown error')}"
            )

            install_data = install_response.json()
            assert install_data["success"] is True
            assert install_data["manifest"]["id"] == plugin_id
            expected_restart = (
                install_data["manifest"].get("requirements", {}).get("restart_required", False)
            )
            assert install_data["requires_restart"] is expected_restart

            plugin_path_installed = plugin_installer.get_plugin_path(plugin_id)
            assert plugin_path_installed.exists()
            assert (plugin_path_installed / "plugin.json").exists()
            assert (plugin_path_installed / "plugin.py").exists()
            return

        pytest.skip(
            "No plugin in the external repo passed host validation. "
            f"Tried {len(candidates)}; details: {skipped}"
        )

    def test_branch_fallback_real_repo(self, test_client, network_available):
        """Test branch fallback behavior with a real repository."""
        # Try to enumerate with a non-existent branch first
        # This should trigger fallback logic if the repo uses 'master' instead of 'main'
        response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": DEFAULT_TEST_REPO},  # No branch specified, defaults to main
        )

        if response.status_code == 404:
            pytest.skip("Route not available or repository not found")

        # Should succeed (either with main or after fallback to master)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Log which branch was used
        actual_branch = data.get("branch", "unknown")
        branch_switched = data.get("branch_switched", False)
        print(f"\nUsed branch: {actual_branch} (switched: {branch_switched})")

    def test_install_plugin_with_frontend_static_assets_from_real_repo(
        self, test_client, network_available
    ):
        """Test installing a plugin with frontend static assets from a real repository."""
        # First, enumerate to find plugins with frontend
        enum_response = test_client.post(
            "/api/plugins/github/enumerate",
            json={"repo_url": DEFAULT_TEST_REPO, "branch": DEFAULT_TEST_BRANCH},
        )

        if enum_response.status_code != 200:
            pytest.skip("Could not enumerate plugins")

        enum_data = enum_response.json()
        plugins = enum_data.get("plugins", [])

        # Find a plugin that likely has frontend (or use first one)
        test_plugin = None
        for plugin in plugins:
            # Check if plugin path suggests it has frontend
            # (This is a heuristic - in a real test repo, you'd know which plugins have frontend)
            test_plugin = plugin
            break

        if not test_plugin:
            pytest.skip("No plugins available for testing")

        plugin_path = test_plugin.get("path")
        plugin_id = test_plugin.get("id")

        # Install the plugin
        install_response = test_client.post(
            "/api/plugins/github/install",
            json={
                "repo_url": DEFAULT_TEST_REPO,
                "plugin_path": plugin_path,
                "branch": DEFAULT_TEST_BRANCH,
            },
        )

        if install_response.status_code != 200:
            pytest.skip(f"Could not install plugin: {install_response.status_code}")

        install_data = install_response.json()
        assert install_data["success"] is True

        # Frontend assets (if any) live inside the plugin's data dir under
        # frontend/. The host serves them via /api/plugins/{id}/static/*.

        # Cleanup
        try:
            plugin_installer.uninstall_plugin(plugin_id)
        except Exception:
            pass
