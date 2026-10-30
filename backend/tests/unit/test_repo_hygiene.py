"""Public-tree hygiene: owner-specific values must not creep back in (CLV-59).

Calvin's examples use neutral placeholders (``calvin.example.com``,
``192.0.2.x``, ``server.local``) so that copying a snippet out of the docs or
tests never leaks the maintainer's own network. This walks the tree and fails
with ``file:line`` for every occurrence of the old values.

The same rule lives in ``.gitleaks.toml`` for CI; this test keeps it fast and
local, and works without the gitleaks binary.
"""

import re
from pathlib import Path

import pytest

# Personal hostnames/domains/IPs that were scrubbed from the public tree.
FORBIDDEN = re.compile(
    r"\bwholab\.xyz\b|\btardis\b|\bosterberg\.co\b|192\.168\.1\.|10\.10\.[0-9]",
    re.IGNORECASE,
)

REPO_ROOT = Path(__file__).resolve().parents[3]

SKIP_DIRS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "coverage",
    "dist",
    "htmlcov",
    "node_modules",
    "site",
}

# These files legitimately contain the forbidden patterns: the scanner config
# and this test itself. gitleaks allowlists the same two paths.
SKIP_FILES = {".gitleaks.toml", "test_repo_hygiene.py"}


def _iter_text_files():
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(REPO_ROOT)
        if path.name in SKIP_FILES:
            continue
        if SKIP_DIRS.intersection(rel.parts):
            continue
        try:
            data = path.read_bytes()
        except OSError:
            continue
        # Skip binaries (images, sqlite files, compiled assets).
        if b"\0" in data[:1024]:
            continue
        yield rel, data.decode("utf-8", errors="ignore")


@pytest.mark.unit
def test_no_owner_specific_hosts_domains_or_ips():
    offenders = []
    for rel, text in _iter_text_files():
        for lineno, line in enumerate(text.splitlines(), 1):
            if FORBIDDEN.search(line):
                offenders.append(f"{rel}:{lineno}: {line.strip()[:160]}")

    assert not offenders, (
        "owner-specific hostnames/domains/IPs leaked back into the public "
        "tree; use calvin.example.com, 192.0.2.x and example.com instead:\n" + "\n".join(offenders)
    )
