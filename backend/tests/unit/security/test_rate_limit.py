"""Per-IP login rate limit with a doubling cooldown (CLV-9)."""

from app.security.admin_auth import LoginRateLimiter


def test_five_failures_then_locked():
    limiter = LoginRateLimiter()
    for _ in range(5):
        limiter.record_failure("1.2.3.4", now=0)
    assert limiter.check("1.2.3.4", now=1) == 59


def test_other_ip_unaffected():
    limiter = LoginRateLimiter()
    for _ in range(5):
        limiter.record_failure("1.2.3.4", now=0)
    assert limiter.check("5.6.7.8", now=1) == 0


def test_cooldown_doubles():
    limiter = LoginRateLimiter()
    ip = "1.2.3.4"
    for _ in range(5):
        limiter.record_failure(ip, now=0)
    assert limiter.check(ip, now=1) == 59

    for _ in range(5):
        limiter.record_failure(ip, now=61)
    assert limiter.check(ip, now=61) == 120

    for _ in range(5):
        limiter.record_failure(ip, now=200)
    assert limiter.check(ip, now=200) == 240


def test_cooldown_capped_at_900():
    limiter = LoginRateLimiter()
    ip = "1.2.3.4"
    now = 0
    for _ in range(12):
        for _ in range(5):
            limiter.record_failure(ip, now=now)
        wait = limiter.check(ip, now=now)
        assert 0 < wait <= 900
        now += wait + 1
    assert limiter.check(ip, now=now) == 0


def test_failures_outside_window_forgotten():
    limiter = LoginRateLimiter()
    ip = "1.2.3.4"
    for _ in range(4):
        limiter.record_failure(ip, now=0)
    limiter.record_failure(ip, now=61)
    assert limiter.check(ip, now=61) == 0


def test_success_clears_failures_but_keeps_lockout_count():
    limiter = LoginRateLimiter()
    ip = "1.2.3.4"
    for _ in range(5):
        limiter.record_failure(ip, now=0)
    limiter.record_success(ip)
    assert limiter.check(ip, now=61) == 0
    # The count survives, so the next lockout doubles from 60 to 120.
    for _ in range(5):
        limiter.record_failure(ip, now=61)
    assert limiter.check(ip, now=61) == 120
