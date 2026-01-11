# Documentation Setup

This document describes the documentation structure and how to build it.

## Documentation System

Calvin uses **MkDocs** with the **Material** theme for documentation. The documentation is automatically built and hosted on **Read the Docs**.

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

## Documentation Structure

Documentation files are in the `docs/` directory:

- `index.md` - Home page
- `setup/` - Installation and setup guides
- `plugins/` - Plugin documentation
- `configuration/` - Configuration guides
- `testing/` - Testing documentation
- `archive/` - Archived/legacy documentation

## Read the Docs Configuration

The `.readthedocs.yaml` file configures automatic builds on Read the Docs. The documentation is automatically built from the main branch and available at:

https://calvin.readthedocs.io/

## Contributing Documentation

When adding or updating documentation:

1. Edit files in the `docs/` directory
2. Update `mkdocs.yml` navigation if adding new pages
3. Test locally with `mkdocs serve`
4. Commit and push - Read the Docs will automatically build

## Documentation Guidelines

- Use clear, concise language
- Include code examples where helpful
- Keep documentation up-to-date with code changes
- Follow the existing documentation structure
- Use Markdown formatting
