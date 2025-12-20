"""Plugin installation service for managing installed plugins."""

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any

from app.config import settings


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

        # For zip files, validate structure without extracting
        # (extraction happens during install)
        with zipfile.ZipFile(plugin_path, "r") as zip_ref:
            # Find all plugin.json files in the zip
            plugin_jsons = [name for name in zip_ref.namelist() if name.endswith("plugin.json")]

            if not plugin_jsons:
                raise ValueError("plugin.json not found in plugin package")

            if len(plugin_jsons) > 1:
                raise ValueError(
                    f"Zip file contains {len(plugin_jsons)} plugins. "
                    "Zip files must contain exactly one plugin."
                )

            # Read and validate the manifest from zip
            plugin_json_path = plugin_jsons[0]
            try:
                with zip_ref.open(plugin_json_path) as f:
                    manifest = json.load(f)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON in plugin.json: {e}")

            # Validate required fields
            required_fields = ["id", "name", "version", "type"]
            for field in required_fields:
                if field not in manifest:
                    raise ValueError(f"Missing required field in plugin.json: {field}")

            # Validate plugin type
            valid_types = ["calendar", "image", "service"]
            if manifest["type"] not in valid_types:
                raise ValueError(
                    f"Invalid plugin type: {manifest['type']}. Must be one of {valid_types}"
                )

            # Check for plugin.py in the same directory as plugin.json
            plugin_dir = "/".join(plugin_json_path.split("/")[:-1])
            plugin_py_path = f"{plugin_dir}/plugin.py" if plugin_dir else "plugin.py"
            if plugin_py_path not in zip_ref.namelist():
                # Try alternative path separators
                plugin_dir_alt = "\\".join(plugin_json_path.split("\\")[:-1])
                plugin_py_path_alt = (
                    f"{plugin_dir_alt}\\plugin.py" if plugin_dir_alt else "plugin.py"
                )
                if plugin_py_path_alt not in zip_ref.namelist():
                    raise ValueError("plugin.py not found in plugin package")

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
        # Check for plugin.json
        manifest_path = plugin_dir / "plugin.json"
        if not manifest_path.exists():
            raise ValueError(f"plugin.json not found in {plugin_dir}")

        # Load and validate manifest
        try:
            with open(manifest_path, encoding="utf-8") as f:
                manifest = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in plugin.json: {e}")

        # Required fields
        required_fields = ["id", "name", "version", "type"]
        for field in required_fields:
            if field not in manifest:
                raise ValueError(f"Missing required field in plugin.json: {field}")

        # Validate plugin type
        valid_types = ["calendar", "image", "service"]
        if manifest["type"] not in valid_types:
            raise ValueError(
                f"Invalid plugin type: {manifest['type']}. Must be one of {valid_types}"
            )

        # Check for plugin.py
        plugin_py = plugin_dir / "plugin.py"
        if not plugin_py.exists():
            raise ValueError("plugin.py not found in plugin package")

        return manifest

    def install_plugin(
        self, source_path: Path, plugin_id: str | None = None, check_version: bool = True
    ) -> dict[str, Any]:
        """
        Install a plugin from a directory or zip file.

        Args:
            source_path: Path to plugin directory or zip file
            plugin_id: Optional plugin ID (if not provided, uses manifest ID)
            check_version: If True, checks for existing version and raises if older

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
                print(f"Error reading plugin manifest for {plugin_dir.name}: {e}")
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
                if "plugins" not in manifest_data:
                    raise ValueError("plugins.json missing 'plugins' array")

                plugins_list = []
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
        self, repo_path: Path, plugin_path: str, plugin_id: str | None = None
    ) -> dict[str, Any]:
        """
        Install a specific plugin from a repository.

        Args:
            repo_path: Path to repository root directory
            plugin_path: Relative path to plugin directory within repo
            plugin_id: Optional plugin ID override

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
        if self.get_plugin_path(install_id).exists():
            raise ValueError(f"Plugin {install_id} is already installed")

        # Install from directory
        return self.install_plugin(plugin_dir, install_id)


# Global plugin installer instance
plugin_installer = PluginInstaller()
