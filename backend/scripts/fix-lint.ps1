# Auto-fix linting issues using Ruff
# This script runs both formatting and linting with auto-fix

Write-Host "Running Ruff formatter (Black-compatible)..." -ForegroundColor Cyan
uv run ruff format .

Write-Host "Running Ruff linter with auto-fix..." -ForegroundColor Cyan
uv run ruff check --fix --unsafe-fixes .

Write-Host "Done! Some issues (like E501 - line too long) may require manual fixes." -ForegroundColor Yellow
