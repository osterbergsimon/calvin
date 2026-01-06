"""Manifest validation utilities."""

from pathlib import Path
from typing import Any


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


def validate_manifest_format_version(
    manifest: dict[str, Any],
    supported_versions: list[str],
    default_version: str = "1.0.0",
    manifest_type: str = "manifest",
) -> None:
    """
    Validate manifest format version.

    Args:
        manifest: Manifest dictionary to validate
        supported_versions: List of supported format versions
        default_version: Default version if not specified
        manifest_type: Type of manifest (for error messages)

    Raises:
        ValueError: If format version is unsupported
    """
    format_version = manifest.get("format_version", default_version)
    if format_version not in supported_versions:
        raise ValueError(
            f"Unsupported {manifest_type} format version: {format_version}. "
            f"Supported versions: {', '.join(supported_versions)}"
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
    valid_types = ["calendar", "image", "service"]
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
    # Validate dependencies structure
    if "dependencies" in manifest:
        deps = manifest["dependencies"]
        if not isinstance(deps, dict):
            raise ValueError("dependencies must be an object")
        if "packages" in deps and not isinstance(deps["packages"], dict):
            raise ValueError("dependencies.packages must be an object")
        if "system" in deps and not isinstance(deps["system"], dict):
            raise ValueError("dependencies.system must be an object")

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
