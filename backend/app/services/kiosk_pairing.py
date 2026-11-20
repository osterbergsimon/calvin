"""In-memory screen pairings and one-time install codes (calvin-0xns).

A pairing is the short-lived link between a screen's secret and the person who
approves it in Settings. It is not a database row: losing a pending code to a
restart costs one more minute of waiting, and it keeps the secret entirely out
of the database until it is approved (only its SHA-256 is stored then).

This module is pure and stdlib-only: it knows nothing about FastAPI or Ormar,
so the limits and the wire formats can be tested without a server or a database.
"""

import hashlib
import hmac
import math
import re
import secrets
import threading
import time
from dataclasses import dataclass

from app.security.admin_auth import LoginRateLimiter

SECRET_PREFIX = "clv_kiosk_"
INSTALL_PREFIX = "clv_pair_"

# No 0/O, 1/I/L or U: a code read off a screen and typed on a phone.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LEN = 6
CODE_TTL_S = 600
INSTALL_TTL_S = 1800

# Limits (design §2 and the Global Constraints).
PER_ADDRESS_MAX = 20
PER_ADDRESS_WINDOW_S = 600
PER_KIOSK_MAX = 3
QUIET_S = 120  # an entry asked about within this window is never evicted
GLOBAL_MAX = 200
INSTALL_MAX = 5

_SECRET_RE = re.compile(r"^clv_kiosk_[A-Za-z0-9_-]{43}$")
_INSTALL_RE = re.compile(r"^clv_pair_[A-Za-z0-9_-]{22,64}$")


class RateLimited(Exception):  # noqa: N818 - the plan's name for the 429 answer
    """A pairing attempt hit a limit; ``wait`` is the whole seconds to retry after."""

    def __init__(self, wait: int):
        super().__init__(f"try again in {wait} seconds")
        self.wait = max(1, int(wait))


def new_secret() -> str:
    """A fresh screen secret: ``clv_kiosk_`` plus 43 URL-safe characters."""
    return SECRET_PREFIX + secrets.token_urlsafe(32)


def is_secret(value: object) -> bool:
    """Whether ``value`` has exactly the shape of a screen secret."""
    return isinstance(value, str) and _SECRET_RE.fullmatch(value) is not None


def is_install_code(value: object) -> bool:
    """Whether ``value`` has the shape of a one-time install code."""
    return isinstance(value, str) and _INSTALL_RE.fullmatch(value) is not None


def hash_secret(secret: str) -> str:
    """The only form of a secret the server ever stores: its SHA-256 hex."""
    return hashlib.sha256(secret.encode()).hexdigest()


def fingerprint(secret_hash: str) -> str:
    """The 16-hex fingerprint a kiosk cookie carries, never the hash itself."""
    return secret_hash[:16]


def normalize_code(typed: str) -> str | None:
    """``"k7q-4md"`` -> ``"K7Q4MD"``; None when it cannot be a code."""
    if not isinstance(typed, str):
        return None
    code = typed.strip().replace("-", "").upper()
    if len(code) != CODE_LEN or any(char not in CODE_ALPHABET for char in code):
        return None
    return code


def format_code(code: str) -> str:
    """``"K7Q4MD"`` -> ``"K7Q-4MD"``: the display form a person types (``XXX-XXX``)."""
    return f"{code[:3]}-{code[3:]}"


def _new_code(taken: set[str]) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        if code not in taken:
            return code


@dataclass
class Pending:
    """One live pairing: a screen asking to be approved, with its short code."""

    kiosk_id: str
    secret_hash: str
    code: str
    created: float
    expires: float
    peer: str
    hostname: str | None
    by_agent: bool
    last_asked: float


@dataclass
class _InstallCode:
    code_hash: str
    created: float
    expires: float


