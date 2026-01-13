#!/bin/bash
# Auto-fix linting issues using Ruff
# This script runs both formatting and linting with auto-fix

echo "Running Ruff formatter (Black-compatible)..."
uv run ruff format .

echo "Running Ruff linter with auto-fix..."
uv run ruff check --fix --unsafe-fixes .

echo "Done! Some issues (like E501 - line too long) may require manual fixes."
