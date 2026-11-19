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
from collections.abc import Callable, Iterable
from typing import Any, cast

from app.plugins.definitions import PluginActionSpec

# String params longer than this are rejected, so an open route cannot carry
# large bodies to a plugin.
MAX_STRING_PARAM = 256
# Plugin error text shown to callers is trimmed to this length.
MAX_ERROR_MESSAGE = 200
# At most this many unknown param names are named in a 422.
MAX_UNKNOWN_SHOWN = 10
# Each unknown name echoed in a 422 is cut to this many characters.
MAX_UNKNOWN_NAME = 64

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


def describe_unknown(kind: str, names: Iterable[Any]) -> str | None:
    """Bounded text naming unknown keys: at most 10 names, each cut to 64 characters.

    The caller may be anonymous and this text is returned and logged, so a probe
    with thousands of long keys must not get them echoed back.
    """
    unknown = sorted(str(name)[:MAX_UNKNOWN_NAME] for name in names)
    if not unknown:
        return None
    shown = ", ".join(unknown[:MAX_UNKNOWN_SHOWN])
    more = len(unknown) - MAX_UNKNOWN_SHOWN
    return f"unknown {kind}(s): {shown}" + (f" and {more} more" if more > 0 else "")


def validate_action_params(spec: PluginActionSpec, params: Any) -> dict[str, str | bool]:
    """Check ``params`` against ``spec`` and return a new dict of declared keys only.

    Types are strict: ``"true"`` and ``1`` are not booleans, and ``5`` is not a
    string. Unknown keys, missing required keys and over-long strings fail.
    """
    if not isinstance(params, dict):
        raise ActionParamsError(["params must be an object"])

    errors: list[str] = []
    unknown_message = describe_unknown("param", (k for k in params if k not in spec.params))
    if unknown_message:
        errors.append(unknown_message)

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


# A running action is cancelled and answered 504 after this many seconds.
ACTION_TIMEOUT_S = 10.0
# At most this many actions run at once per instance.
MAX_IN_FLIGHT = 2


class ActionInFlightLimiter:
    """Per-instance cap on actions still running (the rate limiter counts starts).

    Only keys with a running action are kept: ``release`` drops a key when its
    count reaches zero, so memory stays bounded by the number of instances with
    a running action.
    """

    def __init__(self, limit: int = MAX_IN_FLIGHT) -> None:
        self.limit = limit
        self._running: dict[str, int] = {}

    def try_acquire(self, key: str) -> bool:
        """Take a slot for ``key``; False when ``limit`` actions already run.

        Called from the event loop only, so no lock is needed.
        """
        count = self._running.get(key, 0)
        if count >= self.limit:
            return False
        self._running[key] = count + 1
        return True

    def release(self, key: str) -> None:
        """Give back a slot taken with :meth:`try_acquire`."""
        count = self._running.get(key, 0) - 1
        if count <= 0:
            self._running.pop(key, None)
        else:
            self._running[key] = count

    def tracked_keys(self) -> int:
        """Number of keys with a running action (for tests)."""
        return len(self._running)

    def reset(self) -> None:
        """Forget every key (for tests)."""
        self._running.clear()


action_in_flight = ActionInFlightLimiter()

# One limiter for the process, keyed by instance id.
action_rate_limiter = ActionRateLimiter()
