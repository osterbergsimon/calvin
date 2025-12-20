# Setting Up Pre-commit Hooks

Pre-commit hooks automatically run linting and formatting checks before each commit, preventing code with errors from being committed.

## Installation

### One-time Setup

```bash
# From the project root
cd backend
uv run pre-commit install
```

This will install the hooks into your `.git/hooks` directory.

## What It Does

When you run `git commit`, the hooks will automatically:

1. **Backend (Ruff)**:
   - Run `ruff check --fix` to auto-fix linting issues
   - Run `ruff format` to format code
   - If issues remain that can't be auto-fixed, the commit will be blocked

2. **Frontend (ESLint + Prettier)**:
   - Run ESLint with auto-fix
   - Run Prettier to format code

## Bypassing Hooks (if needed)

If you need to bypass the hooks for a specific commit (not recommended):

```bash
git commit --no-verify -m "your message"
```

## Updating Hooks

If the pre-commit configuration changes, update the hooks:

```bash
uv run pre-commit install --update-config
```

## Running Hooks Manually

You can run the hooks on all files without committing:

```bash
# From project root
cd backend
uv run pre-commit run --all-files
```

## Troubleshooting

### Hooks not running
- Make sure you ran `uv run pre-commit install` from the `backend` directory
- Check that `.git/hooks/pre-commit` exists

### "pre-commit: command not found"
- Use `uv run pre-commit` instead of just `pre-commit`
- Or ensure pre-commit is installed: `uv pip install pre-commit`

