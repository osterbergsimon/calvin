# Contributing to Calvin

Thanks for wanting to improve Calvin. This is the one place to read before you
open a pull request: how to build, what the quality gates are, and how changes
travel from your branch to a release.

By taking part you agree to our [Code of Conduct](CODE_OF_CONDUCT.md). Security
problems go through the private process in [SECURITY.md](SECURITY.md) — never a
public issue.

## Ways to contribute

| You want to… | Go here |
| --- | --- |
| Fix a bug, add a feature, improve docs | this repository |
| Write or fix a plugin | [osterbergsimon/calvin-plugins](https://github.com/osterbergsimon/calvin-plugins) |
| Report a bug or request a feature | [open an issue](https://github.com/osterbergsimon/calvin/issues/new/choose) |
| Report a vulnerability | [SECURITY.md](SECURITY.md) |

**Plugin work belongs in `calvin-plugins`, not here.** Calvin ships the plugin
loader, the renderers, and the plugin contract; the plugins themselves live in
that separate repository (see the reference plugin, `mealie`). A pull request
that adds a plugin to this repository will be redirected there.

## Development setup

Run the whole stack in Docker:

```bash
git clone https://github.com/osterbergsimon/calvin.git
cd calvin
make install   # one-time: creates docker/.env from the example
make dev       # backend on :8000, frontend HMR on :5173
```

Or use the toolchain natively (Python 3.12+, Node.js 20+, `uv`):

```bash
cd backend  && uv sync --extra dev
cd frontend && npm ci
```

Details, platform notes, and troubleshooting: [Development quickstart](docs/setup/QUICKSTART_DEVELOP.md)
and [Getting started](docs/setup/GETTING_STARTED.md).

## Branch model

- **`develop`** is the integration branch. Every pull request targets it, and
  fixes land here first.
- **`main`** is the release branch. Releases are promoted from `develop`; do not
  open pull requests against `main`.

Workflow:

1. Fork (or, if you have write access, branch directly off `develop`):
   `git switch -c fix/calendar-timezone develop`
2. Make the change, with a test.
3. Run the gates below.
4. Open a pull request **into `develop`**.
5. Keep the branch focused — one topic per pull request, no drive-by refactors.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): a type, an
optional scope, then a short imperative summary.

```
feat(backend): serve plugin static assets from CALVIN_DATA_DIR
fix(frontend): unref service id before building the axios URL
docs(setup): explain signed kiosk manifests
test(plugins): cover instance config normalization
chore(deps): bump fastapi
```

`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore` are
the accepted types. Scopes in use: `backend`, `frontend`, `plugins`, `kiosk`,
`docker`, `docs`, `scripts`. Body and footer are optional; explain the *why*
when it is not obvious.

## Quality gates

CI runs the same gates. All of them must pass before review — run the ones for
the side you touched (`make` targets; `.\make.ps1` on Windows).

| Gate | Make target | What it runs |
| --- | --- | --- |
| Lint | `make lint` | `uv run ruff check .`, `npm run lint` |
| Format | `make format` | `uv run ruff format .`, `prettier --write` (CI checks instead — see below) |
| Types | `make type-check` | `uv run mypy app/`, `vue-tsc` over the typed API layer |
| Tests | `make test` | `uv run pytest`, `npm run test` (Vitest, one shot) |
| Scripts | `make test-scripts` | `bats` over `scripts/tests/` (needs `bats`) |

Native commands, if you prefer them to the targets:

```bash
# backend/
uv run ruff check .
uv run ruff format --check .       # fix with: uv run ruff format .
uv run mypy app --ignore-missing-imports
uv run pytest -q

# frontend/  (run npm ci first if node_modules is missing)
npx vitest run                     # not `npm run test:watch`
npm run lint
npx prettier --check "src/**/*.{js,jsx,vue,json,css}" "tests/**/*.{js,ts}"
npm run build
```

Documentation is a gate too: `--strict` turns broken internal links and nav
problems into errors, so keep relative links valid when you move or rename a
page:

```bash
cd backend && uv sync --extra docs
uv run mkdocs build --strict --config-file ../mkdocs.yml
```

### House rules that review will check

- **Test-first.** A bug fix comes with a test that fails without it.
- **Plugins stay self-contained.** No cross-plugin imports; shared code belongs
  in `backend/app/`.
- **Use `loguru`** on the backend, not stdlib `logging`, and `logDebug` /
  `logError` in the frontend.
- **Wrap database writes** in `retry_on_db_locked`.
- **Writable paths come from `settings`** (`data_dir`, `plugins_dir`, …), never
  a relative `Path("data/...")`.
- **Schema-driven UI first** — extend a plugin's `instance_config_schema`
  before writing a custom settings component.
- **No `Co-Authored-By` trailers** or attribution noise in commits, and no AI
  attribution in commits, pull request bodies, or comments.

[CLAUDE.md](CLAUDE.md) has the full backend/frontend/plugin conventions and a
gotchas list; [docs/](docs/index.md) has the deeper guides.

## Pull requests

Fill in the pull request template — summary, a test plan someone else can
follow, and screenshots or a short recording for any UI change (light and dark
theme if you touched both). Link the issue you are closing.

Keep in mind:

- Pull requests target `develop`.
- Small is easier to review: a fix plus its test beats a fix plus a cleanup.
- Documentation changes belong in the same pull request as the behaviour change.
- A maintainer reviews and merges. Please don't merge your own pull request.

## Documentation

Documentation lives in `docs/` and is built with MkDocs Material
(`mkdocs.yml`). Add a new page to the `nav` in `mkdocs.yml`, use relative links,
and preview locally from the repository root:

```bash
cd backend && uv sync --extra docs
uv run mkdocs serve --config-file ../mkdocs.yml
```

The published site's Contributing page (`docs/CONTRIBUTING.md`) is a pointer
back to this file, so there is one source of truth instead of two copies that
drift apart.

## Questions

Not a bug and not a secret? Open a
[discussion or issue](https://github.com/osterbergsimon/calvin/issues/new/choose),
or comment on an existing one. For anything you would rather not say in public,
use the private channel in [SECURITY.md](SECURITY.md).

Thank you for contributing to Calvin!
