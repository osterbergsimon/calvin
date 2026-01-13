# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for continuous integration and deployment.

## Workflows

### 1. CI (`ci.yml`)
Main continuous integration workflow that runs on every push and pull request.

**Jobs:**
- **Backend Tests & Lint**: Runs on Python 3.11 and 3.12
  - Ruff linter
  - Ruff formatter check
  - MyPy type checker
  - Bandit security linter
  - Pytest with coverage (unit + integration tests, including protocol adherence tests)
- **Frontend Tests & Lint**: Runs on Node.js 20 and 22
  - ESLint
  - Prettier check
  - Vitest with coverage
- **Build Check**: Verifies that both backend and frontend can build successfully

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### 2. Code Quality (`code-quality.yml`)
Dedicated workflow for code quality checks.

**Jobs:**
- **Backend Code Quality**
  - Ruff linter (strict mode)
  - Ruff formatter check
  - MyPy type checker
  - Bandit security scan
- **Frontend Code Quality**
  - ESLint
  - Prettier formatting check

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Weekly schedule (Mondays at 00:00 UTC)

### 3. Test Coverage (`test-coverage.yml`)
Generates and uploads test coverage reports.

**Features:**
- Backend coverage (pytest-cov)
- Frontend coverage (vitest)
- Uploads coverage to Codecov
- Generates HTML coverage reports as artifacts

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### 4. PR Checks (`pr-checks.yml`)
Additional checks for pull requests.

**Checks:**
- Large file detection (>10MB)
- Potential hardcoded secrets
- TODO/FIXME comment tracking
- File permission checks

**Triggers:**
- Pull request opened, updated, or reopened

## Coverage Reports

Coverage reports are uploaded to:
- **Codecov**: Automatic coverage tracking and reporting
- **Artifacts**: HTML coverage reports available for download from workflow runs

## Status Badges

Add these badges to your README.md:

```markdown
![CI](https://github.com/YOUR_USERNAME/calvin/workflows/CI/badge.svg)
![Code Quality](https://github.com/YOUR_USERNAME/calvin/workflows/Code%20Quality/badge.svg)
![Test Coverage](https://github.com/YOUR_USERNAME/calvin/workflows/Test%20Coverage/badge.svg)
```

## Local Testing

Before pushing, you can run the same checks locally:

### Backend
```bash
cd backend
uv sync --extra dev
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run bandit -r app
uv run pytest --cov=app --cov-report=term
```

### Frontend
```bash
cd frontend
npm ci
npm run lint
npx prettier --check "src/**/*.{js,jsx,vue,json,css}"
npm run test -- --coverage
npm run build
```

## Troubleshooting

### Workflow Fails Locally But Passes in CI
- Ensure you're using the same Python/Node versions
- Check that all dependencies are installed
- Verify environment variables are set correctly

### Coverage Reports Not Uploading
- Check that Codecov token is configured (if using private repo)
- Verify coverage files are being generated
- Check workflow logs for upload errors

### Type Checking Errors
- MyPy is currently set to not fail CI (`continue-on-error: true`)
- Fix type errors incrementally
- Use `# type: ignore` comments sparingly

## Future Enhancements

- [ ] Add deployment workflow for Raspberry Pi
- [ ] Add performance benchmarking
- [ ] Add security scanning (Dependabot, Snyk)
- [ ] Add automated dependency updates
- [ ] Add release automation
- [ ] Add Docker image building

