"""Package structure validation utilities."""

import json
import zipfile
from pathlib import Path
from typing import Any


def validate_directory_structure(
    directory: Path,
    manifest_filename: str,
    required_file: str | None = None,
) -> dict[str, Any]:
    """
    Validate a directory structure for a plugin or theme.

    Args:
        directory: Directory to validate
        manifest_filename: Name of manifest file (e.g., "plugin.json", "theme.json")
        required_file: Optional required file (e.g., "plugin.py")

    Returns:
        Manifest dictionary

    Raises:
        ValueError: If directory structure is invalid
    """
    # Check for manifest file
    manifest_path = directory / manifest_filename
    if not manifest_path.exists():
        raise ValueError(f"{manifest_filename} not found in {directory}")

    # Load and validate manifest
    try:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {manifest_filename}: {e}")

    # Check for required file if specified
    if required_file:
        required_path = directory / required_file
        if not required_path.exists():
            raise ValueError(f"{required_file} not found in package")

    return manifest


def validate_zip_structure(
    zip_path: Path,
    manifest_filename: str,
    required_file: str | None = None,
) -> dict[str, Any]:
    """
    Validate a zip file structure for a plugin or theme.

    Args:
        zip_path: Path to zip file
        manifest_filename: Name of manifest file (e.g., "plugin.json", "theme.json")
        required_file: Optional required file (e.g., "plugin.py")

    Returns:
        Manifest dictionary

    Raises:
        ValueError: If zip structure is invalid
    """
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        # Find all manifest files in the zip
        manifest_files = [name for name in zip_ref.namelist() if name.endswith(manifest_filename)]

        if not manifest_files:
            raise ValueError(f"{manifest_filename} not found in package")

        if len(manifest_files) > 1:
            raise ValueError(
                f"Zip file contains {len(manifest_files)} {manifest_filename.split('.')[0]}s. "
                "Zip files must contain exactly one."
            )

        # Read and validate the manifest from zip
        manifest_path = manifest_files[0]
        try:
            with zip_ref.open(manifest_path) as f:
                manifest = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {manifest_filename}: {e}")

        # Check for required file if specified
        if required_file:
            # Check for required file in the same directory as manifest
            manifest_dir = "/".join(manifest_path.split("/")[:-1])
            required_path = f"{manifest_dir}/{required_file}" if manifest_dir else required_file
            if required_path not in zip_ref.namelist():
                # Try alternative path separators
                manifest_dir_alt = "\\".join(manifest_path.split("\\")[:-1])
                required_path_alt = (
                    f"{manifest_dir_alt}\\{required_file}" if manifest_dir_alt else required_file
                )
                if required_path_alt not in zip_ref.namelist():
                    raise ValueError(f"{required_file} not found in package")

        return manifest
