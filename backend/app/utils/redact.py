"""Helpers that keep credentials out of logs (audit S9, calvin-ua2)."""

from urllib.parse import urlsplit, urlunsplit


def redact_url(url: str) -> str:
    """
    Return ``url`` without userinfo, query string or fragment, which is where
    API keys and tokens usually ride. A dropped query is shown as ``?…``.
    """
    try:
        parts = urlsplit(str(url))
    except ValueError:
        return "<unparseable url>"
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    redacted = urlunsplit((parts.scheme, host, parts.path, "", ""))
    return f"{redacted}?…" if parts.query else redacted
