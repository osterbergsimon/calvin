"""Host-side helpers for declared plugin actions (homey switch tiles §1–§2).

The action route is open to anonymous callers, so everything a plugin's
``perform_action`` receives has been checked here first: only declared
params, of the declared type, with string length capped. Errors a plugin
raises on purpose are ``PluginActionError`` (shown on screen, so they must
hold no secrets); ``PluginActionRefused`` marks a call the plugin's own
allowlist rejected.
"""

import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Any, cast

from app.plugins.definitions import PluginActionSpec

# String params longer than this are rejected, so an open route cannot carry
# large bodies to a plugin.
MAX_STRING_PARAM = 256
# Plugin error text shown to callers is trimmed to this length.
MAX_ERROR_MESSAGE = 200
# At most this many unknown param names are named in a 422.
MAX_UNKNOWN_SHOWN = 10

_PY_TYPES: dict[str, type] = {"string": str, "boolean": bool}


class PluginActionError(Exception):
    """A plugin action failed in a way the caller should see (host maps to 502).

    ``message`` is plain words shown on screen to anyone at the screen: it must
    never hold secrets, config values or exception text.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PluginActionRefused(PluginActionError):  # noqa: N818 - name fixed by the plan
    """The plugin refused this call, e.g. a device not on its allowlist (403)."""


class ActionParamsError(ValueError):
    """Params did not match the declared action spec (host maps to 422).

    ``errors`` names the problem per key; it never echoes the values sent.
    """

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


def validate_action_params(spec: PluginActionSpec, params: Any) -> dict[str, str | bool]:
    """Check ``params`` against ``spec`` and return a new dict of declared keys only.

    Types are strict: ``"true"`` and ``1`` are not booleans, and ``5`` is not a
    string. Unknown keys, missing required keys and over-long strings fail.
    """
    if not isinstance(params, dict):
        raise ActionParamsError(["params must be an object"])

    errors: list[str] = []
    unknown = sorted(str(key)[:64] for key in params if key not in spec.params)
    if unknown:
        # Bounded: the caller may be anonymous, and this list is returned and logged.
        shown = ", ".join(unknown[:MAX_UNKNOWN_SHOWN])
        more = len(unknown) - MAX_UNKNOWN_SHOWN
        errors.append(f"unknown param(s): {shown}" + (f" and {more} more" if more > 0 else ""))

    clean: dict[str, str | bool] = {}
    for key, param in spec.params.items():
        if key not in params:
            if param.required:
                errors.append(f"{key}: required")
            continue
        value: Any = params[key]
        # type(...) is not, so a bool subclass of int never counts as a string
        # and an int never counts as a bool.
        if type(value) is not _PY_TYPES[param.type]:
            errors.append(f"{key}: must be a {param.type}")
            continue
        if isinstance(value, str) and len(value) > MAX_STRING_PARAM:
            errors.append(f"{key}: longer than {MAX_STRING_PARAM} characters")
            continue
        clean[key] = cast(str | bool, value)

    if errors:
        raise ActionParamsError(errors)
    return clean


class ActionRateLimiter:
    """In-memory sliding window: at most ``limit`` calls per ``window`` per key."""

    def __init__(
        self,
        limit: int = 5,
        window: float = 1.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window = window
        self.clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Record a call for ``key`` and return whether it is within the limit."""
        now = self.clock()
        cutoff = now - self.window
        with self._lock:
            # Drop expired hits everywhere so idle keys do not accumulate.
            for k in list(self._hits):
                hits = self._hits[k]
                while hits and hits[0] <= cutoff:
                    hits.popleft()
                if not hits:
                    del self._hits[k]
            hits = self._hits.setdefault(key, deque())
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def tracked_keys(self) -> int:
        """Number of keys with hits still inside the window (for tests)."""
        with self._lock:
            return len(self._hits)

    def reset(self) -> None:
        """Forget every key (for tests)."""
        with self._lock:
            self._hits.clear()


# One limiter for the process, keyed by instance id.
action_rate_limiter = ActionRateLimiter()
