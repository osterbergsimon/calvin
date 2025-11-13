# PowerShell script to automatically fix linting issues

Write-Host "🔍 Running Ruff linter with auto-fix..." -ForegroundColor Cyan
uv run ruff check --fix .

Write-Host "📝 Running Ruff formatter..." -ForegroundColor Cyan
uv run ruff format .

Write-Host "✅ All linting issues fixed!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tip: Run 'uv run ruff check .' to verify no issues remain" -ForegroundColor Yellow

