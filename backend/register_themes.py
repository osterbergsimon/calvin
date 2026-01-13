#!/usr/bin/env python3
"""Manually register built-in themes in the database.

This script can be used to register themes if migrations didn't work.
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path before imports
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))  # noqa: E402

from app.api.routes.plugins import sync_themes_to_db  # noqa: E402


async def main():
    """Register all built-in themes."""
    print("Registering built-in themes...")
    try:
        await sync_themes_to_db()
        print("✓ Themes registered successfully!")
        return 0
    except Exception as e:
        print(f"✗ Failed to register themes: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
