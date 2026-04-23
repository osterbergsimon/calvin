"""Plugin installation service for managing installed plugins."""

import json
import logging
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.validation import (
    validate_directory_structure,
    validate_manifest_format_version,
    validate_manifest_required_fields,
    validate_plugin_optional_fields,
    validate_plugin_type,
    validate_zip_structure,
)

logger = logging.getLogger(__name__)


class FrontendBuildManager:
    """Runs `npm run build` synchronously when plugins with frontend components are installed."""

    def build(self, frontend_dir: Path) -> tuple[bool, str]:
        """Run the frontend build synchronously. Returns (success, message)."""
        npm = shutil.which("npm")
        if not npm:
            return False, "npm not found — rebuild the frontend manually with: npm run build"

        # On Windows, .cmd files can't be executed by CreateProcess directly —
        # they need cmd.exe as the interpreter.
        if sys.platform == "win32":
            cmd = ["cmd", "/c", npm, "run", "build"]
        else:
            cmd = [npm, "run", "build"]

        try:
            result = subprocess.run(
                cmd,
                cwd=str(frontend_dir),
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode == 0:
                return True, "Frontend rebuilt successfully."
            tail = (result.stderr or result.stdout or "unknown error")[-500:]
            return False, f"Frontend rebuild failed: {tail}"
        except subprocess.TimeoutExpired:
            return False, "Frontend rebuild timed out (5 min limit)"
        except Exception as exc:
            return False, f"Frontend rebuild failed: {exc}"


frontend_build_manager = FrontendBuildManager()


class PluginInstaller:
    """Service for installing, updating, and uninstalling plugins."""

    def __init__(self):
        """Initialize plugin installer."""
        # Plugin installation directory (from config)
        self.plugins_dir = settings.plugins_dir.resolve()
        self.plugins_dir.mkdir(parents=True, exist_ok=True)

        # Frontend plugins directory (relative to backend directory)
        # Backend is typically in backend/, frontend is in frontend/
        backend_dir = Path(__file__).parent.parent.parent
        frontend_dir = backend_dir.parent / "frontend"
        self.frontend_plugins_dir = frontend_dir / "src" / "components" / "plugins"
        self.frontend_plugins_dir.mkdir(parents=True, exist_ok=True)

    def get_plugin_path(self, plugin_id: str) -> Path:
        """
        Get the installation path for a plugin.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Path to plugin directory
        """
        return self.plugins_dir / plugin_id

    def get_frontend_plugin_path(self, plugin_id: str) -> Path:
        """
        Get the frontend path for a plugin's components.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Path to frontend plugin directory
        """
        return self.frontend_plugins_dir / plugin_id

    def get_frontend_dir(self) -> Path:
        """Return the root of the frontend source tree (frontend/)."""
        return self.frontend_plugins_dir.parents[2]

    def validate_plugin_package(self, plugin_path: Path) -> dict[str, Any]:
        """
        Validate a plugin package structure.

        For zip files, ensures exactly one plugin is present.
        For directories, validates the single plugin.

        Args:
            plugin_path: Path to plugin directory or zip file

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid
        """
        # For directories, validate directly
        if not plugin_path.suffix == ".zip":
            return self._validate_plugin_directory(plugin_path)

        # For zip files, use shared validation
        manifest = validate_zip_structure(
            zip_path=plugin_path,
            manifest_filename="plugin.json",
            required_file="plugin.py",
        )

        # Validate plugin-specific fields
        required_fields = ["id", "name", "version", "type"]
        validate_manifest_required_fields(manifest, required_fields, "plugin.json")
        validate_plugin_type(manifest["type"])
        validate_manifest_format_version(
            manifest, ["1.0.0"], default_version="1.0.0", manifest_type="plugin.json"
        )
        validate_plugin_optional_fields(manifest)

        return manifest

    def _validate_plugin_directory(self, plugin_dir: Path) -> dict[str, Any]:
        """
        Validate a plugin directory structure.

        Args:
            plugin_dir: Path to plugin directory

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin directory is invalid
        """
        # Use shared validation for directory structure
        manifest = validate_directory_structure(
            directory=plugin_dir,
            manifest_filename="plugin.json",
            required_file="plugin.py",
        )

        # Validate plugin-specific fields
        required_fields = ["id", "name", "version", "type"]
        validate_manifest_required_fields(manifest, required_fields, "plugin.json")
        validate_plugin_type(manifest["type"])
        validate_manifest_format_version(
            manifest, ["1.0.0"], default_version="1.0.0", manifest_type="plugin.json"
        )
        validate_plugin_optional_fields(manifest)

        return manifest

    def install_plugin(
        self,
        source_path: Path,
        plugin_id: str | None = None,
        check_version: bool = True,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Install a plugin from a directory or zip file.

        Args:
            source_path: Path to plugin directory or zip file
            plugin_id: Optional plugin ID (if not provided, uses manifest ID)
            check_version: If True, checks for existing version and raises if older
            force: If True, uninstalls existing plugin before installing

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin package is invalid or already installed
        """
        # Validate plugin package (for zip, this validates without extracting)
        manifest = self.validate_plugin_package(source_path)

        # Use provided plugin_id or manifest ID
        install_id = plugin_id or manifest["id"]

        # Check if plugin already installed
        plugin_path = self.get_plugin_path(install_id)
        if plugin_path.exists():
            if force:
                # Force reinstall: uninstall existing plugin first
                import logging

                logger = logging.getLogger(__name__)
                logger.info(f"Force installing plugin {install_id}, removing existing installation")
                self.uninstall_plugin(install_id)
            else:
                # Check version if requested
                if check_version:
                    existing_manifest = self.get_plugin_manifest(install_id)
                    if existing_manifest:
                        existing_version = existing_manifest.get("version", "0.0.0")
                        new_version = manifest.get("version", "0.0.0")
                        # Simple version comparison (assumes semantic versioning)
                        try:
                            from packaging import version

                            if version.parse(new_version) < version.parse(existing_version):
                                raise ValueError(
                                    f"Plugin {install_id} version {new_version} is older than "
                                    f"installed version {existing_version}. "
                                    "Uninstall the existing plugin first."
                                )
                        except ImportError:
                            # packaging not available, skip version check
                            pass
                        except Exception:
                            # If version parsing fails, allow install but warn
                            pass

                raise ValueError(
                    f"Plugin {install_id} is already installed. "
                    "Uninstall the existing plugin first or use force=True to override."
                )

        # Create plugin directory
        plugin_path.mkdir(parents=True, exist_ok=True)

        try:
            # If source is a zip file, extract it
            if source_path.suffix == ".zip":
                with zipfile.ZipFile(source_path, "r") as zip_ref:
                    # Find plugin.json to determine plugin directory structure
                    plugin_json_path = None
                    for name in zip_ref.namelist():
                        if name.endswith("plugin.json"):
                            plugin_json_path = name
                            break

                    if not plugin_json_path:
                        raise ValueError("plugin.json not found in plugin package")

                    # Determine plugin root directory in zip
                    plugin_dir_in_zip = "/".join(plugin_json_path.split("/")[:-1])
                    if not plugin_dir_in_zip:
                        # plugin.json is at root, extract all
                        zip_ref.extractall(plugin_path)
                    else:
                        # plugin.json is in a subdirectory
                        # Extract only files from that directory and below
                        plugin_dir_prefix = plugin_dir_in_zip + "/"
                        for member in zip_ref.namelist():
                            if member.startswith(plugin_dir_prefix) or member == plugin_json_path:
                                # Extract to root of plugin_path, removing the subdirectory prefix
                                target_path = (
                                    member[len(plugin_dir_prefix) :]
                                    if member.startswith(plugin_dir_prefix)
                                    else member
                                )
                                if target_path:
                                    target = plugin_path / target_path
                                    if member.endswith("/"):
                                        target.mkdir(parents=True, exist_ok=True)
                                    else:
                                        target.parent.mkdir(parents=True, exist_ok=True)
                                        with zip_ref.open(member) as source:
                                            with open(target, "wb") as f:
                                                f.write(source.read())
            else:
                # Copy directory
                if source_path.is_dir():
                    # Copy all files except __pycache__ and .pyc files
                    for item in source_path.iterdir():
                        if item.name in ["__pycache__", ".git", ".gitignore"]:
                            continue
                        if item.is_dir():
                            shutil.copytree(item, plugin_path / item.name, dirs_exist_ok=True)
                        else:
                            shutil.copy2(item, plugin_path / item.name)
                else:
                    raise ValueError(f"Invalid source path: {source_path}")

            # Install frontend components if they exist
            frontend_source = plugin_path / "frontend"
            if frontend_source.exists():
                frontend_dest = self.get_frontend_plugin_path(install_id)
                if frontend_dest.exists():
                    shutil.rmtree(frontend_dest)
                shutil.copytree(frontend_source, frontend_dest)
                manifest["_has_frontend"] = True

            # Install plugin-specific Python packages
            installed_packages = self._install_pip_requirements(manifest)
            if installed_packages:
                manifest["_installed_packages"] = installed_packages

            # Save manifest
            manifest_path = plugin_path / "plugin.json"
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

            return manifest

        except Exception as e:
            # Cleanup on error
            if plugin_path.exists():
                shutil.rmtree(plugin_path)
            frontend_path = self.get_frontend_plugin_path(install_id)
            if frontend_path.exists():
                shutil.rmtree(frontend_path)
            raise ValueError(f"Failed to install plugin: {e}") from e

    def _install_pip_requirements(self, manifest: dict[str, Any]) -> list[str]:
        """Install Python packages declared in plugin.json under python_dependencies.

        Uses the running interpreter so the packages land in the correct venv.
        Raises ValueError if any package fails to install so the caller can roll back.
        """
        requirements: list[str] = manifest.get("python_dependencies", [])
        if not requirements:
            return []

        pip_cmd = self._resolve_pip()
        logger.info(
            f"Installing pip packages for plugin {manifest.get('id')} "
            f"using {pip_cmd}: {requirements}"
        )
        installed: list[str] = []
        for req in requirements:
            try:
                result = subprocess.run(
                    [*pip_cmd, req],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode == 0:
                    logger.info(f"Installed: {req}")
                    installed.append(req)
                else:
                    raise ValueError(f"pip install failed for '{req}':\n{result.stderr.strip()}")
            except subprocess.TimeoutExpired:
                raise ValueError(f"Timed out installing package '{req}' (120s limit)")

        return installed

    @staticmethod
    def _resolve_pip() -> list[str]:
        """Return the best pip invocation prefix for the running venv.

        Resolution order:
        1. uv pip install --python <exe>   — UV-managed venvs (no pip binary installed)
        2. bin/pip install / bin/pip3 install — conventional venvs with a pip binary
        3. python -m pip install           — last resort

        The returned list already includes "install"; append only the package name.
        """
        # 1. Prefer uv when available — works even when pip is absent from the venv
        uv = shutil.which("uv")
        if uv:
            return [uv, "pip", "install", "--python", sys.executable]

        # 2. pip/pip3 binary sitting next to the interpreter
        bin_dir = Path(sys.executable).parent
        for candidate in ("pip", "pip3"):
            pip_bin = bin_dir / candidate
            if pip_bin.exists():
                return [str(pip_bin), "install"]

        # 3. Last resort
        return [sys.executable, "-m", "pip", "install"]

    def uninstall_plugin(self, plugin_id: str) -> None:
        """
        Uninstall a plugin.

        Args:
            plugin_id: Plugin identifier

        Raises:
            ValueError: If plugin is not installed
        """
        plugin_path = self.get_plugin_path(plugin_id)
        if not plugin_path.exists():
            raise ValueError(f"Plugin {plugin_id} is not installed")

        # Remove plugin directory
        shutil.rmtree(plugin_path)

        # Remove frontend components
        frontend_path = self.get_frontend_plugin_path(plugin_id)
        if frontend_path.exists():
            shutil.rmtree(frontend_path)

    def get_installed_plugins(self) -> list[dict[str, Any]]:
        """
        Get list of installed plugins.

        Returns:
            List of plugin manifests
        """
        plugins = []
        if not self.plugins_dir.exists():
            return plugins

        for plugin_dir in self.plugins_dir.iterdir():
            if not plugin_dir.is_dir():
                continue

            manifest_path = plugin_dir / "plugin.json"
            if not manifest_path.exists():
                continue

            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
                manifest["_installed_path"] = str(plugin_dir)
                plugins.append(manifest)
            except (json.JSONDecodeError, Exception) as e:
                import logging

                logger = logging.getLogger(__name__)
                logger.warning(f"Error reading plugin manifest for {plugin_dir.name}: {e}")
                continue

        return plugins

    def get_plugin_manifest(self, plugin_id: str) -> dict[str, Any] | None:
        """
        Get manifest for an installed plugin.

        Args:
            plugin_id: Plugin identifier

        Returns:
            Plugin manifest dictionary or None if not found
        """
        plugin_path = self.get_plugin_path(plugin_id)
        manifest_path = plugin_path / "plugin.json"

        if not manifest_path.exists():
            return None

        try:
            with open(manifest_path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, Exception):
            return None

    def enumerate_plugins_from_repo(self, repo_path: Path) -> dict[str, Any]:
        """
        Enumerate plugins from a repository directory.

        First checks for plugins.json manifest file. If not found,
        auto-discovers plugins by scanning for directories containing
        plugin.json and plugin.py.

        Args:
            repo_path: Path to repository root directory

        Returns:
            Dictionary with 'manifest' (if found) and 'plugins' list
        """
        result: dict[str, Any] = {
            "has_manifest": False,
            "plugins": [],
        }

        # Check for plugins.json manifest
        manifest_path = repo_path / "plugins.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest_data = json.load(f)
                result["has_manifest"] = True
                result["manifest"] = manifest_data

                # Validate and enumerate plugins from manifest
                # Support both old format (just "plugins") and new format ("plugins" and "themes")
                plugins_list = []
                if "plugins" in manifest_data:
                    for plugin_info in manifest_data["plugins"]:
                        # Validate required fields
                        if "id" not in plugin_info or "path" not in plugin_info:
                            continue

                        plugin_path_rel = plugin_info["path"]
                        # Security: prevent path traversal
                        if ".." in plugin_path_rel or plugin_path_rel.startswith("/"):
                            continue

                        plugin_dir = repo_path / plugin_path_rel
                        if not plugin_dir.exists() or not plugin_dir.is_dir():
                            continue

                        # Validate plugin directory
                        try:
                            manifest = self._validate_plugin_directory(plugin_dir)
                            # Add metadata from manifest file
                            plugin_entry = {
                                "id": manifest["id"],
                                "name": plugin_info.get("name", manifest.get("name", "")),
                                "path": plugin_path_rel,
                                "description": plugin_info.get(
                                    "description", manifest.get("description", "")
                                ),
                                "version": plugin_info.get("version", manifest.get("version", "")),
                                "type": plugin_info.get("type", manifest.get("type", "")),
                                "manifest": manifest,
                            }
                            plugins_list.append(plugin_entry)
                        except ValueError:
                            # Invalid plugin, skip it
                            continue

                result["plugins"] = plugins_list
                return result
            except (json.JSONDecodeError, ValueError):
                # Invalid manifest, fall back to auto-discovery
                pass

        # Auto-discovery: scan for plugin directories
        plugins_list = []
        for item in repo_path.iterdir():
            if not item.is_dir():
                continue

            # Skip common non-plugin directories
            if item.name in [".git", "__pycache__", "node_modules", ".venv"]:
                continue

            # Check if directory contains plugin.json and plugin.py
            plugin_json = item / "plugin.json"
            plugin_py = item / "plugin.py"

            if plugin_json.exists() and plugin_py.exists():
                try:
                    manifest = self._validate_plugin_directory(item)
                    plugin_entry = {
                        "id": manifest["id"],
                        "name": manifest.get("name", ""),
                        "path": item.name,
                        "description": manifest.get("description", ""),
                        "version": manifest.get("version", ""),
                        "type": manifest.get("type", ""),
                        "manifest": manifest,
                    }
                    plugins_list.append(plugin_entry)
                except ValueError:
                    # Invalid plugin, skip it
                    continue

        result["plugins"] = plugins_list
        return result

    def install_plugin_from_repo(
        self, repo_path: Path, plugin_path: str, plugin_id: str | None = None, force: bool = False
    ) -> dict[str, Any]:
        """
        Install a specific plugin from a repository.

        Args:
            repo_path: Path to repository root directory
            plugin_path: Relative path to plugin directory within repo
            plugin_id: Optional plugin ID override
            force: If True, uninstalls existing plugin before installing

        Returns:
            Plugin manifest dictionary

        Raises:
            ValueError: If plugin path is invalid or plugin is invalid
        """
        # Security: prevent path traversal
        if ".." in plugin_path or plugin_path.startswith("/"):
            raise ValueError("Invalid plugin path: path traversal not allowed")

        plugin_dir = repo_path / plugin_path
        if not plugin_dir.exists() or not plugin_dir.is_dir():
            raise ValueError(f"Plugin directory not found: {plugin_path}")

        # Validate and install
        manifest = self._validate_plugin_directory(plugin_dir)
        install_id = plugin_id or manifest["id"]

        # Check if plugin already installed
        plugin_path = self.get_plugin_path(install_id)
        if plugin_path.exists():
            # Verify it's actually a valid installed plugin (not just a leftover directory)
            existing_manifest = self.get_plugin_manifest(install_id)
            if existing_manifest:
                # Plugin is actually installed and valid
                if force:
                    # Force reinstall: uninstall existing plugin first
                    import logging

                    logger = logging.getLogger(__name__)
                    logger.info(
                        f"Force installing plugin {install_id}, removing existing installation"
                    )
                    self.uninstall_plugin(install_id)
                else:
                    raise ValueError(f"Plugin {install_id} is already installed")
            else:
                # Plugin directory exists but is invalid/corrupted (no manifest)
                # Remove it and allow reinstallation
                import logging
                import shutil

                logger = logging.getLogger(__name__)
                logger.warning(
                    f"Found corrupted/invalid plugin directory for {install_id}, "
                    "removing and allowing reinstallation"
                )
                shutil.rmtree(plugin_path)
                # Also clean up frontend directory if it exists
                frontend_path = self.get_frontend_plugin_path(install_id)
                if frontend_path.exists():
                    shutil.rmtree(frontend_path)

        # Install from directory
        return self.install_plugin(plugin_dir, install_id, check_version=True, force=False)


# Global plugin installer instance
plugin_installer = PluginInstaller()
