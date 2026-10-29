"""Manifest validation utilities."""

import re
from pathlib import Path
from typing import Any

# Plugin and theme ids name a directory under the data dir, so they must be a
# single safe path segment (audit S1, calvin-ua2). ``fullmatch`` (not ``$``) so a
# trailing newline is rejected too.
PLUGIN_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")


def validate_plugin_id(plugin_id: Any) -> str:
    """
    Validate a plugin or theme id against ``PLUGIN_ID_PATTERN``.

    Args:
        plugin_id: Id from a manifest, request body or URL path

    Returns:
        The id, unchanged

    Raises:
        ValueError: If the id is not a lowercase slug of 1-64 characters
    """
    if not isinstance(plugin_id, str) or not PLUGIN_ID_PATTERN.fullmatch(plugin_id):
        raise ValueError(
            f"Invalid id {plugin_id!r}: use 1-64 lowercase letters, digits, '_' or '-', "
            "starting with a letter or digit"
        )
    return plugin_id


def resolve_child_dir(base_dir: Path, child_id: str) -> Path:
    """
    Return ``base_dir / child_id`` after validating the id and asserting the
    resolved path is a direct child of ``base_dir``.

    Raises:
        ValueError: If the id is invalid or the path escapes ``base_dir``
    """
    validate_plugin_id(child_id)
    path = base_dir / child_id
    try:
        # A symlinked child (a dev checkout linked into data/plugins) is the
        # admin's own choice; rmtree refuses symlinks anyway.
        contained = path.is_symlink() or path.resolve().parent == base_dir.resolve()
    except (ValueError, OSError):
        contained = False
    if not contained:
        raise ValueError(f"Invalid id {child_id!r}: path escapes {base_dir}")
    return path


def validate_manifest_required_fields(
    manifest: dict[str, Any], required_fields: list[str], manifest_type: str = "manifest"
) -> None:
    """
    Validate that a manifest contains all required fields.

    Args:
        manifest: Manifest dictionary to validate
        required_fields: List of required field names
        manifest_type: Type of manifest (for error messages, e.g., "plugin.json", "theme.json")

    Raises:
        ValueError: If any required field is missing
    """
    for field in required_fields:
        if field not in manifest:
            raise ValueError(f"Missing required field in {manifest_type}: {field}")


def validate_manifest_api_version(
    manifest: dict[str, Any],
    current_version: int,
    manifest_type: str = "plugin.json",
) -> None:
    """
    Validate the manifest's plugin API version — the one enforced version signal.

    Unlike the retired format_version/protocol_version pair, this field is
    required and never default-filled: a plugin that doesn't declare it is
    rejected instead of silently passing.

    Args:
        manifest: Manifest dictionary to validate
        current_version: The host's CURRENT_PLUGIN_API_VERSION
        manifest_type: Type of manifest (for error messages)

    Raises:
        ValueError: If api_version is missing, non-int, or unsupported
    """
    api_version = manifest.get("api_version")
    if api_version is None:
        raise ValueError(
            f"{manifest_type} must declare api_version "
            f"(this Calvin supports api_version {current_version})"
        )
    if isinstance(api_version, bool) or not isinstance(api_version, int):
        raise ValueError(f"{manifest_type} api_version must be an integer")
    if api_version > current_version:
        raise ValueError(
            f"{manifest_type} api_version {api_version} is newer than this Calvin "
            f"supports ({current_version}). Update Calvin to use this plugin."
        )
    if api_version < current_version:
        raise ValueError(
            f"{manifest_type} api_version {api_version} is no longer supported "
            f"(current: {current_version}). Update the plugin."
        )


def validate_path_traversal(path: str | Path, base_path: str | Path | None = None) -> None:
    """
    Validate that a path does not contain path traversal attempts.

    Args:
        path: Path to validate
        base_path: Optional base path to check against

    Raises:
        ValueError: If path contains traversal attempts
    """
    path_str = str(path)
    # Check for common path traversal patterns
    if ".." in path_str or path_str.startswith("/") or "\\" in path_str:
        # Allow forward slashes in relative paths, but not absolute paths or parent references
        if path_str.startswith("/") or ".." in path_str:
            raise ValueError("Invalid path: path traversal not allowed")


def validate_plugin_type(plugin_type: str) -> None:
    """
    Validate plugin type.

    Args:
        plugin_type: Plugin type to validate

    Raises:
        ValueError: If plugin type is invalid
    """
    valid_types = ["calendar", "image", "service", "backend"]
    if plugin_type not in valid_types:
        raise ValueError(f"Invalid plugin type: {plugin_type}. Must be one of {valid_types}")


def validate_theme_variables(variables: Any) -> None:
    """
    Validate theme variables structure.

    Args:
        variables: Variables to validate

    Raises:
        ValueError: If variables structure is invalid
    """
    if not isinstance(variables, dict):
        raise ValueError("variables must be an object")


def validate_plugin_optional_fields(manifest: dict[str, Any]) -> None:
    """
    Validate optional plugin manifest fields structure.

    Args:
        manifest: Plugin manifest dictionary

    Raises:
        ValueError: If optional fields have invalid structure
    """
    # Validate dependencies structure. `dependencies.packages` is the single
    # dependency mechanism: a list of pip requirement strings the installer
    # actually installs.
    if "dependencies" in manifest:
        deps = manifest["dependencies"]
        if not isinstance(deps, dict):
            raise ValueError("dependencies must be an object")
        if "packages" in deps:
            packages = deps["packages"]
            if not isinstance(packages, list) or not all(
                isinstance(pkg, str) and pkg.strip() for pkg in packages
            ):
                raise ValueError(
                    "dependencies.packages must be a list of pip requirement strings "
                    '(e.g. ["psutil>=5.9"])'
                )

    # Validate files structure
    if "files" in manifest:
        files = manifest["files"]
        if not isinstance(files, dict):
            raise ValueError("files must be an object")
        if "include" in files and not isinstance(files["include"], list):
            raise ValueError("files.include must be an array")
        if "exclude" in files and not isinstance(files["exclude"], list):
            raise ValueError("files.exclude must be an array")

    # Validate requirements structure
    if "requirements" in manifest:
        reqs = manifest["requirements"]
        if not isinstance(reqs, dict):
            raise ValueError("requirements must be an object")
        if "restart_required" in reqs and not isinstance(reqs["restart_required"], bool):
            raise ValueError("requirements.restart_required must be a boolean")
        if "config_required" in reqs and not isinstance(reqs["config_required"], bool):
            raise ValueError("requirements.config_required must be a boolean")
        if "permissions" in reqs and not isinstance(reqs["permissions"], list):
            raise ValueError("requirements.permissions must be an array")