class PairingStore:
    """Pending pairings and install codes, in memory and behind one lock.

    The clock is injected (``now``) everywhere so the limits and lifetimes are
    testable, and take-by-code is one locked operation: two Settings tabs that
    type the same code cannot both win.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: list[Pending] = []
        self._install_codes: list[_InstallCode] = []
        self._new_by_address: dict[str, list[float]] = {}

    # -- pending pairings ------------------------------------------------

    def _prune(self, now: float) -> None:
        self._pending = [pending for pending in self._pending if pending.expires > now]
        live_addresses = {
            peer: [stamp for stamp in stamps if now - stamp < PER_ADDRESS_WINDOW_S]
            for peer, stamps in self._new_by_address.items()
        }
        self._new_by_address = {peer: stamps for peer, stamps in live_addresses.items() if stamps}

    def _find(self, kiosk_id: str, secret_hash: str) -> Pending | None:
        for pending in self._pending:
            if pending.kiosk_id == kiosk_id and hmac.compare_digest(
                pending.secret_hash, secret_hash
            ):
                return pending
        return None

    def start(
        self,
        kiosk_id: str,
        secret_hash: str,
        peer: str,
        hostname: str | None = None,
        by_agent: bool = True,
        now: float | None = None,
    ) -> Pending:
        """Start or continue a pairing for ``(kiosk_id, secret_hash)``.

        The same hash always gets the same entry and code. A new entry is
        refused with :class:`RateLimited` when the address has made 20 new ones
        in ten minutes, when the screen already has three live ones that were
        all asked about in the last two minutes, or when 200 are live.
        """
        current = time.time() if now is None else now
        with self._lock:
            self._prune(current)
            existing = self._find(kiosk_id, secret_hash)
            if existing is not None:
                existing.last_asked = current
                return existing

            recent = self._new_by_address.get(peer, [])
            if len(recent) >= PER_ADDRESS_MAX:
                oldest = min(recent)
                raise RateLimited(math.ceil(oldest + PER_ADDRESS_WINDOW_S - current))
            if len(self._pending) >= GLOBAL_MAX:
                raise RateLimited(60)

            siblings = [pending for pending in self._pending if pending.kiosk_id == kiosk_id]
            if len(siblings) >= PER_KIOSK_MAX:
                evictable = [
                    pending for pending in siblings if current - pending.last_asked >= QUIET_S
                ]
                if not evictable:
                    newest_ask = max(pending.last_asked for pending in siblings)
                    raise RateLimited(math.ceil(newest_ask + QUIET_S - current))
                self._pending.remove(min(evictable, key=lambda pending: pending.created))

            pending = Pending(
                kiosk_id=kiosk_id,
                secret_hash=secret_hash,
                code=_new_code({entry.code for entry in self._pending}),
                created=current,
                expires=current + CODE_TTL_S,
                peer=peer,
                hostname=hostname,
                by_agent=by_agent,
                last_asked=current,
            )
            self._pending.append(pending)
            self._new_by_address.setdefault(peer, []).append(current)
            return pending

    def pending_for(
        self, kiosk_id: str, secret_hash: str, now: float | None = None
    ) -> Pending | None:
        """The live entry for this screen and secret, refreshing ``last_asked``."""
        current = time.time() if now is None else now
        with self._lock:
            self._prune(current)
            pending = self._find(kiosk_id, secret_hash)
            if pending is not None:
                pending.last_asked = current
            return pending

    def live(self, now: float | None = None) -> list[Pending]:
        """Every live pending pairing, newest last."""
        current = time.time() if now is None else now
        with self._lock:
            self._prune(current)
            return list(self._pending)

    def has_agent_pending(self, kiosk_id: str, now: float | None = None) -> bool:
        """Whether this screen's agent started a live pairing itself."""
        return any(pending.kiosk_id == kiosk_id and pending.by_agent for pending in self.live(now))

    def take_by_code(self, code: str, now: float | None = None) -> Pending | None:
        """Approve one code, atomically, and drop that screen's other entries.

        Returns the winning entry, or None for a wrong, expired or already used
        code. The code is matched case-insensitively with the dash ignored.
        """
        normalized = normalize_code(code)
        if normalized is None:
            return None
        current = time.time() if now is None else now
        with self._lock:
            self._prune(current)
            winner = next(
                (pending for pending in self._pending if pending.code == normalized), None
            )
            if winner is None:
                return None
            self._pending = [
                pending for pending in self._pending if pending.kiosk_id != winner.kiosk_id
            ]
            return winner

    def drop_kiosk(self, kiosk_id: str) -> None:
        """Forget every pending pairing of a removed screen."""
        with self._lock:
            self._pending = [pending for pending in self._pending if pending.kiosk_id != kiosk_id]

    # -- one-time install codes ------------------------------------------

    def _prune_install(self, now: float) -> None:
        self._install_codes = [entry for entry in self._install_codes if entry.expires > now]

    def mint_install_code(self, now: float | None = None) -> tuple[str, float]:
        """A fresh one-time code and its expiry; only its hash is kept."""
        current = time.time() if now is None else now
        with self._lock:
            self._prune_install(current)
            if len(self._install_codes) >= INSTALL_MAX:
                self._install_codes.remove(min(self._install_codes, key=lambda e: e.created))
            code = INSTALL_PREFIX + secrets.token_urlsafe(24)
            expires = current + INSTALL_TTL_S
            self._install_codes.append(_InstallCode(hash_secret(code), current, expires))
            return code, expires

    def use_install_code(self, code: str, now: float | None = None) -> bool:
        """Consume a live install code; False when it is unknown, used or expired."""
        if not is_install_code(code):
            return False
        candidate = hash_secret(code)
        current = time.time() if now is None else now
        with self._lock:
            self._prune_install(current)
            for entry in self._install_codes:
                if hmac.compare_digest(candidate, entry.code_hash):
                    self._install_codes.remove(entry)
                    return True
            return False


pairing_store = PairingStore()
# Wrong approval codes get their own bucket (calvin-0xns), like the login form's.
approve_limiter = LoginRateLimiter()
