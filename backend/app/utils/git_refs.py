"""Validation for the git repo URL and branch used by the updater (audit S6/S7).

These values reach ``git`` and ``update-calvin.sh`` (which sources
/etc/default/calvin-update as shell), so they are checked strictly.
"""

import re

# https only, no userinfo/query/fragment, no shell metacharacters or whitespace.
_GIT_REPO_URL_RE = re.compile(r"https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%+/-]*)?")
# A conservative subset of git's ref-name rules.
_GIT_BRANCH_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}")


def validate_git_repo_url(url: str) -> str:
    """Accept a plain https:// git URL, or "" for the update script's default."""
    if url == "":
        return url
    if not isinstance(url, str) or not _GIT_REPO_URL_RE.fullmatch(url):
        raise ValueError("Repository URL must be a plain https:// URL")
    return url


def validate_git_branch(branch: str) -> str:
    """Accept a safe git branch name, or "" for the update script's default."""
    if branch == "":
        return branch
    if (
        not isinstance(branch, str)
        or not _GIT_BRANCH_RE.fullmatch(branch)
        or ".." in branch
        or "//" in branch
        or branch.endswith(("/", ".", ".lock"))
    ):
        raise ValueError("Invalid branch name")
    return branch
