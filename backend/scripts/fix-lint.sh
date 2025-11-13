#!/bin/bash
# Script to automatically fix linting issues

set -e

echo "🔍 Running Ruff linter with auto-fix..."
uv run ruff check --fix .

echo "📝 Running Ruff formatter..."
uv run ruff format .

echo "✅ All linting issues fixed!"
echo ""
echo "💡 Tip: Run 'uv run ruff check .' to verify no issues remain"

