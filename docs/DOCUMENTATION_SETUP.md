# Documentation Setup

This document describes the documentation structure and how to build it.

## Documentation System

Calvin uses **MkDocs** with the **Material** theme for documentation. The documentation is automatically built and hosted on **GitHub Pages**.

## Building Documentation Locally

### Prerequisites

Install documentation dependencies:

```bash
cd backend
uv sync --extra docs
```

Or using pip:

```bash
pip install -e backend[docs]
```

### Build Documentation

```bash
# From project root
mkdocs build
```

### Serve Documentation Locally

```bash
# From project root
mkdocs serve
```

This will start a local server (usually at http://127.0.0.1:8000) where you can view the documentation.

**Auto-rebuild:** `mkdocs serve` automatically watches for changes in the `docs/` directory and `mkdocs.yml` file. When you save changes to any documentation file, MkDocs will automatically rebuild and refresh the browser. No need to manually restart the server!

**Note:** If you see a warning about `README.md` being excluded, this is expected. MkDocs automatically excludes `README.md` files when they conflict with `index.md` files. This is normal behavior.

## Documentation Structure

Documentation files are in the `docs/` directory:

- `index.md` - Home page
- `setup/` - Installation and setup guides
- `plugins/` - Plugin documentation
- `configuration/` - Configuration guides
- `testing/` - Testing documentation
- `archive/` - Archived/legacy documentation

## GitHub Pages Deployment

The documentation is automatically built and deployed to GitHub Pages via the `.github/workflows/docs.yml` workflow. The documentation is automatically built from the main branch when changes are pushed to the `docs/` directory or `mkdocs.yml` file, and is available at:

https://osterbergsimon.github.io/calvin/

## Contributing Documentation

When adding or updating documentation:

1. Edit files in the `docs/` directory
2. Update `mkdocs.yml` navigation if adding new pages
3. Test locally with `mkdocs serve`
4. Commit and push - GitHub Actions will automatically build and deploy to GitHub Pages

## Documentation Guidelines

- Use clear, concise language
- Include code examples where helpful
- Keep documentation up-to-date with code changes
- Follow the existing documentation structure
- Use Markdown formatting
